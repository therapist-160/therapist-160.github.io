/* 首頁：天空、標題互動、轉動草地。草地本身由 app.js 建立（三頁共用同一片）。
   Home.init(field, intro)：intro = true 是一開始就在首頁，要跑開場；從列表回來時直接顯示。
   Home.active：只有在首頁時拖曳、方向鍵、標題互動才有作用。 */
(function () {
  'use strict';
  const S = window.SITE;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const Home = window.Home = { active: false, init };

  function init(field, withIntro) {
    /* ---------- 天空（程式畫的雲） ---------- */
    (function paintSky(c) {
      const W = 640, H = 360;
      c.width = W; c.height = H;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#aebdc8'); g.addColorStop(0.45, '#e4e3dc'); g.addColorStop(1, '#f4e6d2');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      let seed = 11;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const clouds = [[150, 140, 1.2], [470, 90, 0.9], [560, 210, 0.7], [70, 250, 0.8], [330, 230, 0.6], [250, 60, 0.5]];
      for (const [cx, cy, s] of clouds) {
        for (let i = 0; i < 26; i++) {
          const px = cx + (r() - 0.5) * 150 * s, py = cy + (r() - 0.6) * 40 * s;
          const rad = (18 + r() * 34) * s;
          const rg = x.createRadialGradient(px, py - rad * 0.3, 0, px, py, rad);
          rg.addColorStop(0, 'rgba(255,255,255,0.75)');
          rg.addColorStop(0.6, 'rgba(250,246,238,0.35)');
          rg.addColorStop(1, 'rgba(240,232,220,0)');
          x.fillStyle = rg; x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
        }
      }
    })(document.querySelector('.sky canvas'));

    /* ---------- 標題、介紹文字 ---------- */
    const h1 = document.querySelector('.hero__word');
    const blurb = document.querySelector('.hero__blurb');
    const chars = (text) => [...text].map((ch) => `<span class="ch">${ch}</span>`).join('');
    const words = (text) => text.split(' ').map((w) => `<span class="word" style="white-space:nowrap">${chars(w)}</span>`).join('<span class="ch"> </span>');
    const T = S.title;
    h1.innerHTML = `<span class="before">${chars(T.before)}</span>` +
      `<em class="aside" style="font-style:normal" aria-hidden="true">${chars(T.aside ? ' ' + T.aside : '')}</em>` +
      `<span class="after">${chars(' ' + T.after)}</span>` +
      `<em class="aside tail" style="font-style:normal" aria-hidden="true">${chars(T.tail || '')}</em>`;
    h1.setAttribute('aria-label', `${T.before} ${T.after}`);
    blurb.innerHTML = [].concat(S.blurb).map((p) => `<span class="phrase">${words(p)}</span>`).join('<span class="ch"> </span>');

    const go = document.querySelector('.hero__go');
    go.innerHTML = Site.seam('a', `href="${Site.url(S.cta.href)}"`, S.cta.label, Site.icon.right);
    document.querySelector('.track__label').textContent = S.labels.dragToTurn;
    document.querySelector('.turn-left').innerHTML = Site.icon.left;
    document.querySelector('.turn-right').innerHTML = Site.icon.right;

    // 轉一圈的格數＝人物圖的張數（每格一張、一圈剛好不重複）；還沒放圖時用 S.steps
    const steps = S.situations.length || S.steps;

    /* ---------- 開場 ---------- */
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const late = [go, document.querySelector('.mast'), document.querySelector('.track')];
    const all = (sel) => [...h1.querySelectorAll(sel + ' .ch')];
    const aside = all('.aside:not(.tail)'), tail = all('.tail');
    let ready = false;

    async function intro() {
      if (reduce || !withIntro) {
        field && field.grow();
        h1.classList.add('is-on');
        [...all('.before'), ...all('.after'), ...blurb.querySelectorAll('.ch')].forEach((c) => c.classList.add('is-on'));
        late.forEach((el) => el.classList.add('is-in'));
        ready = true;
        return;
      }
      late.forEach((el) => el.classList.add('fade-in'));
      await wait(100); field && field.grow();
      await wait(500); h1.classList.add('is-on');
      await wait(1200);
      const type = async (list) => { for (const c of list) { c.classList.add('is-on'); await wait(c.textContent === ' ' ? 110 : 45 + Math.random() * 45); } };
      await type(all('.before'));
      if (aside.length) {
        await type(aside);
        await wait(830);
        for (const c of [...aside].reverse()) { c.classList.remove('is-on'); await wait(33); }
        await wait(220);
      }
      await type(all('.after'));
      await wait(500);
      for (const c of blurb.querySelectorAll('.ch')) { c.classList.add('is-on'); if (Math.random() < 0.9) await wait(16); }
      await wait(330);
      late.forEach((el) => el.classList.add('is-in'));
      ready = true;
    }
    intro();

    /* ---------- 標題互動 ----------
       1. 滑鼠靠近的字會變粗、變圓（離越近越明顯）
       2. 滑鼠移到標題上：打出「not」再補「?」；移開就刪掉
       3. 手機、平板沒有滑鼠：點一下標題＝移上去，再點一下收回 */
    let mouse = null, tapped = false;
    let hovering = false, hoverToken = 0;
    const onTitle = (p, pad = 0) => {
      const r = h1.getBoundingClientRect();
      return p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad;
    };
    async function hoverIn() {
      const me = ++hoverToken;
      await wait(100);
      for (const c of aside) {
        if (me !== hoverToken) return;
        c.classList.add('is-on');
        await wait(60 + Math.random() * 100);
      }
      await wait(200);
      if (me !== hoverToken) return;
      tail.forEach((c) => c.classList.add('is-on'));
    }
    async function hoverOut() {
      const me = ++hoverToken;
      tail.forEach((c) => c.classList.remove('is-on'));
      for (const c of [...aside].reverse()) {
        if (me !== hoverToken) return;
        if (!c.classList.contains('is-on')) continue;
        c.classList.remove('is-on');
        await wait(40);
      }
    }

    const titleChars = [...h1.querySelectorAll('.ch')];
    const weight = new Map(titleChars.map((c) => [c, 0]));
    const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    function titleLoop() {
      if (ready && !reduce && Home.active) {
        const over = mouse && !mouse.touch ? onTitle(mouse) : tapped;
        if (over !== hovering) { hovering = over; over ? hoverIn() : hoverOut(); }
        const reach = parseFloat(getComputedStyle(h1).fontSize) * 2.03;
        for (const c of titleChars) {
          let target = 0;
          if (mouse && c.offsetParent) {
            const b = c.getBoundingClientRect();
            target = 1 - sm(Math.hypot(mouse.x - (b.left + b.width / 2), mouse.y - (b.top + b.height / 2)) / reach);
          }
          const now = weight.get(c);
          const next = now + (target - now) * 0.22;
          if (Math.abs(next - now) > 0.001 || (target === 0 && now !== 0)) {
            const f = Math.abs(next) < 0.002 ? 0 : next;
            weight.set(c, f);
            c.style.fontVariationSettings = `"wght" ${Math.round(340 + 380 * f)}, "opsz" ${Math.round(12 + 132 * f)}, "SOFT" ${Math.round(40 * f)}, "WONK" 1`;
          }
        }
      }
      requestAnimationFrame(titleLoop);
    }
    titleLoop();

    /* ---------- 轉動：整頁拖曳、滑桿、方向鍵 ---------- */
    if (!field) return;
    const bar = document.querySelector('.track__bar');
    const thumb = document.querySelector('.track__thumb');
    const segL = document.querySelector('.track__seg--l');
    const segR = document.querySelector('.track__seg--r');
    let angle = 0;

    const mod = (v) => ((v % steps) + steps) % steps;
    function setAngle(a, snap) {
      angle = snap ? Math.round(a) : a;
      field.setAngle(angle);
      field.setSituation(Math.round(angle));
      bar.setAttribute('aria-valuenow', mod(Math.round(angle)));
    }
    function paintTrack() {
      const w = bar.clientWidth;
      const a = mod(field.angle);
      // 最後一格轉回第一格時，滑桿也從最右邊滑回最左邊
      const x = (a <= steps - 1 ? a / (steps - 1) : steps - a) * w;
      const gap = 6;
      thumb.style.left = x + 'px';
      segL.style.width = Math.max(0, x - gap) + 'px';
      segR.style.width = Math.max(0, w - x - gap) + 'px';
      requestAnimationFrame(paintTrack);
    }
    paintTrack();

    // 滑鼠位置：給標題互動用（撥草在 app.js，列表頁也要）
    const point = (e) => ({ x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' });
    document.addEventListener('pointermove', (e) => { mouse = point(e); });
    document.documentElement.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mouse = null; });

    // 手指：點一下標題（沒有拖動）就切換「not ?」；按到的字一樣會變粗，放開後停一下再變回來
    let tap = null, letGo = 0;
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      clearTimeout(letGo);
      mouse = point(e);
      tap = Home.active && ready && onTitle(mouse, 12) ? mouse : null;
    });
    const lift = (e) => {
      if (e.pointerType === 'mouse') return;
      if (tap && e.type === 'pointerup' && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 12) tapped = !tapped;
      tap = null;
      clearTimeout(letGo);
      letGo = setTimeout(() => { mouse = null; }, 350);
    };
    document.addEventListener('pointerup', lift);
    document.addEventListener('pointercancel', lift);

    // 整頁都可以拖曳轉動（按鈕、連結、滑桿除外）
    let drag = null;
    document.addEventListener('pointerdown', (e) => {
      if (!Home.active || e.button !== 0 || e.target.closest('a, button, input, .track, .mast')) return;
      drag = { x: e.clientX, a: angle };
      document.body.classList.add('is-dragging');
    });
    document.addEventListener('pointermove', (e) => {
      if (drag) setAngle(drag.a - (e.clientX - drag.x) / 70);
    });
    const end = () => { if (!drag) return; drag = null; document.body.classList.remove('is-dragging'); setAngle(angle, true); };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);

    const clampV = (v) => Math.max(0, Math.min(1, v));
    function fromBar(e) {
      const r = bar.getBoundingClientRect();
      setAngle(angle - mod(angle) + clampV((e.clientX - r.left) / r.width) * (steps - 1));
    }
    let barDrag = false;
    bar.addEventListener('pointerdown', (e) => { if (!Home.active) return; barDrag = true; bar.setPointerCapture(e.pointerId); fromBar(e); });
    bar.addEventListener('pointermove', (e) => { if (barDrag) fromBar(e); });
    bar.addEventListener('pointerup', () => { if (!barDrag) return; barDrag = false; setAngle(angle, true); });

    document.querySelector('.turn-left').addEventListener('click', () => setAngle(Math.round(angle) - 1, true));
    document.querySelector('.turn-right').addEventListener('click', () => setAngle(Math.round(angle) + 1, true));
    document.addEventListener('keydown', (e) => {
      if (!Home.active || e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowLeft') setAngle(Math.round(angle) - 1, true);
      if (e.key === 'ArrowRight') setAngle(Math.round(angle) + 1, true);
    });
  }
})();
