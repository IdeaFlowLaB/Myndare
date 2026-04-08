#!/usr/bin/env node
/**
 * update-home.js
 *
 * 掃描 blog/*.html，從每篇文章的 JSON-LD Article schema 抓出 metadata，
 * 然後做兩件事：
 *   1. 重新產生 index.html 中的 latest-posts 區塊（最新 3 篇）
 *   2. 重新產生 feed.xml（RSS 2.0，全部文章）
 *
 * 用法：node scripts/update-home.js
 *
 * 文章必須包含的 JSON-LD 欄位：
 *   - headline       → 卡片 h3 / RSS title
 *   - datePublished  → 卡片日期 / RSS pubDate，也用來排序
 *   - keywords       → 逗號分隔，最後一個自動套 purple class / RSS category
 *
 * 卡片的描述用 og:description（不是 JSON-LD description），
 * 因為 og:description 通常比較精簡、適合卡片顯示跟 RSS preview。
 *
 * marker：index.html 中 <!-- AUTO:LATEST_POSTS:START --> 跟 END 之間的內容會被取代。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');
const INDEX_FILE = path.join(ROOT, 'index.html');
const FEED_FILE = path.join(ROOT, 'feed.xml');
const MARKER_START = '<!-- AUTO:LATEST_POSTS:START -->';
const MARKER_END = '<!-- AUTO:LATEST_POSTS:END -->';
const TOP_N = 3;

const SITE_URL = 'https://myndare.com';
const FEED_URL = `${SITE_URL}/feed.xml`;
const BLOG_URL = `${SITE_URL}/blog/`;
const FEED_TITLE = 'Myndare Blog';
const FEED_DESCRIPTION = '專案管理實戰、AI 工具應用、個人成長心法。PMP 認證 PM 的第一手分享。';
const FEED_AUTHOR = 'hello@myndare.com (Wade Wang)';

function extractFirstArticleJsonLd(html) {
  // 抓所有 ld+json script，找第一個 @type 是 Article 的
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const json = JSON.parse(m[1]);
      if (json['@type'] === 'Article' || json['@type'] === 'BlogPosting') {
        return json;
      }
    } catch (e) {
      // 略過無法 parse 的
    }
  }
  return null;
}

function extractMeta(html, name) {
  // 同時支援 name="..." 跟 property="..."
  const patterns = [
    new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i'),
    new RegExp(`<meta\\s+property="${name}"\\s+content="([^"]*)"`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ISO date "2026-04-03" → RFC 822 "Thu, 03 Apr 2026 00:00:00 +0800"
// 用台北時區（+08:00）解讀文章的發布日期，輸出時保留 +0800 offset。
function toRfc822(isoDate) {
  const d = new Date(`${isoDate}T00:00:00+08:00`);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // 在 +08:00 時區下，原始 00:00 對應 UTC 16:00 前一天。為了讓 RSS 顯示的日期就是文章日期，
  // 我們直接用台北時區重新組裝。
  const tzOffsetMin = 8 * 60;
  const taipeiMs = d.getTime() + tzOffsetMin * 60 * 1000;
  const t = new Date(taipeiMs);
  const day = days[t.getUTCDay()];
  const date = String(t.getUTCDate()).padStart(2, '0');
  const month = months[t.getUTCMonth()];
  const year = t.getUTCFullYear();
  const h = String(t.getUTCHours()).padStart(2, '0');
  const m = String(t.getUTCMinutes()).padStart(2, '0');
  const s = String(t.getUTCSeconds()).padStart(2, '0');
  return `${day}, ${date} ${month} ${year} ${h}:${m}:${s} +0800`;
}

function readPosts() {
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html') && f !== 'index.html');
  const posts = [];

  for (const file of files) {
    const fullPath = path.join(BLOG_DIR, file);
    const html = fs.readFileSync(fullPath, 'utf8');
    const ld = extractFirstArticleJsonLd(html);

    if (!ld) {
      console.warn(`  ⚠ ${file}: 找不到 Article JSON-LD，略過`);
      continue;
    }

    if (!ld.headline || !ld.datePublished) {
      console.warn(`  ⚠ ${file}: Article JSON-LD 缺少 headline 或 datePublished，略過`);
      continue;
    }

    const description = extractMeta(html, 'og:description') || extractMeta(html, 'description') || '';
    const keywords = (ld.keywords || '').split(',').map(s => s.trim()).filter(Boolean);

    posts.push({
      file,
      url: `blog/${file}`,
      headline: ld.headline,
      description,
      datePublished: ld.datePublished,
      keywords,
    });
  }

  // 依日期降序排序（新的在前）
  posts.sort((a, b) => b.datePublished.localeCompare(a.datePublished));

  return posts;
}

function renderPostCard(post) {
  const tagsHtml = post.keywords
    .map((tag, i, arr) => {
      const isLast = i === arr.length - 1;
      const cls = isLast && arr.length > 1 ? 'post-tag purple' : 'post-tag';
      return `          <span class="${cls}">${escapeHtml(tag)}</span>`;
    })
    .join('\n');

  return `      <a href="${post.url}" class="post-card">
        <div class="post-card-date">${post.datePublished}</div>
        <h3>${escapeHtml(post.headline)}</h3>
        <p>${escapeHtml(post.description)}</p>
        <div class="post-card-tags">
${tagsHtml}
        </div>
      </a>`;
}

function updateIndex(latestPosts) {
  const indexHtml = fs.readFileSync(INDEX_FILE, 'utf8');

  const startIdx = indexHtml.indexOf(MARKER_START);
  const endIdx = indexHtml.indexOf(MARKER_END);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`找不到 marker：${MARKER_START} 或 ${MARKER_END}`);
  }
  if (endIdx < startIdx) {
    throw new Error('END marker 在 START marker 之前');
  }

  const before = indexHtml.slice(0, startIdx + MARKER_START.length);
  const after = indexHtml.slice(endIdx);

  const cards = latestPosts.map(renderPostCard).join('\n');
  const newSection = `${before}\n${cards}\n      ${after}`;

  fs.writeFileSync(INDEX_FILE, newSection, 'utf8');
}

function renderFeedItem(post) {
  const url = `${SITE_URL}/${post.url}`;
  const categoriesXml = post.keywords
    .map(k => `      <category>${escapeXml(k)}</category>`)
    .join('\n');
  return `    <item>
      <title>${escapeXml(post.headline)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${escapeXml(post.description)}</description>
      <pubDate>${toRfc822(post.datePublished)}</pubDate>
      <author>${escapeXml(FEED_AUTHOR)}</author>
${categoriesXml}
    </item>`;
}

function generateFeed(allPosts) {
  // lastBuildDate 用最新一篇文章的日期，這樣只要文章沒變動，feed.xml 就會是 deterministic 的（不會每次跑 script 都產生新的 diff）。
  const latestDate = allPosts[0]?.datePublished;
  const lastBuildDate = latestDate ? toRfc822(latestDate) : new Date().toUTCString();

  const items = allPosts.map(renderFeedItem).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${BLOG_URL}</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>zh-tw</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${FEED_URL}" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_URL}/Myndare.png</url>
      <title>${escapeXml(FEED_TITLE)}</title>
      <link>${BLOG_URL}</link>
    </image>
${items}
  </channel>
</rss>
`;

  fs.writeFileSync(FEED_FILE, xml, 'utf8');
}

function main() {
  console.log('掃描 blog/ 文章...');
  const allPosts = readPosts();
  console.log(`  找到 ${allPosts.length} 篇文章`);

  const latest = allPosts.slice(0, TOP_N);
  console.log(`\n取最新 ${latest.length} 篇：`);
  for (const p of latest) {
    console.log(`  ${p.datePublished}  ${p.headline}`);
    console.log(`              tags: ${p.keywords.join(', ')}`);
  }

  console.log('\n更新 index.html...');
  updateIndex(latest);
  console.log('  ✓ 完成');

  console.log('\n更新 feed.xml...');
  generateFeed(allPosts);
  console.log(`  ✓ 完成（${allPosts.length} 篇）`);
}

main();
