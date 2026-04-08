#!/usr/bin/env node
/**
 * update-home.js
 *
 * 掃描 blog/*.html，從每篇文章的 JSON-LD Article schema 抓出 metadata，
 * 排序後取最新 3 篇，重新產生 index.html 中的 latest-posts 區塊。
 *
 * 用法：node scripts/update-home.js
 *
 * 文章必須包含的 JSON-LD 欄位：
 *   - headline       → 卡片 h3
 *   - datePublished  → 卡片日期，也用來排序
 *   - keywords       → 逗號分隔，最後一個自動套 purple class
 *
 * 卡片的描述用 og:description（不是 JSON-LD description），
 * 因為 og:description 通常比較精簡、適合卡片顯示。
 *
 * marker：index.html 中 <!-- AUTO:LATEST_POSTS:START --> 跟 END 之間的內容會被取代。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');
const INDEX_FILE = path.join(ROOT, 'index.html');
const MARKER_START = '<!-- AUTO:LATEST_POSTS:START -->';
const MARKER_END = '<!-- AUTO:LATEST_POSTS:END -->';
const TOP_N = 3;

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
}

main();
