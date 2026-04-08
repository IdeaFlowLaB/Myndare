# Myndare.com — 給 Claude Code 的專案指南

靜態 HTML 網站，部署在 GitHub Pages，自訂網域 `myndare.com`（CNAME 已設）。
Push 到 `main` 後 GitHub Pages 自動部署。沒有 build pipeline，也沒有 Jekyll 設定，是純 HTML/CSS/JS。

## 目錄結構

```
/
├── index.html              首頁
├── contact.html            聯絡頁
├── blog/
│   ├── index.html          部落格列表
│   └── *.html              個別文章
├── products/
│   ├── license-king.html
│   └── pm-simulator.html
├── scripts/
│   └── update-home.js      自動更新首頁最新文章區塊
├── sitemap.xml
├── robots.txt
├── llms.txt
├── CNAME                   myndare.com
├── Myndare.png             logo
└── favicon.ico / favicon.png
```

`plan/` 跟 `.playwright-mcp/` 都在 `.gitignore` 裡。

## SEO canonical 策略（重要）

整個網站的 canonical 一律使用**乾淨目錄網址**，不用 `index.html`：

- 首頁 → `https://myndare.com/`（不是 `/index.html`）
- 部落格首頁 → `https://myndare.com/blog/`（不是 `/blog/index.html`）
- 文章頁、產品頁、聯絡頁 → 用完整 `.html` 路徑（沒有目錄別名）

GitHub Pages 並**不會** 301 在 `/blog/` 跟 `/blog/index.html` 之間，兩個都直接回 200，這是一種 duplicate content。靠 `<link rel="canonical">` 把訊號統一。

每個 HTML 檔案的 `<head>` 都必須有：
- `<link rel="canonical">`
- `<meta property="og:url">`
- 任何 JSON-LD 裡的 `url` / `@id`

**這四個值必須完全一致**，否則 GSC 會報「重複網頁，使用者未選取標準網頁」。

內部導覽連結也要用乾淨網址：
- ✅ `<a href="blog/">Blog</a>`、`<a href="../blog/">Blog</a>`
- ❌ `<a href="blog/index.html">Blog</a>`

## 新增部落格文章的 checklist

**1. 建立檔案** `blog/{slug}.html`
   - 從現有文章複製整個檔案當範本（推薦 `blog/ai-will-replace-you.html`，metadata 最完整）

**2. 更新 `<head>` 區塊**
   - `<link rel="canonical" href="https://myndare.com/blog/{slug}.html">`
   - `<title>` `<meta name="description">` `<meta property="og:title">` `<meta property="og:description">` `<meta property="og:url">` `<meta name="twitter:title">` `<meta name="twitter:description">`
   - **`og:description` 是首頁卡片會顯示的描述**，要寫得吸引人

**3. 更新 JSON-LD `Article` schema**（必須包含這 4 個欄位）
   ```json
   {
     "@type": "Article",
     "headline": "...",                ← 卡片標題
     "description": "...",
     "keywords": "tag1, tag2, tag3",   ← 卡片標籤（最後一個自動套 purple class）
     "url": "https://myndare.com/blog/{slug}.html",
     "datePublished": "YYYY-MM-DD",    ← 排序用，必填
     "dateModified": "YYYY-MM-DD",
     "author": {...},
     "publisher": {...},
     "mainEntityOfPage": {...}
   }
   ```

**4. 更新 `BreadcrumbList` JSON-LD** 把第 3 個 `ListItem` 改成新文章的 name 跟 URL

**5. 更新 `sitemap.xml`** 在 blog 區塊加新條目，`<lastmod>` 寫今天日期

**6. 更新 `blog/index.html`** 在 `article-list` 最上面加新文章卡片（依日期排序，新的在最上面）

**7. 跑 `node scripts/update-home.js`**
   - 自動掃描 `blog/*.html`，把首頁的「最新 3 篇文章」區塊更新成最新的 3 篇
   - 會列印取了哪 3 篇供確認
   - 從 JSON-LD 抓 `headline`、`datePublished`、`keywords`，從 `og:description` 抓描述

**8. Commit + push**
   ```bash
   git add blog/{slug}.html blog/index.html sitemap.xml index.html
   git commit -m "新增文章：{標題}"
   git push
   ```
   GitHub Pages 自動部署，1～2 分鐘後上線。

**9. GSC 操作（部署上線後）**
   - Search Console → 網址審查 → 貼新文章 URL → 測試線上網址 → 要求建立索引
   - 也順手對 `https://myndare.com/blog/` 做一次（讓 Google 重新檢索 blog 列表）

## 既有的結構化資料

每個頁面已有的 schema：

| 頁面 | Schema |
|---|---|
| `index.html` | `Organization` |
| `blog/index.html` | `Blog` |
| `blog/*.html`（文章） | `Article` + `BreadcrumbList` |
| `products/license-king.html` | `Product`（猜測，未驗證）+ `FAQPage` |
| `products/pm-simulator.html` | `Product`（猜測） |

## 部署 / 工具

- **沒有 npm package.json，也沒有 build pipeline**。`scripts/update-home.js` 是純 Node.js 內建模組，不需要 `npm install`。
- 直接 `node scripts/update-home.js` 即可。
- Push 到 `main` 即觸發 GitHub Pages 部署。
- 沒有測試框架。

## 使用者偏好

- 計畫文件、長段說明用**繁體中文**。
- Commit message 也用繁體中文（看 git log 風格）。
- 程式碼 / 路徑 / 英文技術名詞（canonical、sitemap、og:url 等）保持原文。

## 已知狀態（2026-04-08）

- GSC 報「重複網頁，使用者未選取標準網頁」1 個、「頁面有重新導向」3 個（後者是 `www.myndare.com → myndare.com` 正常 301，可忽略）、「已找到 - 目前尚未建立索引」8 個。
- 已修：canonical 統一到 `/blog/`，sitemap 同步，內部連結同步。等 Google 重新檢索（1～4 週）。
- 已知效能問題：`Myndare.png` 1.4 MB 太大，被縮成 40x40 跟 420x420 顯示。建議壓縮或產生多個尺寸。
