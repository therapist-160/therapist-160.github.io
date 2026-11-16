/* 作品列表與單篇的內容。作品資料來自 works.js（從 therapist160 工作室複製過來）。
   Reader.init(scroller)：準備全螢幕檢視；Reader.render(route, leaf)：把列表或單篇畫進 leaf，回傳分頁標題。 */
(function () {
  'use strict';
  const S = window.SITE;
  const L = S.labels;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 順序照工作室的（新的在前，同年份的順序也一樣）
  const works = window.WORKS || [];
  // Client 和 Agency 一樣時只寫一次
  const credit = (w) => [...new Set([w.client, w.agency].filter(Boolean))].join(' · ');
  const find = (slug) => works.find((x) => x.slug === slug) || works[0];

  let scroller = null;
  let gallery = [];   // 目前這個作品的所有圖片（含 GIF）和影片，照頁面順序，給全螢幕檢視左右切換
  let io = null;

  function init(el) {
    scroller = el;
    // 中文標題用思源宋體：只跟 Google 要作品標題裡用到的中文字（約 20 KB；整套載入要 650 KB）。
    // 作品標題換了，這裡會自動跟著換。
    // Info 第一段（lead）也是思源宋體，一起算進去
    const zh = [...new Set(works.map((x) => x.title).join('') + ((S.info && S.info.lead) || ''))].filter((c) => c.charCodeAt(0) > 0x2e7f).sort().join('');
    if (zh) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400&text=${encodeURIComponent(zh)}&display=swap`;
      document.head.appendChild(link);
    }
    viewer();
    scroller.addEventListener('click', (e) => {
      const t = e.target.closest('[data-i]');
      if (t) open(+t.dataset.i, t);
    });
  }

  function render(route, leaf) {
    if (io) { io.disconnect(); io = null; }
    gallery = [];
    if (route.page === 'list') { list(leaf); return `${L.works} — ${S.name}`; }
    if (route.page === 'info') { info(leaf); return `${L.info} — ${S.name}`; }
    const w = find(route.slug);
    if (!w) { leaf.innerHTML = ''; return S.name; }
    story(w, leaf);
    return `${w.title} — ${S.name}`;
  }

  /* ---------- 列表：照年份分組 ---------- */
  function list(leaf) {
    const years = new Map();
    works.forEach((w) => { const y = String(w.year); if (!years.has(y)) years.set(y, []); years.get(y).push(w); });
    const index = [...years].map(([y, list]) => `
      <section class="reader__index">
        <div class="reader__year"><b>${y}</b><span>${L.entries(list.length)}</span></div>
        <div class="reader__rows">${list.map((w) => `
          <a class="reader__row" href="${Site.url('posts/post.html?p=' + encodeURIComponent(w.slug))}">
            <span class="reader__title">${esc(w.title)}</span>
            <span class="reader__when">${esc(credit(w))}</span>
          </a>`).join('')}</div>
      </section>`).join('');
    leaf.innerHTML = `<div class="reader__sheet"><h2>${L.works}</h2>${index}</div>`;
  }

  /* ---------- Info：個人介紹（文字在 content.js 的 info），最後是 IG、GitHub 圖示，下面是草丘和人物 ---------- */
  function info(leaf) {
    const I = S.info || {};
    // 段落結尾黏在一起，窄螢幕不會只剩一兩個字掉到最後一行（Vic 2026-11-03）：
    // 最後一個逗號後面很短（≤ 7 字）就整句一起換行，否則最後 4 個字一起
    const tidy = (t) => {
      const m = t.match(/^([\s\S]*[，、])([^，、]{1,7})$/);
      const cut = m ? [...m[1]].length : Math.max(0, [...t].length - 4);
      const head = [...t].slice(0, cut).join(''), tail = [...t].slice(cut).join('');
      return `${esc(head)}<span class="nobr">${esc(tail)}</span>`;
    };
    leaf.innerHTML = `<div class="reader__sheet info">
      <h2>${esc(I.heading || L.info)}</h2>
      ${I.lead ? `<p class="info__lead">${tidy(I.lead)}</p>` : ''}
      ${(I.body || []).map((t) => `<p>${tidy(t)}</p>`).join('')}
      ${Site.social()}
    </div>`;
  }

  /* ---------- 單篇：年份、標題、Client／Agency，接著圖片和影片一路往下 ---------- */
  function story(w, leaf) {
    const add = (item) => gallery.push(item) - 1;
    const media = (b) => {
      if (b.type === 'images') return b.items.map((p) => {
        const i = add({ kind: 'img', src: Site.url(p) });
        return `
        <figure class="story__media reveal"><button class="story__zoom" type="button" data-i="${i}" aria-label="View image ${i + 1} full screen"><img src="${esc(Site.url(p))}" alt="" loading="lazy" decoding="async"></button></figure>`;
      }).join('');
      if (b.type === 'youtube') {
        // 先放封面，按了在全螢幕檢視裡播；沒指定封面就用 YouTube 的縮圖（640 寬一定有，有 1280 寬的再換上）
        const i = add({ kind: 'yt', id: b.id, tall: b.orientation === 'portrait' });
        const img = b.poster ? `<img src="${esc(Site.url(b.poster))}" alt="" loading="lazy">`
          : `<img src="https://i.ytimg.com/vi/${esc(b.id)}/sddefault.jpg" data-hd="https://i.ytimg.com/vi/${esc(b.id)}/maxresdefault.jpg" alt="" loading="lazy">`;
        return `
        <figure class="story__media story__video${b.orientation === 'portrait' ? ' is-tall' : ''} reveal">
          <button class="story__yt" type="button" data-i="${i}" aria-label="Play video">${img}<span class="story__play">${Site.icon.play}</span></button>
        </figure>`;
      }
      if (b.type === 'video') {
        const i = add({ kind: 'video', src: Site.url(b.src) });
        return `
        <figure class="story__media reveal"><button class="story__zoom story__clip" type="button" data-i="${i}" aria-label="Play video ${i + 1} full screen"><video src="${esc(Site.url(b.src))}" muted loop playsinline autoplay preload="metadata"></video></button></figure>`;
      }
      return '';
    };
    const credits = [w.client && `Client : ${w.client}`, w.agency && `Agency : ${w.agency}`].filter(Boolean);

    leaf.innerHTML = `
      <header class="story__head">
        <p class="story__kicker">${esc(w.year)}</p>
        <h1 class="story__title">${esc(w.title)}</h1>
        ${credits.length ? `<p class="story__meta">${credits.map((c) => `<span>${esc(c)}</span>`).join('')}</p>` : ''}
      </header>
      <div class="story__body">${(w.blocks || []).map(media).join('')}</div>`;

    leaf.querySelectorAll('img[data-hd]').forEach((img) => {
      // 高畫質縮圖不存在時 YouTube 會回一張 120 寬的灰圖，那就不換
      const t = new Image(); t.onload = () => { if (t.naturalWidth >= 1280) img.src = t.src; }; t.src = img.dataset.hd;
    });
    io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { root: scroller, threshold: 0.1 });
    leaf.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  }

  /* ---------- 全螢幕檢視：點圖片或影片放大，左右切換，Esc 或點背景關閉 ---------- */
  let lb, stage, at = 0, opener = null;
  const pad = (n) => String(n).padStart(2, '0');
  function viewer() {
    lb = document.createElement('div');
    lb.className = 'lb'; lb.hidden = true;
    lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Media viewer');
    lb.innerHTML = `
      <div class="lb__stage"></div>
      <button class="lb__btn lb__close" type="button" aria-label="Close">${Site.icon.close}</button>
      <button class="lb__btn lb__prev" type="button" aria-label="Previous">${Site.icon.left}</button>
      <button class="lb__btn lb__next" type="button" aria-label="Next">${Site.icon.right}</button>
      <p class="lb__count"></p>`;
    document.body.appendChild(lb);
    stage = lb.querySelector('.lb__stage');
    lb.addEventListener('click', (e) => {
      if (e.target.closest('.lb__prev')) show(at - 1);
      else if (e.target.closest('.lb__next')) show(at + 1);
      else if (e.target.closest('.lb__close') || e.target === lb) close();
    });
    // 手機：左右滑切換
    let swipe = null;
    lb.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') swipe = { x: e.clientX, y: e.clientY }; });
    lb.addEventListener('pointerup', (e) => {
      if (!swipe || gallery.length < 2) { swipe = null; return; }
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(at + (dx < 0 ? 1 : -1));
    });
    document.addEventListener('keydown', (e) => {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' && gallery.length > 1) show(at - 1);
      else if (e.key === 'ArrowRight' && gallery.length > 1) show(at + 1);
    });
  }
  // 每次切換都整個換掉，切走的影片就會停
  function show(i) {
    at = (i + gallery.length) % gallery.length;
    const g = gallery[at];
    stage.innerHTML = g.kind === 'yt'
      ? `<iframe class="lb__media lb__frame${g.tall ? ' is-tall' : ''}" title="Video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(g.id)}?autoplay=1&rel=0&playsinline=1"></iframe>`
      : g.kind === 'video'
        ? `<video class="lb__media lb__img" src="${esc(g.src)}" controls autoplay loop playsinline></video>`
        : `<img class="lb__media lb__img" src="${esc(g.src)}" alt="">`;
    lb.querySelector('.lb__count').textContent = `${pad(at + 1)} / ${pad(gallery.length)}`;
  }
  function open(i, from) {
    opener = from; show(i);
    lb.classList.toggle('is-single', gallery.length < 2);
    lb.hidden = false;
    requestAnimationFrame(() => lb.classList.add('is-open'));
    lb.querySelector('.lb__close').focus();
  }
  function close() {
    if (lb.hidden) return;
    lb.classList.remove('is-open');
    stage.querySelectorAll('iframe, video').forEach((v) => v.remove());   // 影片馬上停，不等淡出
    setTimeout(() => { lb.hidden = true; stage.innerHTML = ''; }, 250);
    if (opener && opener.isConnected) opener.focus();
  }

  window.Reader = { init, render, close };
})();
