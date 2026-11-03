/* 飄落的草和花瓣：一兩根小草葉、偶爾一小瓣花瓣，從左上被風吹著往右下飄，蓋在所有東西最前面（全螢幕檢視器除外）。
   只出現在首頁和作品列表；進到單篇作品時淡出、不再補新的（Vic 2026-11-01）。
   形狀、顏色跟草地（field.js）同一套：圓頭葉形、橄欖綠色系，偶爾一根乾草色或鏽紅，不描邊；花瓣用草地小花的顏色。
   調整都在下面 TUNE。數值都乘上兩把「尺」：
   - S（大小、往下掉的速度）＝視窗高度，但最少 700：手機橫放時畫面很矮，不然草和花瓣會小到看不見
   - R（往右吹、左右飄）＝S，但不超過寬度 × 0.5625（16:9）：手機直放時畫面很窄，不然一下就吹出右邊，要像桌機一樣斜斜飄過整個畫面 */
(function () {
  'use strict';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const TUNE = {
    grass: {
      max: 2,                  // 畫面上最多同時幾根草
      gap: [2.2, 5],           // 每隔幾秒補一根（秒，隨機）；畫面上一根都沒有時會很快補
      length: [0.035, 0.06],   // 長度（× S）
      width: [0.0045, 0.0065], // 寬度（× S）
      fall: [0.06, 0.095],     // 往下掉的速度（× S／秒）
      wind: [0.17, 0.25],      // 往右吹的速度（× R／秒）；跟 fall 的比例決定多斜（2026-11-01 Vic：更快、更斜）
      spin: [1.8, 3.4],        // 翻面的速度（弧度／秒）
      rock: [0.3, 0.7],        // 像鐘擺一樣晃的幅度（弧度）
    },
    petal: {
      max: 1,                  // 花瓣同時最多一瓣
      gap: [4, 9],
      length: [0.011, 0.015],
      width: [0.0075, 0.01],
      fall: [0.045, 0.07],     // 花瓣比草輕，掉得慢一點、翻得快一點
      wind: [0.16, 0.23],
      spin: [3, 5],
      rock: [0.6, 1.1],
    },
    gust: 0.7,                 // 陣風強弱（0 = 一直同樣的風）
    sway: 0.03,                // 左右飄的幅度（× R）
  };

  // 草：field.js 的 BASE / PALE / DEEP / COOL / DRY / WARM / RED；花瓣：草地小花的粉、黃、淡紫（白色在淺底上看不到，不用）
  // 後面數字是出現比重
  const COLORS = {
    grass: [['#8b9c65', 30], ['#aab877', 24], ['#687954', 14], ['#94a283', 10], ['#bdb894', 12], ['#db7040', 5], ['#d2543a', 5]],
    petal: [['#f2c4cf', 50], ['#f6e3a1', 28], ['#b9c3ef', 22]],
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => {
    let n = Math.random() * list.reduce((s, c) => s + c[1], 0);
    for (const c of list) if ((n -= c[1]) < 0) return c[0];
    return list[0][0];
  };
  const shade = (hex, k) => {
    const v = [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k)));
    return `rgb(${v[0]},${v[1]},${v[2]})`;
  };

  const canvas = document.createElement('canvas');
  canvas.className = 'drift';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, S = 0, R = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    S = Math.max(H, 700); R = Math.min(S, W * 0.5625);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  resize();
  addEventListener('resize', resize);

  /* ---------- 一根草葉／一瓣花瓣 ---------- */
  function spawn(kind, first) {
    const T = TUNE[kind];
    const len = rand(...T.length) * S;
    // 從畫面外的左邊或上面進來（左上那一帶）
    let x, y;
    if (Math.random() < 0.6) { x = -len; y = rand(-0.1, 0.55) * H; }
    else { x = rand(-0.05, 0.4) * W; y = -len; }
    // 剛打開網頁時第一根直接在畫面裡，不用等它飄進來
    if (first) { x = rand(0.05, 0.3) * W; y = rand(0.02, 0.18) * H; }
    return {
      kind, x, y, len,
      w: rand(...T.width) * S,
      fall: rand(...T.fall), wind: rand(...T.wind),
      angle: rand(0, Math.PI * 2),              // 指的方向
      turn: rand(-0.5, 0.5),                    // 慢慢轉的速度
      rock: rand(...T.rock), rockSpeed: rand(0.9, 1.6), rockPhase: rand(0, 6.28),
      twist: rand(0, 6.28), spin: rand(...T.spin) * (Math.random() < 0.5 ? -1 : 1), // 翻面
      bend: rand(0.12, 0.32) * (Math.random() < 0.5 ? -1 : 1),   // 草彎的程度
      bendPhase: rand(0, 6.28),
      swayPhase: rand(0, 6.28), swaySpeed: rand(0.7, 1.3),
      shape: rand(2.2, 3.6),                    // 葉尖收的方式（跟 field.js 一樣）
      color: pick(COLORS[kind]),
    };
  }

  // 草：沿著彎曲的中線，兩側照葉形寬度描出來，葉尖是圓的
  function grassPath(b, t, wk) {
    const L = b.len;
    const bend = b.bend * (0.75 + 0.25 * Math.sin(t * 2.1 + b.bendPhase)) * L;
    const N = 18, left = [], right = [];
    const outer = 0.5 - 0.14 * Math.min(1, Math.max(0, (b.shape - 2) / 2.6));
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const px = (s - 0.5) * L, py = bend * (s * s - 0.33);
      const dx = L, dy = bend * 2 * s;          // 中線的切線方向，用來算兩側
      const dl = Math.hypot(dx, dy);
      const nx = -dy / dl, ny = dx / dl;
      const half = 0.5 * b.w * wk * Math.pow(Math.max(0, 1 - Math.pow(s, b.shape)), outer) * (i === 0 ? 0.85 : 1);
      left.push([px + nx * half, py + ny * half]);
      right.push([px - nx * half, py - ny * half]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(left[i][0], left[i][1]);
    for (let i = N; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
  }

  // 花瓣：根部窄、前端圓的水滴形
  function petalPath(b, wk) {
    const L = b.len, w = 0.5 * b.w * wk;
    ctx.beginPath();
    ctx.moveTo(-L / 2, 0);
    ctx.bezierCurveTo(-L * 0.2, -w * 1.15, L / 2, -w * 1.1, L / 2, 0);
    ctx.bezierCurveTo(L / 2, w * 1.1, -L * 0.2, w * 1.15, -L / 2, 0);
    ctx.closePath();
  }

  function draw(b, t) {
    const L = b.len;
    const flip = Math.cos(b.twist);                  // 翻面：寬度在正面、側面之間變化
    const wk = 0.12 + 0.88 * Math.abs(flip);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle + b.rock * Math.sin(t * b.rockSpeed + b.rockPhase));
    if (b.kind === 'grass') grassPath(b, t, wk); else petalPath(b, wk);
    // 根部偏暗、尖端偏亮（跟草地的根部陰影一樣）；翻到背面時暗一點
    const back = flip < 0 ? 0.9 : 1;
    const g = ctx.createLinearGradient(-L / 2, 0, L / 2, 0);
    if (b.kind === 'grass') {
      g.addColorStop(0, shade(b.color, 0.78 * back));
      g.addColorStop(0.55, shade(b.color, 1.0 * back));
      g.addColorStop(1, shade(b.color, 1.06 * back));
    } else {
      // 花瓣在淺色背景上：根部稍深，才看得出形狀
      g.addColorStop(0, shade(b.color, 0.8 * back));
      g.addColorStop(0.6, shade(b.color, 0.97 * back));
      g.addColorStop(1, shade(b.color, 1.02 * back));
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  /* ---------- 動畫 ---------- */
  const items = [spawn('grass', true)];
  const next = { grass: rand(...TUNE.grass.gap), petal: rand(2, 5) };
  let last = performance.now(), time = 0;
  // 只在首頁和作品列表出現（app.js 換頁時會給 body 加 at-post）
  const onPost = () => document.body.classList.contains('at-post');

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);  // 切到別的分頁再回來不要一次跳很遠
    last = now; time += dt;

    // 陣風：全部一起吹，忽強忽弱
    const gust = 1 + TUNE.gust * (0.6 * Math.sin(time * 0.5) + 0.4 * Math.sin(time * 1.2 + 1.3));

    if (!onPost()) {
      for (const kind of ['grass', 'petal']) {
        const count = items.filter((b) => b.kind === kind).length;
        next[kind] -= dt;
        if (kind === 'grass' && count === 0) next.grass = Math.min(next.grass, 0.6);  // 沒有草時不要空太久
        if (next[kind] <= 0) {
          if (count < TUNE[kind].max) items.push(spawn(kind, false));
          next[kind] = rand(...TUNE[kind].gap);
        }
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let i = items.length - 1; i >= 0; i--) {
      const b = items[i];
      const sway = Math.cos(time * b.swaySpeed + b.swayPhase) * TUNE.sway * R * b.swaySpeed;
      b.x += (b.wind * R * gust + sway * 0.6) * dt;
      b.y += (b.fall * S + sway * 0.35 + Math.sin(b.twist) * 0.012 * S) * dt;
      b.angle += b.turn * gust * dt;
      b.twist += b.spin * (0.7 + 0.3 * gust) * dt;
      // 飄出右邊或下面就收掉
      if (b.x - b.len > W || b.y - b.len > H) { items.splice(i, 1); continue; }
      draw(b, time);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
