# Myndare.com — 給 Claude Code 的專案指南

靜態 HTML 網站，部署在 GitHub Pages，自訂網域 `myndare.com`（CNAME 已設）。
Push 到 `main` 後 GitHub Pages 自動部署。沒有 build pipeline，也沒有 Jekyll 設定，是純 HTML/CSS/JS。

## 目錄結構

```
/
├── index.html              首頁
├── contact.html            聯絡頁
├── 404.html                404 錯誤頁
├── blog/
│   ├── index.html          部落格列表
│   └── *.html              個別文章
├── products/
│   ├── license-king.html   ← 已 redirect 至 /licenseking/（保留作 SEO 訊號轉移）
│   └── pm-simulator.html
├── licenseking/            ← 證照王子網站（產品、隱私、條款、客服）
│   ├── index.html          證照王 landing page
│   ├── privacy/index.html  隱私權政策
│   ├── terms/index.html    使用條款
│   └── support/index.html  客服支援 + FAQ
├── scripts/
│   └── update-home.js      自動更新首頁最新文章區塊 + feed.xml
├── sitemap.xml
├── feed.xml                RSS 2.0 feed（自動產生，勿手動編輯）
├── robots.txt
├── llms.txt
├── CNAME                   myndare.com
├── Myndare.png             logo
└── favicon.ico / favicon.png
```

`plan/` 跟 `.playwright-mcp/` 都在 `.gitignore` 裡。

## 通用 SEO 標準（適用所有新頁面）

新增任何 HTML 頁面時都必須遵循以下 SEO 標準。這份清單是「最低標準」，不是 nice-to-have。

### A. Canonical 4 一致原則（最重要）

每個頁面的「正規網址」會出現在 4 個地方，**這 4 個值必須完全一致**：

1. `<link rel="canonical" href="...">`
2. `<meta property="og:url" content="...">`
3. JSON-LD 結構化資料中的 `url` 或 `@id` 欄位（包含主 schema 跟 BreadcrumbList 最後一項）
4. `sitemap.xml` 的 `<loc>`

不一致會導致 GSC 報「重複網頁，使用者未選取標準網頁」。

### B. URL 慣例

| 頁面類型 | URL 格式 | 範例 |
|---|---|---|
| 首頁 | 根目錄 | `https://myndare.com/` |
| 部落格首頁 | 乾淨目錄 | `https://myndare.com/blog/` |
| 子網站首頁（如證照王） | 乾淨目錄 | `https://myndare.com/licenseking/` |
| 子網站子頁 | 乾淨目錄 | `https://myndare.com/licenseking/privacy/` |
| 部落格文章 | 完整 `.html` | `https://myndare.com/blog/{slug}.html` |
| 既有產品頁 / 聯絡頁 | 完整 `.html` | `https://myndare.com/contact.html` |

**規則**：用 `index.html` 當底的目錄頁一律走「乾淨目錄網址」（GitHub Pages 不會 301 在 `/foo/` 跟 `/foo/index.html` 之間，兩個都直接回 200，靠 canonical 統一訊號）。

### C. 必填 `<head>` 元素清單

每個新頁面的 `<head>` 必須有以下元素，缺一不可：

```html
<!-- 1. 基礎 -->
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{頁面標題} | Myndare</title>
<meta name="description" content="{120-160 字內的描述}">

<!-- 2. Canonical(對齊 og:url、JSON-LD url、sitemap loc) -->
<link rel="canonical" href="https://myndare.com/{path}">

<!-- 3. Open Graph -->
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:type" content="website">  <!-- 文章用 article -->
<meta property="og:url" content="https://myndare.com/{path}">  <!-- 必須跟 canonical 一致 -->
<meta property="og:image" content="https://myndare.com/Myndare.png">  <!-- ⚠️ 必須是絕對網址 -->

<!-- 4. Twitter Card -->
<meta name="twitter:card" content="summary">  <!-- 或 summary_large_image -->
<meta name="twitter:title" content="...">
<meta name="twitter:description" content="...">
<meta name="twitter:image" content="https://myndare.com/Myndare.png">

<!-- 5. favicon(用絕對路徑,避免子目錄路徑算錯) -->
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon.png">

<!-- 6. RSS feed 自動發現(每頁都要) -->
<link rel="alternate" type="application/rss+xml" title="Myndare Blog RSS" href="/feed.xml">

<!-- 7. Google Fonts(風格一致) -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">

<!-- 8. JSON-LD 結構化資料(依頁面類型選,見下表) -->
<script type="application/ld+json">{...}</script>
```

### D. JSON-LD schema 對應表

| 頁面類型 | 主 schema | 配套 schema | 範例 |
|---|---|---|---|
| 首頁 | `Organization` | — | [index.html](index.html) |
| 部落格首頁 | `Blog` | — | [blog/index.html](blog/index.html) |
| 部落格文章 | `Article` | `BreadcrumbList` | [blog/ai-will-replace-you.html](blog/ai-will-replace-you.html) |
| 產品 landing | `SoftwareApplication` 或 `Product` | `BreadcrumbList` | [licenseking/index.html](licenseking/index.html) |
| FAQ 頁 | `FAQPage` | `BreadcrumbList` | [licenseking/support/index.html](licenseking/support/index.html) |
| 隱私 / 條款 / 一般內容頁 | `WebPage` | `BreadcrumbList` | [licenseking/privacy/index.html](licenseking/privacy/index.html) |
| 聯絡頁 | `ContactPage` | — | [contact.html](contact.html) |
| 跳轉頁（meta refresh） | 不放 schema | 不放 | [products/license-king.html](products/license-king.html) |

**規則**：除了首頁、聯絡頁、跳轉頁，其他頁面都應該加 `BreadcrumbList`。BreadcrumbList 最後一項的 `item` 必須等於該頁的 canonical。

### E. sitemap.xml 慣例

新頁面**必須**加進 [sitemap.xml](sitemap.xml)。priority / changefreq 對應：

| 頁面類型 | priority | changefreq |
|---|---|---|
| 首頁 | `1.0` | `weekly` |
| 主要產品 landing | `0.9` | `monthly` |
| 部落格首頁 | `0.8` | `weekly` |
| 部落格文章 | `0.7` | `monthly` |
| 聯絡頁 | `0.6` | `yearly` |
| 客服支援頁 | `0.5` | `yearly` |
| 法律頁（隱私 / 條款） | `0.4` | `yearly` |

`<lastmod>` 寫今天日期（YYYY-MM-DD）。

### F. 內部連結

- ✅ 用乾淨網址：`<a href="/blog/">Blog</a>`、`<a href="/licenseking/">證照王</a>`
- ✅ 跨層級用絕對路徑：`<a href="/contact.html">`
- ❌ 不用 `index.html` 副檔名：`<a href="/blog/index.html">`
- ❌ 不用 `../` 相對路徑跨層級：`<a href="../licenseking/">`（容易出錯）

### G. 廢棄頁面處理（meta refresh redirect）

若需把舊頁面轉到新位置（例如舊產品頁搬到新子目錄），用以下模式：

```html
<head>
  <meta http-equiv="refresh" content="0; url=https://myndare.com/{new-path}/">
  <link rel="canonical" href="https://myndare.com/{new-path}/">
  <meta name="robots" content="noindex, follow">
  <!-- og:url / twitter:url 也都指向新位置 -->
  <script>window.location.replace('https://myndare.com/{new-path}/');</script>
</head>
```

重點：
- canonical / og:url / JSON-LD url 全部指向**新位置**（讓 Google 把權重轉過去）
- 加 `noindex, follow` 避免舊網址被收錄
- 移除原本所有的 schema 跟 nav / 內容（避免 duplicate content 訊號）
- JS `window.location.replace()` 速度比 meta refresh 快

## 新增一般頁面的 checklist（非 blog）

新增任何非部落格頁面（產品頁、子網站、法律頁、客服頁等）時依此清單：

**1. 建立檔案**
   - 從風格相近的既有頁面複製當範本：
     - 產品 landing 風格：[licenseking/index.html](licenseking/index.html) 或 [products/pm-simulator.html](products/pm-simulator.html)
     - 法律 / 一般文字頁：[licenseking/privacy/index.html](licenseking/privacy/index.html) 或 [licenseking/terms/index.html](licenseking/terms/index.html)
     - FAQ / 客服頁：[licenseking/support/index.html](licenseking/support/index.html)
     - 簡潔聯絡 / 介紹頁：[contact.html](contact.html)

**2. 完成「通用 SEO 標準」C 段所有必填 head 元素**
   - 對齊 canonical / og:url / JSON-LD url（4 一致原則）
   - 確保 og:image 是絕對網址
   - favicon 用絕對路徑 `/favicon.ico`
   - 加 `<link rel="alternate" type="application/rss+xml">`

**3. 依頁面類型選對 JSON-LD schema**
   - 參考「通用 SEO 標準」D 段的對應表
   - 除了首頁、聯絡頁、跳轉頁，其他都加 `BreadcrumbList`

**4. nav / footer 一致性**
   - 完整複用主站 nav 結構（含 mobile hamburger menu）
   - 連結用絕對路徑（`/`、`/blog/`、`/licenseking/`、`/contact.html`）
   - footer 含 `MYNDARE` 品牌字 + `hello@myndare.com` + copyright
   - 子網站可在 footer 加「相互連結列」（範例見 [licenseking/index.html](licenseking/index.html) 的 `.footer-links`）

**5. 更新 `sitemap.xml`**
   - 依「通用 SEO 標準」E 段選 priority / changefreq
   - `<lastmod>` 寫今天日期

**6. 全站 nav 同步**
   - 如果新頁面要加進主站 nav dropdown，**全站所有頁面**的 nav / mobile menu 都要同步更新（不只 index.html）
   - 用 Grep 檢查還有沒有指向舊位置的連結

**7. 更新 [llms.txt](llms.txt)**
   - 如果是有意義的新主題（產品、子網站），補一個區段
   - 法律頁 / 客服頁可以列在主產品條目下

**8. 更新本檔案 (CLAUDE.md)**
   - 「既有的結構化資料」表格新增一行
   - 「目錄結構」如果有新目錄也要加

**9. 本機驗證**
   - Playwright MCP 跑 desktop (1280×800) + mobile (390×844) 截圖
   - 用 `browser_evaluate` 驗證 canonical / og:url / JSON-LD 一致

**10. Commit + push + GSC 提交**
   - GitHub Pages 自動部署
   - 上線後 GSC 網址審查 → 提交建立索引

---

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
   - 自動掃描 `blog/*.html`，做兩件事：
     1. 把首頁的「最新 3 篇文章」區塊更新成最新的 3 篇
     2. 重新產生 `feed.xml`（RSS 2.0，全部文章）
   - 會列印取了哪 3 篇供確認
   - 從 JSON-LD 抓 `headline`、`datePublished`、`keywords`，從 `og:description` 抓描述

**8. 提醒在文章 head 加 `<link rel="alternate">`**（若從範本複製通常已經有）
   ```html
   <link rel="alternate" type="application/rss+xml" title="Myndare Blog RSS" href="/feed.xml">
   ```
   每個 HTML 頁面都應該有這一行，方便瀏覽器跟 feed reader 自動發現。

**9. Commit + push**
   ```bash
   git add blog/{slug}.html blog/index.html sitemap.xml index.html feed.xml
   git commit -m "新增文章：{標題}"
   git push
   ```
   GitHub Pages 自動部署，1～2 分鐘後上線。

**10. GSC 操作（部署上線後）**
   - Search Console → 網址審查 → 貼新文章 URL → 測試線上網址 → 要求建立索引
   - 也順手對 `https://myndare.com/blog/` 做一次（讓 Google 重新檢索 blog 列表）
   - Bing Webmaster Tools → 網址提交 → 貼新文章 URL（提交額度每天約 10～20 個）

## 既有的結構化資料

每個頁面已有的 schema（這份表格在新增頁面時也要同步更新）：

| 頁面 | Schema |
|---|---|
| `index.html` | `Organization` |
| `contact.html` | `ContactPage` |
| `blog/index.html` | `Blog` |
| `blog/*.html`（文章） | `Article` + `BreadcrumbList` |
| `licenseking/index.html` | `SoftwareApplication` + `BreadcrumbList` |
| `licenseking/privacy/index.html` | `WebPage` + `BreadcrumbList` |
| `licenseking/terms/index.html` | `WebPage` + `BreadcrumbList` |
| `licenseking/support/index.html` | `FAQPage` + `BreadcrumbList` |
| `products/license-king.html` | （無，已 redirect 至 `/licenseking/`） |
| `products/pm-simulator.html` | `VideoGame` + `FAQPage` |

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

- 證照王子網站 `/licenseking/` 已上線（landing + privacy + terms + support 4 頁），舊 `products/license-king.html` 已 redirect。為 App Store 送審準備合規法律文件。
- GSC 報「重複網頁，使用者未選取標準網頁」1 個、「頁面有重新導向」3 個（後者是 `www.myndare.com → myndare.com` 正常 301，可忽略）、「已找到 - 目前尚未建立索引」8 個。
- 已修：canonical 統一到 `/blog/`，sitemap 同步，內部連結同步。等 Google 重新檢索（1～4 週）。
- 已壓縮：`Myndare.png` 已從 1388 KB 縮到 254 KB（commit 209c6ad）。
