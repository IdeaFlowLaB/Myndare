#!/usr/bin/env node
/**
 * check-seo.js
 *
 * 對全站 HTML 做 SEO 一致性檢查，確保 CLAUDE.md「通用 SEO 標準」沒有被破壞。
 *
 * 用法：node scripts/check-seo.js
 *
 * Exit code：
 *   0 = 全部通過
 *   1 = 有任何 error
 *
 * 檢查項目（每個非 404、非 redirect 頁面）：
 *   A. canonical 存在
 *   B. og:url 等於 canonical
 *   C. 主 JSON-LD schema 的 url 等於 canonical（若有 url 欄位）
 *   D. BreadcrumbList 最後一項 item 等於 canonical（若有 BreadcrumbList）
 *   E. canonical 必須出現在 sitemap.xml 的 <loc>
 *   F. 必填 head 元素：charset / viewport / title / description / og:image / RSS alternate
 *   G. og:image 是絕對 URL（https://）
 *   H. favicon 用絕對路徑（/favicon.ico）
 *
 * 對 redirect 頁面（meta refresh）：只檢查 A、B、H、charset / viewport
 * 對 404.html（noindex 且故意無 canonical）：只檢查 H、charset / viewport
 *
 * 反向檢查：sitemap.xml 的每個 <loc> 都應該對應到至少一個 HTML 的 canonical。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP_FILE = path.join(ROOT, 'sitemap.xml');

// 掃描 HTML 時要跳過的目錄
const SKIP_DIRS = new Set([
  '.git',
  '.claude',
  '.playwright-mcp',
  'node_modules',
  'scripts',
  'plan',
]);

// noindex utility 頁面：JS-only SPA 殼頁（需 query param 才渲染），不該被收錄
// 跟 404.html 一樣只檢查 charset/viewport/favicon，不檢查 canonical/sitemap/JSON-LD/RSS
const NOINDEX_UTILITIES = new Set([
  'licenseking/r/index.html',
]);

// ============================================================================
// 抽取工具
// ============================================================================

function findAllHtml(dir, relPath = '') {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.well-known') {
      // 跳過所有點開頭的目錄（.git, .claude 等）
      continue;
    }
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel = relPath ? `${relPath}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...findAllHtml(full, rel));
    } else if (e.name.endsWith('.html')) {
      out.push({ full, rel });
    }
  }
  return out;
}

function extractAttr(html, tagPattern, attrName) {
  // 抽出 <tag ... attrName="value" ...> 的 value
  const re = new RegExp(`<${tagPattern}[^>]*\\s${attrName}="([^"]*)"[^>]*>`, 'i');
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractMeta(html, key) {
  // 找 <meta name="key" content="..."> 或 <meta property="key" content="...">
  // content 可能在 name/property 之前或之後
  const patterns = [
    new RegExp(`<meta[^>]*\\sname="${key}"[^>]*\\scontent="([^"]*)"[^>]*>`, 'i'),
    new RegExp(`<meta[^>]*\\scontent="([^"]*)"[^>]*\\sname="${key}"[^>]*>`, 'i'),
    new RegExp(`<meta[^>]*\\sproperty="${key}"[^>]*\\scontent="([^"]*)"[^>]*>`, 'i'),
    new RegExp(`<meta[^>]*\\scontent="([^"]*)"[^>]*\\sproperty="${key}"[^>]*>`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractCanonical(html) {
  const m = html.match(/<link[^>]*\srel="canonical"[^>]*\shref="([^"]*)"/i)
    || html.match(/<link[^>]*\shref="([^"]*)"[^>]*\srel="canonical"/i);
  return m ? m[1] : null;
}

function extractFaviconHrefs(html) {
  // 找所有 <link rel="icon" ... href="..."> 的 href
  const out = [];
  const re = /<link[^>]*\srel="icon"[^>]*\shref="([^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  // 也支援 href 在 rel 之前的順序
  const re2 = /<link[^>]*\shref="([^"]*)"[^>]*\srel="icon"/gi;
  while ((m = re2.exec(html)) !== null) out.push(m[1]);
  return out;
}

function extractRssAlternate(html) {
  return /<link[^>]*\srel="alternate"[^>]*type="application\/rss\+xml"/i.test(html);
}

function extractMetaRefresh(html) {
  return /<meta[^>]*\shttp-equiv="refresh"/i.test(html);
}

function extractRobots(html) {
  return extractMeta(html, 'robots') || '';
}

function extractAllJsonLd(html) {
  const out = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1]));
    } catch (e) {
      // 略過無法 parse 的（會在規則裡警告）
    }
  }
  return out;
}

function findMainSchema(jsonLds) {
  // 主 schema = 第一個 @type 不是 BreadcrumbList 的
  for (const ld of jsonLds) {
    const type = ld['@type'];
    if (Array.isArray(type)) {
      if (!type.includes('BreadcrumbList')) return ld;
    } else if (type !== 'BreadcrumbList') {
      return ld;
    }
  }
  return null;
}

function findBreadcrumb(jsonLds) {
  for (const ld of jsonLds) {
    const type = ld['@type'];
    if (type === 'BreadcrumbList' || (Array.isArray(type) && type.includes('BreadcrumbList'))) {
      return ld;
    }
  }
  return null;
}

function getBreadcrumbLastItem(breadcrumb) {
  if (!breadcrumb || !Array.isArray(breadcrumb.itemListElement)) return null;
  const list = breadcrumb.itemListElement;
  if (list.length === 0) return null;
  const last = list[list.length - 1];
  if (!last) return null;
  // item 可能是字串或 object，object 用 @id
  if (typeof last.item === 'string') return last.item;
  if (last.item && typeof last.item === 'object') {
    return last.item['@id'] || last.item.url || null;
  }
  return null;
}

function extractSitemapLocs(xml) {
  const out = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

// ============================================================================
// 規則
// ============================================================================

function checkPage(file, sitemapLocs) {
  const html = fs.readFileSync(file.full, 'utf8');
  const issues = [];
  const rel = file.rel.replace(/\\/g, '/');

  const isRedirect = extractMetaRefresh(html);
  const robots = extractRobots(html);
  const isNoindex = /noindex/i.test(robots);
  // 404 頁的特徵：noindex 且檔名是 404.html
  const is404 = isNoindex && rel === '404.html';
  // utility 頁：JS-only SPA 殼頁，需要白名單登記 + 必須有 noindex
  const isNoindexUtility = NOINDEX_UTILITIES.has(rel);
  if (isNoindexUtility && !isNoindex) {
    issues.push({
      rule: 'X-utility-noindex',
      message: '工具頁面（NOINDEX_UTILITIES 白名單內）必須有 <meta name="robots" content="noindex,...">',
    });
  }

  // ---------- 共通必填項目 ----------
  if (!/<meta\s+charset="UTF-8"/i.test(html)) {
    issues.push({ rule: 'F-charset', message: '缺 <meta charset="UTF-8">' });
  }
  if (!extractMeta(html, 'viewport')) {
    issues.push({ rule: 'F-viewport', message: '缺 <meta name="viewport">' });
  }

  // ---------- favicon 路徑必須是絕對 ----------
  const favs = extractFaviconHrefs(html);
  if (favs.length === 0) {
    issues.push({ rule: 'H-favicon', message: '完全找不到 favicon link' });
  } else {
    for (const f of favs) {
      if (!f.startsWith('/')) {
        issues.push({
          rule: 'H-favicon',
          message: `favicon 路徑「${f}」不是絕對路徑（應為 /favicon.ico 或 /favicon.png）`,
        });
      }
    }
  }

  // 404 / noindex utility 頁面只檢查到這裡（故意無 canonical / og:url / sitemap entry）
  if (is404 || isNoindexUtility) {
    return { rel, issues, kind: isNoindexUtility ? 'utility' : '404' };
  }

  // ---------- canonical 必須存在 ----------
  const canonical = extractCanonical(html);
  if (!canonical) {
    issues.push({ rule: 'A-canonical', message: '缺 <link rel="canonical">' });
    return { rel, issues, kind: isRedirect ? 'redirect' : 'page' };
  }

  // ---------- og:url 必須等於 canonical ----------
  const ogUrl = extractMeta(html, 'og:url');
  if (!ogUrl) {
    issues.push({ rule: 'B-og-url', message: '缺 <meta property="og:url">' });
  } else if (ogUrl !== canonical) {
    issues.push({
      rule: 'B-og-url',
      message: `og:url「${ogUrl}」不等於 canonical「${canonical}」`,
    });
  }

  // ---------- redirect 頁到此為止（不檢查 ld+json / sitemap / 內容類元素） ----------
  if (isRedirect) {
    return { rel, issues, kind: 'redirect' };
  }

  // ---------- 內容類必填（標題、描述、og:image、RSS alternate） ----------
  if (!/<title>[^<]+<\/title>/i.test(html)) {
    issues.push({ rule: 'F-title', message: '缺 <title> 或 title 為空' });
  }
  const description = extractMeta(html, 'description');
  if (!description) {
    issues.push({ rule: 'F-description', message: '缺 <meta name="description">' });
  }
  const ogImage = extractMeta(html, 'og:image');
  if (!ogImage) {
    issues.push({ rule: 'F-og-image', message: '缺 <meta property="og:image">' });
  } else if (!/^https?:\/\//i.test(ogImage)) {
    issues.push({
      rule: 'G-og-image-abs',
      message: `og:image「${ogImage}」不是絕對 URL（應以 https:// 開頭）`,
    });
  }
  if (!extractRssAlternate(html)) {
    issues.push({ rule: 'F-rss', message: '缺 <link rel="alternate" type="application/rss+xml">' });
  }

  // ---------- JSON-LD 一致性 ----------
  const jsonLds = extractAllJsonLd(html);
  const mainSchema = findMainSchema(jsonLds);
  if (mainSchema && typeof mainSchema.url === 'string' && mainSchema.url !== canonical) {
    issues.push({
      rule: 'C-jsonld-url',
      message: `主 schema (${mainSchema['@type']}) 的 url「${mainSchema.url}」不等於 canonical「${canonical}」`,
    });
  }

  const breadcrumb = findBreadcrumb(jsonLds);
  if (breadcrumb) {
    const lastItem = getBreadcrumbLastItem(breadcrumb);
    if (lastItem && lastItem !== canonical) {
      issues.push({
        rule: 'D-breadcrumb',
        message: `BreadcrumbList 最後一項 item「${lastItem}」不等於 canonical「${canonical}」`,
      });
    }
  }

  // ---------- 必須出現在 sitemap.xml ----------
  if (!sitemapLocs.includes(canonical)) {
    issues.push({
      rule: 'E-sitemap',
      message: `canonical「${canonical}」不在 sitemap.xml 的 <loc> 中`,
    });
  }

  return { rel, issues, kind: 'page' };
}

// ============================================================================
// 主程式
// ============================================================================

function main() {
  if (!fs.existsSync(SITEMAP_FILE)) {
    console.error('找不到 sitemap.xml');
    process.exit(1);
  }
  const sitemapXml = fs.readFileSync(SITEMAP_FILE, 'utf8');
  const sitemapLocs = extractSitemapLocs(sitemapXml);

  const files = findAllHtml(ROOT);
  files.sort((a, b) => a.rel.localeCompare(b.rel));

  console.log(`掃描 ${files.length} 個 HTML，sitemap 共 ${sitemapLocs.length} 個 <loc>\n`);

  const results = files.map(f => checkPage(f, sitemapLocs));

  let errorCount = 0;
  let passCount = 0;

  for (const r of results) {
    const tag = r.kind === '404' ? '[404]' : r.kind === 'utility' ? '[utility]' : r.kind === 'redirect' ? '[redirect]' : '[page]';
    if (r.issues.length === 0) {
      console.log(`  ✓ ${tag.padEnd(11)} ${r.rel}`);
      passCount++;
    } else {
      console.log(`  ✗ ${tag.padEnd(11)} ${r.rel}`);
      for (const issue of r.issues) {
        console.log(`        ${issue.rule}: ${issue.message}`);
      }
      errorCount += r.issues.length;
    }
  }

  // 反向：sitemap loc 必須對應到至少一個 HTML 的 canonical
  console.log('\n反向檢查 sitemap.xml...');
  const allCanonicals = new Set(
    results.flatMap(r => {
      const html = fs.readFileSync(files.find(f => f.rel.replace(/\\/g, '/') === r.rel).full, 'utf8');
      const c = extractCanonical(html);
      return c ? [c] : [];
    })
  );
  const orphanLocs = sitemapLocs.filter(loc => !allCanonicals.has(loc));
  if (orphanLocs.length === 0) {
    console.log(`  ✓ ${sitemapLocs.length} 個 <loc> 全部對應到某個 HTML 的 canonical`);
  } else {
    console.log(`  ✗ ${orphanLocs.length} 個孤兒 <loc>（找不到對應的 canonical）：`);
    for (const loc of orphanLocs) console.log(`        ${loc}`);
    errorCount += orphanLocs.length;
  }

  console.log('\n────────────────────────────────────────');
  if (errorCount === 0) {
    console.log(`✓ 全部通過（${passCount}/${files.length} HTML，sitemap 100% 對齊）`);
    process.exit(0);
  } else {
    console.log(`✗ 共 ${errorCount} 個問題（${passCount}/${files.length} HTML 通過）`);
    process.exit(1);
  }
}

main();
