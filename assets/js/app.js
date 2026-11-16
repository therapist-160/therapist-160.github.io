/* 換頁：首頁、作品列表、單篇其實是同一頁，草地只有一片，換頁時不重新載入（跟原站一樣）。
   index.html、posts/index.html、posts/post.html 三個檔案內容一樣，只是讓網址可以直接打開、重新整理。

   切換（時間都是從原站量的）：
   - 首頁 → 列表：人物先消失，鏡頭 0.72 秒拉近成畫面下方的草丘（setView 0 → 1）；標題、滑桿往上淡出；列表從下面滑上來
   - 列表 → 單篇：草地往下沉、淡出；列表往上淡出 0.2 秒，換成單篇從下面浮上來
   - 回首頁：反過來；鏡頭拉回來之後人物再出現
   Info（右上角）：人物一直留著
   - 首頁 → Info：人物不消失，跟草地一起拉近（鏡頭拉近到 Info 的位置，比列表退後一點，人物整個露出）
   - 列表 → Info：列表淡出，草丘升起到 Info 的位置，人物同時淡入
   - 單篇 → Info：草地從下面浮回來（已經是 Info 的位置），人物一起淡入
   - 離開 Info 時反過來 */
(function () {
  'use strict';
  const S = window.SITE;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.body;

  /* ---------- 畫面 ---------- */
  body.insertAdjacentHTML('afterbegin', `
    <div class="sky" aria-hidden="true"><canvas></canvas></div>
    <section class="hero">
      <h1 class="hero__word"></h1>
      <p class="hero__blurb"></p>
      <p class="hero__go"></p>
    </section>
    <main class="reader" hidden><div class="leaf"></div></main>
    <div class="stage" role="application" aria-label="A field you can turn. Left and right arrows turn it one step."><canvas></canvas></div>
    <div class="track">
      <div class="track__inner">
        <div class="track__bar" role="slider" aria-label="Turn the field" aria-valuemin="0" aria-valuemax="23" aria-valuenow="0" tabindex="0">
          <span class="track__seg track__seg--l"></span>
          <span class="track__seg track__seg--r"></span>
          <span class="track__thumb"></span>
        </div>
        <div class="track__meta">
          <p class="track__label"></p>
          <p class="track__keys">
            <button class="btn btn--icon turn-left" type="button" aria-label="Turn left"></button>
            <button class="btn btn--icon turn-right" type="button" aria-label="Turn right"></button>
          </p>
        </div>
      </div>
    </div>`);
  Site.mount();
  const reader = document.querySelector('.reader');
  const leaf = reader.querySelector('.leaf');

  /* ---------- 網址 ↔ 頁面 ---------- */
  const rootURL = new URL(Site.url(''));
  function parse(u) {
    if (u.origin !== rootURL.origin || !u.pathname.startsWith(rootURL.pathname)) return null;
    const rel = u.pathname.slice(rootURL.pathname.length);
    if (rel === '' || rel === 'index.html') return { page: 'home' };
    if (rel === 'posts' || rel === 'posts/' || rel === 'posts/index.html') return { page: 'list' };
    if (rel === 'posts/post.html') return { page: 'post', slug: u.searchParams.get('p') };
    if (rel === 'info' || rel === 'info/' || rel === 'info/index.html') return { page: 'info' };
    return null;
  }
  const same = (a, b) => a && b && a.page === b.page && a.slug === b.slug;

  /* ---------- 草地（三頁共用） ---------- */
  // 人物圖的路徑先換成完整網址：圖是轉到那一格才載入，那時網址可能已經換頁了
  const situations = S.situations.map((s) => ({ ...s, src: Site.url(s.src) }));
  const field = Field.mount(document.querySelector('.stage canvas'), { situations, steps: S.situations.length || S.steps, seed: 7 });

  let route = parse(new URL(location.href)) || { page: 'home' };
  Home.init(field, route.page === 'home');
  Reader.init(reader);

  // 滑鼠撥草：首頁和列表都有，單篇看不到草地就不用
  document.addEventListener('pointermove', (e) => {
    if (field && e.pointerType === 'mouse') field.setPointer(route.page === 'post' ? null : e.clientX, e.clientY);
  });
  document.documentElement.addEventListener('pointerleave', () => field && field.setPointer(null));

  /* ---------- 鏡頭：walk 0 = 首頁，1 = 拉近；focus（拉近之後停在哪）0 = 列表的草丘，1 = Info ---------- */
  // 標題、滑桿跟著鏡頭淡出（CSS 用 --walk），跟原站一樣：走到 0.75 時完全看不到
  const cam = { walk: { v: 0, id: 0 }, focus: { v: 0, id: 0 } };
  function setCam(name, v) {
    cam[name].v = v;
    if (name === 'walk') body.style.setProperty('--walk', v.toFixed(3));
    if (field) name === 'walk' ? field.setView(v) : field.setFocus(v);
  }
  const setWalk = (v) => { ++cam.walk.id; setCam('walk', v); };
  const setFocus = (v) => { ++cam.focus.id; setCam('focus', v); };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function camTo(name, to, done) {
    const c = cam[name], me = ++c.id, from = c.v, t0 = performance.now(), dur = 720;
    if (reduce || from === to) { setCam(name, to); done && done(); return; }
    (function step(now) {
      if (me !== c.id) return;
      const t = Math.min(1, (now - t0) / dur);
      setCam(name, from + (to - from) * ease(t));
      if (t < 1) requestAnimationFrame(step); else done && done();
    })(t0);
  }
  const walkTo = (to, done) => camTo('walk', to, done);

  /* ---------- Info：告訴草地文字的底在哪，人物縮小讓位（字型載入、視窗大小改變時重量） ---------- */
  function measureInfo() {
    // 離開 Info 時保留上次的值（列表時用不到；回 Info 時鏡頭才不會中途跳）
    const last = route.page === 'info' && leaf.querySelector('.info > :last-child');
    if (field && last) field.setInfoRoom(last.offsetTop + last.offsetHeight);   // offsetTop：不受捲動和滑入動畫影響
  }
  new ResizeObserver(measureInfo).observe(leaf);
  addEventListener('resize', measureInfo);

  /* ---------- 切換 ---------- */
  let turn = 0;
  // from：進 Info 時是從哪一頁來的（記在瀏覽器的上一頁／下一頁紀錄裡，按上一頁再回到 Info 也記得）
  function apply(next, first, from) {
    const prev = first ? null : route;
    route = next;
    const me = ++turn;
    body.classList.toggle('at-home', next.page === 'home');
    body.classList.toggle('at-list', next.page === 'list');
    body.classList.toggle('at-post', next.page === 'post');
    body.classList.toggle('at-info', next.page === 'info');
    Site.setPage(next.page, from);
    Home.active = next.page === 'home';
    Reader.close();

    if (next.page === 'home') {
      document.title = S.name;
      body.classList.remove('has-reader');
      walkTo(0, () => { if (me === turn && field) field.showCharacter(true); });
      if (!reader.hidden) {
        reader.removeAttribute('data-shown');
        reader.setAttribute('data-closing', '');
        setTimeout(() => { if (me !== turn) return; reader.hidden = true; reader.removeAttribute('data-closing'); leaf.innerHTML = ''; }, reduce ? 0 : 480);
      }
      return;
    }

    // Info 留著人物；列表、單篇沒有
    const info = next.page === 'info';
    field && field.showCharacter(info);
    body.classList.add('has-reader');
    // 拉近之後停的位置：列表 ↔ Info 之間草丘升降；從首頁、單篇（草地看不到）出發時直接換好
    if (!first && prev && (prev.page === 'list' || prev.page === 'info')) camTo('focus', info ? 1 : 0);
    else setFocus(info ? 1 : 0);
    if (first) setWalk(1); else walkTo(1);

    if (reader.hidden || reader.hasAttribute('data-closing') || !prev || prev.page === 'home') {
      // 從首頁打開：整個閱讀層從下面滑上來
      reader.removeAttribute('data-closing');
      reader.removeAttribute('data-shown');
      reader.hidden = false;
      document.title = Reader.render(next, leaf);
      reader.scrollTop = 0;
      measureInfo();
      if (first) reader.setAttribute('data-shown', '');
      else { void reader.offsetWidth; requestAnimationFrame(() => { if (me === turn) reader.setAttribute('data-shown', ''); }); }
      return;
    }
    // 列表 ↔ 單篇：舊內容往上淡出，再換新內容從下面浮上來
    leaf.removeAttribute('data-turned');
    leaf.setAttribute('data-leaving', '');
    setTimeout(() => {
      if (me !== turn) return;
      document.title = Reader.render(next, leaf);
      reader.scrollTop = 0;
      measureInfo();
      leaf.removeAttribute('data-leaving');
      void leaf.offsetWidth;
      leaf.setAttribute('data-turned', '');
    }, reduce ? 0 : 200);
  }

  // 進 Info 時記下從哪來（Info 換到 Info 不算；首頁以外的頁面記 page 和 slug）
  const origin = (r) => (r && r.page !== 'info' ? { page: r.page, slug: r.slug } : null);
  function go(next, href) {
    if (same(next, route)) return;
    const from = next.page === 'info' ? origin(route) : null;
    history.pushState(from ? { from } : null, '', href);
    apply(next, false, from);
  }

  // 站內連結不重新載入；按著 Cmd／Ctrl／Shift 點（開新分頁）照舊
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target) return;
    const next = parse(new URL(a.href));
    if (!next) return;
    e.preventDefault();
    go(next, a.href);
  });
  addEventListener('popstate', (e) => apply(parse(new URL(location.href)) || { page: 'home' }, false, e.state && e.state.from));

  if (route.page !== 'home') { setWalk(1); setFocus(route.page === 'info' ? 1 : 0); }
  apply(route, true, history.state && history.state.from);   // 重新整理 Info 時也記得從哪來
})();
