// myndare.com/licenseking/r/render.js
// v1.1 履歷卡分享連結 — 公開頁渲染
//
// 隱私三圈設計（對應 Licenseking_ai plan §0.2）：
//   * 只呼叫 SECURITY DEFINER RPC get_public_resume_page，結果不含 user_id
//   * 任何嘗試 from('public_resume_pages').select() 用 anon key 都會被 RLS 拒絕
//   * Storage 路徑用 short_id 不用 user_id

// ============ 配置 ============
const SUPABASE_URL = 'https://kysaeoxudffzyeofnaby.supabase.co';
// Modern publishable key（取代 legacy anon JWT，Supabase 推薦做法）
// 安全性：本 key 設計上就是公開的，攻擊面由 RLS + RPC 防護（詳見 README.md）
const SUPABASE_ANON_KEY = 'sb_publishable_mE_ZokT_0ZyTWVXb06sTmg_1CViTsIl';

const APP_STORE_URL = 'https://apps.apple.com/tw/app/id6764019660';
const QR_CODE_API = (url) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(url)}`;

// ============ Supabase Client ============
// 注意：本地變數不能叫 supabase——CDN UMD bundle 已把 supabase 註冊為全域 var，
// 用 const supabase = ... 會撞名拋 "Identifier 'supabase' has already been declared"
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ 進入點 ============
async function loadPage() {
  const params = new URLSearchParams(window.location.search);
  const shortId = params.get('id');

  if (!shortId || shortId.length !== 8) {
    renderError('連結格式錯誤');
    return;
  }

  // 呼叫 SECURITY DEFINER RPC（取代 view，對齊 codebase 既有 pattern）
  const { data, error } = await sb
    .rpc('get_public_resume_page', { check_short_id: shortId });

  if (error) {
    console.error('RPC error:', error);
    renderError('連結載入失敗，請稍後再試');
    return;
  }

  // RPC 回傳 array（0 或 1 筆）
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.snapshot) {
    renderError('此連結不存在或已停用');
    return;
  }

  renderResume(row.snapshot, row.updated_at);
}

// ============ 渲染 ============
function renderResume(snapshot, updatedAt) {
  const app = document.getElementById('app');

  const showQRCode = !snapshot.remove_qr_code;
  const careerLine = snapshot.career_direction
    ? `<p class="career">${escapeHtml(snapshot.career_direction)}</p>`
    : '';

  app.innerHTML = `
    <article class="resume-card">
      <header class="resume-header">
        <div class="brand-tag">證照履歷卡 · 證照王 LicenseKing</div>
        <h1 class="holder-name">${escapeHtml(snapshot.holder_name || '')}</h1>
        ${careerLine}
        <p class="license-count">共 ${snapshot.licenses.length} 張證照</p>
      </header>

      <main class="resume-body">
        ${snapshot.licenses.map(renderLicenseItem).join('')}
      </main>

      <footer class="resume-footer">
        <p class="updated-at">最後更新：${formatDate(updatedAt)}</p>
        ${showQRCode ? renderDownloadBlock() : ''}
        <p class="brand-credit">
          由 <strong>證照王 LicenseKing</strong> 生成
        </p>
      </footer>
    </article>
  `;
}

function renderLicenseItem(license) {
  const dates = renderDates(license);
  const imgTag = license.watermarked_image_url
    ? `<img src="${escapeHtmlAttr(license.watermarked_image_url)}"
            alt="${escapeHtmlAttr(license.name)}"
            loading="lazy" />`
    : `<div class="img-placeholder"></div>`;

  return `
    <article class="license-item">
      ${imgTag}
      <div class="license-info">
        <h3>${escapeHtml(license.name || '未命名')}</h3>
        ${license.issuer ? `<p class="issuer">${escapeHtml(license.issuer)}</p>` : ''}
        <p class="dates">${dates}</p>
      </div>
    </article>
  `;
}

function renderDates(license) {
  const parts = [];
  if (license.issued_date) parts.push(`發證 ${license.issued_date}`);
  if (license.is_permanent) {
    parts.push('永久有效');
  } else if (license.expiry_date) {
    parts.push(`有效至 ${license.expiry_date}`);
  }
  return parts.join(' · ');
}

function renderDownloadBlock() {
  return `
    <div class="download-block">
      <img src="${QR_CODE_API(APP_STORE_URL)}" alt="下載證照王 App" class="download-qr">
      <p class="download-text">掃碼下載證照王 App</p>
      <a href="${APP_STORE_URL}" class="download-link" target="_blank" rel="noopener">前往 App Store</a>
    </div>
  `;
}

function renderError(message) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <h2>${escapeHtml(message)}</h2>
      <p>請向分享者確認連結是否正確，或請對方重新生成新的連結。</p>
      <a href="${APP_STORE_URL}" class="download-link" target="_blank" rel="noopener">下載證照王 App</a>
    </div>
  `;
}

// ============ Helpers ============
function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function escapeHtmlAttr(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  } catch {
    return '';
  }
}

// ============ go ============
loadPage();
