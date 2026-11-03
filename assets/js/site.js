/* 共用：網址、頁首、按鈕、圖示。 */
(function () {
  'use strict';
  const S = window.SITE;
  // 網站根目錄的完整網址。換頁不重新載入（網址會跟著變），所以圖片、連結一律從這裡算，不能用相對路徑
  // 網址後面的 ?xxx、#xxx 要拿掉，不然從 IG／LinkedIn 帶著 ?utm_… 點進來時，圖片路徑會算錯（人物變成替代圖）
  const rootURL = new URL(document.body.dataset.base || '', location.href);
  rootURL.search = ''; rootURL.hash = '';
  const root = rootURL.href;
  const url = (p) => (/^https?:/.test(p) ? p : root + p);

  const icon = {
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12h14.5M13.5 6l6 6-6 6"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.4-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12H5M10.5 6l-6 6 6 6"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>',
    // GitHub 標誌（Octicons mark-github，MIT 授權）
    github: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
  };

  const swap = (svg) => `<span class="swap"><i>${svg}</i><i>${svg}</i></span>`;

  function seam(tag, attrs, label, svg, extra) {
    return `<${tag} class="seam swap-host ${extra || ''}" ${attrs}>
      <span class="seam__bg" aria-hidden="true"><span class="seam__l"></span><span class="seam__r"></span></span>
      <span class="seam__label">${label}</span>
      <span class="seam__icon">${swap(svg)}</span></${tag}>`;
  }

  // 左上角：首頁是 therapist.160 文字 logo，列表是「回到草地」，單篇是「全部作品」；
  // Info 是從哪來就回哪去（Vic 2026-11-03）：首頁 →「回到草地」、列表 →「全部作品」、單篇 →「回到作品」（回到那一篇）
  function corner(page, from) {
    const L = S.labels;
    if (page === 'home') {
      const dot = S.logo.lastIndexOf('.');
      const name = dot < 0 ? S.logo : `${S.logo.slice(0, dot)}<i>.</i>${S.logo.slice(dot + 1)}`;
      return `<span class="mark"><span class="mark__name">${name}</span><span class="mark__say">${S.mark}</span></span>`;
    }
    const back = page === 'info' ? (from || { page: 'home' }) : { page: page === 'post' ? 'list' : 'home' };
    const [href, label] = back.page === 'list' ? ['posts/', L.allWorks]
      : back.page === 'post' ? ['posts/post.html?p=' + encodeURIComponent(back.slug || ''), L.backToWork]
        : ['', L.backToField];
    return `<a class="back" href="${url(href)}" aria-label="${label}"><span class="back__icon">${swap(icon.left)}</span><span class="back__label">${label}</span></a>`;
  }

  // IG、GitHub 圓框圖示按鈕（開新分頁）：2026-11-03 起從右上角移到 Info 頁內文下面
  const social = () => `<nav class="social" aria-label="Elsewhere">${S.social.map((s) => `<a class="btn btn--icon btn--ring" href="${s.href}" target="_blank" rel="noopener noreferrer" aria-label="${s.label}">${icon[s.kind] || ''}</a>`).join('')}</nav>`;

  // 右上角只有 Works、Info 兩個文字按鈕（Vic 2026-11-03）
  function mast() {
    return `<header class="mast">
      <div class="mast__corner"></div>
      <nav class="mast__end" aria-label="Pages">
        <a class="btn mast__works" href="${url('posts/')}">${S.labels.works}</a>
        <a class="btn mast__info" href="${url('info/')}">${S.labels.info}</a>
      </nav>
    </header>`;
  }

  let shown = null;
  window.Site = {
    icon, seam, swap, url, social,
    mount() { document.body.insertAdjacentHTML('afterbegin', mast()); },
    // 換頁時換左上角（新的從左邊淡入）；「Works」在作品列表、「Info」在 Info 頁加底線
    // from：Info 是從哪一頁進來的（{ page, slug }），決定左上角回去哪裡
    setPage(page, from) {
      const m = document.querySelector('.mast');
      m.querySelector('.mast__works').classList.toggle('is-here', page === 'list');
      m.querySelector('.mast__info').classList.toggle('is-here', page === 'info');
      const key = page === 'info' && from ? `info:${from.page}:${from.slug || ''}` : page;
      if (key === shown) return;
      const c = m.querySelector('.mast__corner');
      c.innerHTML = corner(page, from);
      if (shown !== null) { c.classList.remove('is-new'); void c.offsetWidth; c.classList.add('is-new'); }
      shown = key;
    },
  };
})();
