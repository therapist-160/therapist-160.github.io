/* 草地 WebGL：插畫風的草（自寫）。
   做法重點：正投影相機（沒有透視，像平面插畫）、圓頭的葉子、葉子朝向鏡頭、
   每片葉子吃它根部那點「地面色彩地圖」的顏色（所以會連成色塊）、根部陰影、少數葉子描邊。
   只有一片草地：首頁是整塊可以轉的草地，到作品列表時同一片草地鏡頭拉近變成畫面下方的草丘（setView 0 → 1）。 */
(function () {
  'use strict';

  /* ---------- 小工具 ---------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Info 頁的鏡頭：zoom＝每 1 單位幾倍視窗高度（首頁 0.49、列表 1.093）；maxWidth＝窄螢幕時最多幾倍視窗寬度；
  // feet＝人物腳下的地面在畫面高度的哪裡（0 最上、1 最下）；midFeet＝高度 1000→720 時再往下多少；lowFeet＝矮螢幕（高度 390 左右）再往下多少
  // 讓位給文字：app.js 會告訴草地 Info 文字的底在哪（setInfoRoom），人物會縮小到頭頂在文字下方 gap 像素，
  //   但最小 minZoom × 視窗高度（首頁是 0.49）；head＝人物頭頂大約在地面上方幾倍 ppw（量 01 跟貓咪玩的逗貓棒頂端）
  //   文字長到人物要縮到 giveUp × 視窗高度以下才放得下時（手機），就不縮了：人物維持原本大小，文字捲到草後面
  //   midFeet 只用在橫向螢幕（直向手機維持 Vic 看過的位置）
  const INFO = { zoom: 0.8, maxWidth: 1.05, feet: 0.92, midFeet: 0.04, lowFeet: 0.04, minZoom: 0.55, giveUp: 0.3, head: 0.36, gap: 20 };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (t) => t * t * (3 - 2 * t);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const FLOWERS = ['#f4f1e6', '#f4f1e6', '#f4f1e6', '#b9c3ef', '#f2c4cf', '#f6e3a1'].map(hex);

  /* ---------- 矩陣 ---------- */
  function ortho(l, r, b, t, n, f) {
    return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1];
  }
  function lookAt(e, c, u) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
  }
  function mul(a, b) {
    const o = new Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s;
    }
    return o;
  }

  /* ---------- 著色器 ---------- */
  const HEAD = `#version 300 es
precision highp float;
`;
  // 白天／黃昏／夜晚的光（Vic 2026-11-01）：光源在畫面右上方、草地後面（黃昏＝太陽，夜晚＝月亮）。
  // 草和人物變暗（SHADE），朝光那一側的邊緣亮起輪廓光（SUN）。強度和顏色每一格從 window.SUNLIGHT 讀（sunlight.js 依時間算好）；
  // 沒有 sunlight.js 時全部是 0＝原本的白天。
  const SUN = `
uniform float uShadeK, uGrassRimK, uCharRimK;   // 強度：壓暗、草葉金邊、人物金邊
uniform vec3 uRimCol, uShadeCol;                // 輪廓光的顏色、變暗的顏色
#define SUN uRimCol
#define SHADE uShadeCol
`;
  // 地面色彩地圖：大片的淺綠／底綠／深藍綠陰影，加上冷灰綠和鏽紅色塊
  const FIELD = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ return 0.5*vnoise(p) + 0.3*vnoise(p*2.03+17.0) + 0.2*vnoise(p*4.01+31.0); }
float terrain(vec2 p){ float d = length(p); return 0.03*(fbm(p*1.6+5.0)-0.45) + 0.03*max(0., 1.-d*d); }
// 顏色取自原站截圖：偏黃的橄欖綠，紅色是偏橘、不太艷的鏽紅
const vec3 BASE = vec3(0.546, 0.613, 0.396);
const vec3 PALE = vec3(0.666, 0.721, 0.466);
const vec3 DEEP = vec3(0.408, 0.475, 0.328);
const vec3 WARM = vec3(0.861, 0.441, 0.252);
const vec3 COOL = vec3(0.582, 0.636, 0.515);
const vec3 DRY  = vec3(0.740, 0.720, 0.580);
// 零星的朱紅：比 WARM 更紅、更飽和（量原站截圖約 #D2543A）
const vec3 RED  = vec3(0.823, 0.330, 0.228);
vec3 fieldColor(vec2 p, float d){
  // 色塊之間用很寬的漸層慢慢過渡，不要有明顯交界
  float n = fbm(p*0.9 + 3.0);
  float m = fbm(p*1.6 - 7.0);
  float w = fbm(p*2.6 + 11.0);
  vec3 c = mix(DEEP, BASE, smoothstep(0.25, 0.55, n));
  c = mix(c, PALE, smoothstep(0.48, 0.78, n) * 0.85);
  c = mix(c, COOL, smoothstep(0.45, 0.8, m) * 0.35);
  c = mix(c, DRY, smoothstep(0.75, 1.05, d) * 0.3);
  // 中等大小的深綠塊散落在綠色之間，邊緣一樣用寬漸層融開
  float s = fbm(p*4.2 - 23.0);
  c = mix(c, DEEP*0.95, smoothstep(0.5, 0.78, s) * 0.45);
  // 鏽紅色塊：橘紅到朱紅之間變化；另外散落幾小團朱紅（都畫在地圖上，相鄰葉子同色才像筆刷色塊）
  vec3 rust = mix(WARM, RED, vnoise(p*3.0 + 9.0));
  c = mix(c, rust, smoothstep(0.62, 0.75, w) * 0.75);
  c = mix(c, RED, smoothstep(0.7, 0.8, fbm(p*5.5 + 40.0)) * 0.7);
  return c;
}
`;
  const COMMON_VS = FIELD + `
layout(location=0) in vec2 aSeg;
layout(location=1) in vec4 aPos;
layout(location=2) in vec4 aShape;
layout(location=3) in vec4 aCol;
uniform mat4 uVP; uniform float uTime, uGrow, uWind; uniform vec2 uShift;
uniform vec3 uRight, uUp;
uniform vec4 uBalls[9];
uniform vec3 uFarCol;   // 遠處草地融進去的顏色（白天米灰、夜晚深藍）
float growth(float d){ float g = clamp((uGrow - d*0.8)/0.4, 0., 1.); return g*g*(3.-2.*g); }
vec4 project(vec3 p){ vec4 c = uVP*vec4(p,1.); c.xy += uShift*c.w; return c; }
`;

  // 草葉：aPos(x, z, 離中心距離, 相位) aShape(高, 寬, 傾倒方向, 傾倒量) aCol(色差, 描邊 1／紅的程度 負值, 深淺, 圓度)
  const BLADE_VS = HEAD + COMMON_VS + `
uniform float uRootShade;
out vec3 vCol; out float vSide, vT, vOutline, vWisp, vLayer; out vec2 vNdc;
void main(){
  float g = growth(aPos.z);
  float t = aSeg.y;
  vec3 base = vec3(aPos.x, terrain(aPos.xy), aPos.y);
  float h = aShape.x * g;

  // 風：一整片一起動，再加一點細的顫動
  float wave = fbm(base.xz*0.9 - vec2(0.8, 0.6)*uTime*0.95)*2.0 - 1.0;
  float flutter = sin(uTime*5.2 + aPos.w*2.1) * 0.09;
  float force = uWind*(0.42 + 0.85*wave) + flutter*uWind;
  vec2 push = vec2(cos(aShape.z), sin(aShape.z))*aShape.w + vec2(0.8, 0.6)*force;
  // 滑鼠經過的地方把草往外撥、同時壓扁（含淡出中的尾跡），整區像被按下去一樣沉下去
  float squash = 0.0;
  for (int i = 0; i < 9; i++) {
    vec4 b = uBalls[i];
    if (b.w <= 0.0) continue;
    vec2 d = base.xz - b.xy;
    float len = length(d);
    float k = (1.0 - smoothstep(b.z*0.5, b.z*2.1, len)) * b.w;
    push += d / max(len, 0.001) * k * 2.4;
    squash = max(squash, k);
  }
  float pl = length(push); if (pl > 1.4) push *= 1.4/pl;
  h *= 1.0 - 0.6*clamp(squash, 0., 1.);

  vec3 p = base;
  p.xz += push * (t*t) * h;
  p.y += h * t * (1.0 - 0.35*min(1.0, dot(push, push))*t);

  // 圓頭葉形：整段幾乎等寬，快到頂才收
  float shape = aCol.w;
  float outer = mix(0.5, 0.36, clamp((shape - 2.0)/2.6, 0., 1.));
  float w = aShape.y * pow(max(0., 1.0 - pow(t, shape)), outer) * (0.4 + 0.6*g);
  p += uRight * aSeg.x * w * 0.5;
  gl_Position = project(p);
  vNdc = gl_Position.xy / gl_Position.w;

  vec3 col = fieldColor(base.xz, aPos.z) * (0.96 + 0.08*aCol.x);
  // 每叢草各自的深淺（aCol.z：-1 深綠、+1 淺綠、2 乾草色），讓深綠一叢叢跟綠色交錯
  float tone = aCol.z;
  if (tone > 1.5) col = mix(col, DRY*0.95, 0.6);
  else {
    col = mix(col, DEEP*0.9, max(0., -tone) * 0.45);
    col = mix(col, PALE, max(0., tone) * 0.2);
  }
  // 紅葉子（aCol.y 為負值＝紅的程度），在朱紅和橘紅之間變化
  float red = max(0., -aCol.y);
  col = mix(col, mix(RED, WARM, aCol.x*0.6), red);
  // 上下層：矮草（下層）偏暗偏冷，高草（上層）偏亮偏暖
  float layer = smoothstep(0.02, 0.16, aShape.x);
  col *= mix(vec3(0.9, 0.92, 0.92), vec3(1.05, 1.04, 0.99), layer);
  // 根部陰影：拉長成緩的漸層
  col *= mix(1.0 - uRootShade, 1.0, smoothstep(0.0, 0.9, t));
  col += vec3(0.04, 0.04, 0.02) * t * layer;
  // 前後層：越後面越淡，帶一點空氣感
  vec2 fwd = vec2(uRight.z, -uRight.x);
  float far = smoothstep(-0.8, 1.1, dot(base.xz, fwd));
  col = mix(col, uFarCol, far * 0.22);
  // 細長草絲越往上越淡，融進背景，不要像畫出來的線
  if (aCol.w < 1.17) col = mix(col, uFarCol * 1.05, t * 0.35);
  vCol = col; vSide = aSeg.x; vT = t; vOutline = step(0.5, aCol.y);
  vWisp = step(aCol.w, 1.17); vLayer = layer;
}`;
  const BLADE_FS = HEAD + SUN + `
in vec3 vCol; in float vSide, vT, vOutline, vWisp, vLayer; in vec2 vNdc; out vec4 o;
void main(){
  vec3 c = vCol;
  if (vOutline > 0.5 && (abs(vSide) > 0.7 || vT > 0.95)) c = vec3(0.16, 0.2, 0.15);
  // 逆光：葉子本身暗一點；越靠近太陽（畫面右上）的草，邊緣越亮
  float toward = clamp(0.55 + 0.45*vNdc.x + 0.35*vNdc.y, 0., 1.);
  c *= mix(vec3(1.), SHADE, uShadeK);
  float rim = smoothstep(0.3, 0.9, vSide) * 1.1     // 右邊緣（朝太陽那一側）
            + smoothstep(0.7, 1.0, vT) * 0.9;        // 葉尖透光
  rim *= smoothstep(0.15, 0.6, vT) * mix(0.55, 1.0, vLayer) * (0.25 + 0.75*toward);
  // 細長的草絲整根透光，像照片裡貓的鬍鬚
  rim = max(rim, vWisp * smoothstep(0.1, 0.8, vT) * (0.5 + 0.5*toward));
  c = mix(c, SUN * 1.4, clamp(rim, 0., 1.) * 0.95 * uGrassRimK);
  o = vec4(c, 1.);
}`;

  // 草下面的地面：跟草同一套色塊，撥開草時露出來的是同色的地，不是背景
  // aSeg = 地面上的 xz，aPos.x = 離中心距離
  const GROUND_VS = HEAD + COMMON_VS + `
out vec2 vXZ; out float vD, vFar;
void main(){
  vXZ = aSeg; vD = aPos.x;
  gl_Position = project(vec3(aSeg.x, terrain(aSeg) - 0.002, aSeg.y));
  vec2 fwd = vec2(uRight.z, -uRight.x);
  vFar = smoothstep(-0.8, 1.1, dot(aSeg, fwd));
}`;
  const GROUND_FS = HEAD + FIELD + SUN + `
uniform float uGrow, uRootShade; uniform vec3 uFarCol;
in vec2 vXZ; in float vD, vFar; out vec4 o;
void main(){
  // 邊緣不規則，收在草地外圈的碎點裡面；跟著草一起從中間長出來
  if (vD + (fbm(vXZ*7.0) - 0.5)*0.12 > 0.84) discard;
  if (clamp((uGrow - vD*0.8)/0.4, 0., 1.) < 0.35) discard;
  // 顏色跟草根一樣偏暗，看起來是草叢的底
  vec3 c = fieldColor(vXZ, vD) * (1.0 - uRootShade*0.7);
  c = mix(c, uFarCol, vFar * 0.22);
  c *= mix(vec3(1.), SHADE, uShadeK);
  o = vec4(c, 1.);
}`;

  // 地面碎點：aPos(x, z, 距離, 旋轉) aShape(大小, 長寬比, 種子, -) aCol(色差, 紅, -, -)
  const DAB_VS = HEAD + COMMON_VS + `
out vec2 vUv; out float vSeed; out vec3 vCol;
void main(){
  float g = growth(aPos.z);
  vec2 c = aSeg * vec2(aShape.x*aShape.y, aShape.x) * g;
  float cr = cos(aPos.w), sr = sin(aPos.w);
  vec2 r = vec2(c.x*cr - c.y*sr, c.x*sr + c.y*cr);
  vec2 xz = aPos.xy + r;
  gl_Position = project(vec3(xz.x, terrain(aPos.xy) + 0.001, xz.y));
  vUv = aSeg; vSeed = aShape.z;
  vCol = fieldColor(aPos.xy, aPos.z) * (0.8 + 0.12*aCol.x);
  vCol = mix(vCol, RED*0.92, aCol.y);
}`;
  const DAB_FS = HEAD + SUN + `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
in vec2 vUv; in float vSeed; in vec3 vCol; out vec4 o;
void main(){
  float n = vnoise(vUv*2.6 + vSeed*17.0)*0.62 + vnoise(vUv*7.0 + vSeed*5.0)*0.38;
  if (length(vUv) + (n-0.5)*0.9 > 0.75) discard;
  o = vec4(vCol * mix(vec3(1.), SHADE, uShadeK), 1.);
}`;

  // 小花：aPos(x, z, 距離, 相位) aShape(大小, 高度, -, 花瓣數) aCol(rgb, 花心)
  const FLOWER_VS = HEAD + COMMON_VS + `
out vec2 vUv; out vec3 vCol; out float vPetals; out float vCenter;
void main(){
  float g = growth(aPos.z);
  float sway = sin(uTime*2.2 + aPos.x*1.6 + aPos.y*1.2 + aPos.w) * uWind * aShape.y * 0.8;
  vec3 c = vec3(aPos.x + 0.8*sway, terrain(aPos.xy) + aShape.y*g, aPos.y + 0.6*sway);
  float s = aShape.x * g;
  gl_Position = project(c + uRight*aSeg.x*s + uUp*aSeg.y*s*0.85);
  vUv = aSeg; vCol = aCol.rgb; vPetals = aShape.w; vCenter = aCol.w;
}`;
  const FLOWER_FS = HEAD + SUN + `
in vec2 vUv; in vec3 vCol; in float vPetals; in float vCenter; out vec4 o;
void main(){
  float r = length(vUv); float a = atan(vUv.y, vUv.x);
  float petal = 0.5 + 0.5*pow(abs(cos(a*vPetals*0.5)), 0.6);
  if (r > petal*0.95) discard;
  vec3 c = r < 0.26 ? (vCenter > 0.5 ? vec3(0.93,0.72,0.25) : vec3(0.88,0.80,0.45)) : vCol;
  c *= mix(vec3(1.), SHADE, uShadeK * 0.7);
  o = vec4(c, 1.);
}`;

  const CHAR_VS = HEAD + `
layout(location=0) in vec2 aSeg;
uniform mat4 uVP; uniform vec2 uShift; uniform vec3 uCenter, uRight; uniform vec2 uSize;
out vec2 vUv;
void main(){
  vec3 p = uCenter + uRight*aSeg.x*uSize.x*0.5 + vec3(0.,1.,0.)*(aSeg.y*0.5+0.5)*uSize.y;
  vec4 c = uVP*vec4(p,1.); c.xy += uShift*c.w; gl_Position = c;
  vUv = vec2(aSeg.x*0.5+0.5, 0.5-aSeg.y*0.5);
}`;
  // 人物：洋紅色背景自動去背
  // 逆光：往太陽的方向（右上）看過去如果已經是背景，這一點就是朝太陽的邊緣 → 亮起金色輪廓光；
  // 邊緣外面再暈開一點點光，像照片裡毛邊發光
  const CHAR_FS = HEAD + SUN + `
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uFade; uniform vec2 uTexel;
float key(vec2 uv){
  vec4 t = texture(uTex, uv);
  float m = min(t.r, t.b) - t.g;
  return (1.0 - smoothstep(0.16, 0.42, m)) * t.a;
}
void main(){
  vec4 t = texture(uTex, vUv);
  float a = key(vUv);
  vec2 L = normalize(vec2(0.8, -1.0)) * uTexel;   // 往太陽的方向（貼圖的 y 是往下）
  float rim = 0.0, halo = 0.0;
  if (uCharRimK > 0.0) {
    // 最外緣一條細亮線，往內很快淡掉（像毛邊透光），再加一點點寬的暖光包進來
    float o1 = key(vUv + L*1.5), o2 = key(vUv + L*4.0), o3 = key(vUv + L*10.0);
    rim = a * ((1.0 - o1) * 1.6 + (1.0 - o2) * 0.4 + (1.0 - o3) * 0.12);
    // 只暈出細細一圈，越外面越淡（太粗會像貼紙的白邊）；再往外的發光交給彌散光
    float i1 = key(vUv - L*1.5), i2 = key(vUv - L*3.5);
    halo = (1.0 - a) * (i1*0.55 + i2*0.15);
  }
  if (a < 0.02 && halo < 0.02) discard;
  vec3 c = t.rgb;
  float spill = max(0., min(c.r, c.b) - c.g);
  c.r -= spill*0.55; c.b -= spill*0.8;
  c *= mix(vec3(1.), SHADE * 0.92, uShadeK);
  c = mix(c, SUN * 1.5, clamp(rim, 0., 1.) * uCharRimK);
  vec3 pre = c * a + SUN * halo * uCharRimK;
  float alpha = max(a, halo * 0.85 * uCharRimK);
  o = vec4(pre, alpha) * uFade;
}`;

  // ---------- 彌散光（後製）----------
  // 整個畫面先畫在看不見的畫布上，再：①挑出最亮的地方（金邊、葉尖）模糊成光暈 ②整個畫面模糊一份當光霧 ③疊回去
  // 像相機的柔焦濾鏡（黑柔焦）。強度在下面 GLOW。
  const GLOW = {
    threshold: 0.58,   // 多亮才會發光（0–1，越小越多地方發光）
    bloom: 2.2,        // 亮處光暈的強度
    mist: 0.42,        // 整片光霧的強度（0 = 沒有柔焦）
    spread: 1.6,       // 光暈擴散的範圍
  };
  const POST_VS = HEAD + `
layout(location=0) in vec2 aSeg; out vec2 vUv;
void main(){ vUv = aSeg*0.5 + 0.5; gl_Position = vec4(aSeg, 0., 1.); }`;
  // 縮小成 1/4（順便平均 4×4 像素）；uThresh > 0 時只留下亮的地方
  const PRE_FS = HEAD + `
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThresh;
void main(){
  vec4 c = 0.25*(texture(uTex, vUv + uTexel*vec2(-1.,-1.)) + texture(uTex, vUv + uTexel*vec2(1.,-1.))
               + texture(uTex, vUv + uTexel*vec2(-1.,1.)) + texture(uTex, vUv + uTexel*vec2(1.,1.)));
  if (uThresh > 0.0) {
    vec3 col = c.rgb / max(c.a, 1e-3);
    float lum = dot(col, vec3(0.3, 0.59, 0.11));
    c *= smoothstep(uThresh, uThresh + 0.22, lum);
  }
  o = c;
}`;
  const BLUR_FS = HEAD + `
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec4 c = texture(uTex, vUv) * 0.2270;
  c += (texture(uTex, vUv + uDir*1.3846) + texture(uTex, vUv - uDir*1.3846)) * 0.3162;
  c += (texture(uTex, vUv + uDir*3.2308) + texture(uTex, vUv - uDir*3.2308)) * 0.0703;
  o = c;
}`;
  const COMP_FS = HEAD + `
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom, uMist; uniform float uBloomK, uMistK; uniform vec3 uGlowCol;
void main(){
  vec4 s = texture(uScene, vUv), b = texture(uBloom, vUv), m = texture(uMist, vUv);
  // 柔焦：模糊的畫面比較亮的地方就換成模糊的（變亮混合），邊緣也會糊糊地暈出去
  vec4 c = s + max(m - s, vec4(0.)) * uMistK;
  // 亮處光暈：直接加上去（偏暖）
  vec3 add = b.rgb * uGlowCol * uBloomK;
  c.rgb += add;
  c.a = clamp(c.a + dot(add, vec3(0.3, 0.59, 0.11)), 0., 1.);
  c.rgb = min(c.rgb, vec3(c.a));
  o = c;
}`;

  function compile(gl, vs, fs) {
    const p = gl.createProgram();
    [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(([type, src]) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
      gl.attachShader(p, s);
    });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }

  /* ---------- 種草 ---------- */
  function edgeR(a) {
    const lobes = 0.2 * Math.pow(Math.max(0, Math.cos(2 * a + 0.35)), 14) + 0.12 * Math.pow(Math.max(0, Math.cos(3 * a - 1.1)), 10);
    return 1 + 0.12 * Math.sin(3 * a + 1.3) + 0.08 * Math.sin(5 * a + 0.4) + 0.05 * Math.sin(8 * a + 2.0) + 0.035 * Math.sin(13 * a + 0.7) + lobes;
  }
  // 草叢深淺的分佈：一片片的，不是一叢叢亂跳
  const patchy = (x, z) => clamp(0.5 + 0.3 * Math.sin(x * 7.3 + 0.4) * Math.cos(z * 6.1 + 1.9) + 0.2 * Math.sin(x * 11.7 - z * 9.4 + 2.6), 0, 1);
  // 低頻起伏：哪裡長高叢、哪裡是低處
  const lumpy = (x, z) => clamp(0.5 + 0.28 * Math.sin(x * 3.1 + 1.7) * Math.cos(z * 2.7 - 0.6) + 0.22 * Math.sin(x * 6.3 - z * 5.1 + 2.1), 0, 1);

  function buildField(seed, o) {
    const r = rng(seed);
    const blades = [], dabs = [], flowers = [];
    const sample = (maxD) => {
      const a = r() * Math.PI * 2;
      const e = edgeR(a);
      const d = Math.sqrt(r()) * maxD;
      return { x: Math.cos(a) * e * d, z: Math.sin(a) * e * d, d };
    };
    // 矮的葉子不能太寬（不然像萵苣），描邊也只畫在夠高的葉子上
    // tone：-1 深綠 … +1 淺綠，2 乾草色；red：0–1 紅的程度（紅葉子不畫描邊）
    const blade = (x, z, d, h, w, yaw, lean, outline, shape, tone = 0, red = 0) =>
      blades.push(x, z, d, r() * 6.283, h, Math.min(w, h * 0.22), yaw, lean, r(),
        red > 0 ? -red : outline && h > 0.07 ? 1 : 0, tone, shape);

    // 草叢：中間高、密，外圍矮、散
    for (let i = 0; i < o.clumps; i++) {
      const s = sample(1.04);
      const cover = 1 - smooth(clamp((s.d - 0.7) / 0.32, 0, 1));
      if (r() > cover + 0.05) continue;
      const depth = 1 - Math.min(1, s.d);
      // 人物坐的地方（中心一圈）草被壓矮，像原站：越靠近越矮，最矮剩約 3 成
      const clearing = o.clearing ? 0.3 + 0.7 * smooth(clamp((Math.hypot(s.x, s.z) - 0.05) / 0.5, 0, 1)) : 1;
      let H = (0.036 + 0.095 * Math.pow(depth, 1.2) + r() * 0.03) * lerp(0.55, 1.4, lumpy(s.x, s.z)) * clearing;
      if (r() < 0.05) H *= 1.6;
      // 三種草叢：單根、小撮、大團。大團葉子多又同色，看起來是一整塊；越外圈單根、小撮越多
      const fringe = 1 - cover, u = r();
      const kind = u < 0.12 + 0.3 * fringe ? 'single' : u < 0.5 + 0.2 * fringe ? 'tuft' : 'puff';
      const big = kind === 'puff' && r() < 0.04 + 0.22 * depth ? 1.6 + r() * 0.6 : 1;
      if (big > 1) H *= 1.25;
      const rad = kind === 'single' ? 0.006
        : kind === 'tuft' ? (0.022 + r() * 0.03) * (0.6 + 0.4 * depth)
        : (0.05 + r() * 0.05) * (0.6 + 0.4 * depth) * big;
      const n = kind === 'single' ? (r() < 0.35 ? 2 : 1)
        : Math.max(1, Math.round((kind === 'tuft' ? 4 + r() * 8 : 10 + r() * 14) * (big > 1 ? 1.8 : 1) * (0.4 + 0.6 * depth)));
      const delay = s.d + r() * 0.05;
      // 這叢偏深還是偏淺（跟著位置慢慢變）
      const tone = clamp((patchy(s.x, s.z) - 0.5) * 2.4 + (r() - 0.5) * 0.35, -1, 1);
      for (let k = 0; k < n; k++) {
        const ang = r() * 6.283, q = Math.sqrt(r());
        blade(s.x + Math.cos(ang) * q * rad, s.z + Math.sin(ang) * q * rad, delay + r() * 0.03,
          H * (1 - 0.5 * q * q) * (0.75 + r() * 0.4) * o.scale,
          (0.009 + r() * 0.007) * o.scale,
          ang + (r() - 0.5) * 0.6, 0.12 + 0.45 * q + r() * 0.15,
          r() < 0.012, 2.2 + r() * 1.4, clamp(tone + (r() - 0.5) * 0.15, -1, 1));
      }
    }

    // 細長草絲：比草叢高很多、彎成弧線，顏色貼近周圍，少數紅和乾草色
    for (let i = 0; i < o.wisps; i++) {
      const s = sample(0.95);
      const k = r();
      const tone = k > 0.92 ? 2 : (r() - 0.6) * 0.6;
      blade(s.x, s.z, s.d, (0.14 + r() * 0.26) * (1 - s.d * 0.45) * o.scale, (0.0026 + r() * 0.0016) * o.scale,
        r() * 6.283, 0.45 + r() * 0.8, false, 1.15, tone, k < 0.05 ? 0.75 + r() * 0.25 : 0);
    }

    // 邊緣的地面碎點
    for (let i = 0; i < o.dabs; i++) {
      const s = sample(1.12);
      if (s.d < 0.7 && r() < 0.7) continue;
      const edge = smooth(clamp((s.d - 0.7) / 0.42, 0, 1));
      // 邊緣碎點偶爾是紅的
      const red = r() < 0.02 + 0.06 * edge ? 0.7 + r() * 0.3 : 0;
      dabs.push(s.x, s.z, Math.min(s.d, 1), r() * 6.283, lerp(0.04, 0.012, edge) * (0.6 + r() * 0.8), 1 + r(), r(), 0, r(), red, 0, 0);
    }

    // 小花（含花莖）
    for (let i = 0; i < o.flowers; i++) {
      const s = sample(0.95);
      const h = (0.02 + r() * 0.06) * o.scale;
      const c = FLOWERS[Math.floor(r() * FLOWERS.length)];
      flowers.push(s.x, s.z, s.d, r() * 6.283, (0.009 + r() * 0.006) * o.scale, h, 0, r() < 0.7 ? 5 : 6, c[0], c[1], c[2], r() < 0.5 ? 1 : 0);
      blade(s.x, s.z, s.d, h, 0.004 * o.scale, r() * 6.283, 0.05, false, 1.2);
    }
    return { blades: new Float32Array(blades), dabs: new Float32Array(dabs), flowers: new Float32Array(flowers) };
  }

  /* ---------- 替代人物圖（還沒有素材時） ---------- */
  function placeholder(i) {
    const c = document.createElement('canvas');
    c.width = 768; c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#ff00ff'; x.fillRect(0, 0, 768, 512);
    const shirts = ['#c8432b', '#3f6fa8', '#e0a43a', '#5f8a4a', '#8a5aa8', '#2f8a8a'];
    x.lineWidth = 5; x.strokeStyle = '#2a2622'; x.lineJoin = 'round';
    // 坐著的人
    x.fillStyle = '#2f2b28';
    x.beginPath(); x.roundRect(330, 330, 170, 52, 24); x.fill(); x.stroke();
    x.fillStyle = shirts[i % shirts.length];
    x.beginPath(); x.roundRect(300, 220, 100, 140, 34); x.fill(); x.stroke();
    x.fillStyle = '#f1cfae';
    x.beginPath(); x.arc(350, 175, 52, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = '#2f2b28';
    x.beginPath(); x.arc(350, 165, 54, Math.PI * 1.02, Math.PI * 1.98); x.fill(); x.stroke();
    // 牌子
    x.fillStyle = '#faf6ea';
    x.beginPath(); x.roundRect(430, 210, 180, 120, 12); x.fill(); x.stroke();
    x.fillStyle = '#2a2622'; x.textAlign = 'center';
    x.font = '600 26px system-ui, sans-serif'; x.fillText('人物素材', 520, 258);
    x.font = '700 40px system-ui, sans-serif'; x.fillText(String(i + 1).padStart(2, '0'), 520, 305);
    return c;
  }

  /* ---------- 主程式 ---------- */
  const PRESETS = {
    patch: { clearing: true, clumps: 3900, wisps: 480, dabs: 2600, flowers: 60, scale: 1 },
  };

  function mount(canvas, options) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) { canvas.style.display = 'none'; return null; }

    const progs = {
      blade: compile(gl, BLADE_VS, BLADE_FS),
      ground: compile(gl, GROUND_VS, GROUND_FS),
      dab: compile(gl, DAB_VS, DAB_FS),
      flower: compile(gl, FLOWER_VS, FLOWER_FS),
      char: compile(gl, CHAR_VS, CHAR_FS),
      pre: compile(gl, POST_VS, PRE_FS),
      blur: compile(gl, POST_VS, BLUR_FS),
      comp: compile(gl, POST_VS, COMP_FS),
    };

    // 彌散光用的看不見的畫布：ms＝畫場景（多重取樣，邊緣才不會鋸齒），scene＝取樣後的結果，其他四張是 1/4 大小的光暈／光霧
    const post = { w: 0, h: 0 };
    function tex(w, h) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { t, f, w, h };
    }
    function setupPost(w, h) {
      if (post.w === w && post.h === h) return;
      if (post.w) {
        gl.deleteFramebuffer(post.ms); gl.deleteRenderbuffer(post.msColor); gl.deleteRenderbuffer(post.msDepth);
        for (const k of ['scene', 'b1', 'b2', 'm1', 'm2']) { gl.deleteTexture(post[k].t); gl.deleteFramebuffer(post[k].f); }
      }
      const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
      post.msColor = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, post.msColor);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
      post.msDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, post.msDepth);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
      post.ms = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, post.ms);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, post.msColor);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, post.msDepth);
      post.scene = tex(w, h);
      const lw = Math.max(1, Math.ceil(w / 4)), lh = Math.max(1, Math.ceil(h / 4));
      post.b1 = tex(lw, lh); post.b2 = tex(lw, lh); post.m1 = tex(lw, lh); post.m2 = tex(lw, lh);
      post.w = w; post.h = h;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    function pass(prog, target, setup) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
      gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height);
      gl.useProgram(prog.p);
      setup(prog.u);
      gl.bindVertexArray(charVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function bindTex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
    function glowChain(a, b, thresh) {
      // 縮小（＋挑亮處）→ 橫向模糊 → 直向模糊，做兩輪讓光暈更開
      pass(progs.pre, a, (u) => { bindTex(0, post.scene.t); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uTexel, 1 / post.w, 1 / post.h); gl.uniform1f(u.uThresh, thresh); });
      for (let i = 0; i < 2; i++) {
        const r = GLOW.spread * (i + 1);
        pass(progs.blur, b, (u) => { bindTex(0, a.t); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, r / a.w, 0); });
        pass(progs.blur, a, (u) => { bindTex(0, b.t); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 0, r / a.h); });
      }
    }
    function postProcess() {
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, post.ms);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, post.scene.f);
      gl.blitFramebuffer(0, 0, post.w, post.h, 0, 0, post.w, post.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      glowChain(post.b1, post.b2, GLOW.threshold);
      glowChain(post.m1, post.m2, 0);
      pass(progs.comp, null, (u) => {
        bindTex(0, post.scene.t); bindTex(1, post.b1.t); bindTex(2, post.m1.t);
        gl.uniform1i(u.uScene, 0); gl.uniform1i(u.uBloom, 1); gl.uniform1i(u.uMist, 2);
        const K = window.SUNLIGHT || {};
        gl.uniform1f(u.uBloomK, GLOW.bloom * (K.bloom || 0)); gl.uniform1f(u.uMistK, GLOW.mist * (K.mist || 0));
        const rc = K.rimCol || [1, 0.86, 0.6];
        gl.uniform3f(u.uGlowCol, Math.min(1, rc[0] * 1.02), rc[1] * 1.02, rc[2] * 1.1);
      });
    }
    const data = buildField(options.seed || 7, PRESETS.patch);

    // 共用幾何：葉子是一條往上的帶子，越靠近頂端切得越密
    const strip = [];
    const SEG = 8;
    for (let i = 0; i <= SEG; i++) { const t = Math.sqrt(i / SEG); strip.push(-1, t, 1, t); }
    const stripBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, stripBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(strip), gl.STATIC_DRAW);
    const quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    function vao(geo, inst) {
      const v = gl.createVertexArray(); gl.bindVertexArray(v);
      gl.bindBuffer(gl.ARRAY_BUFFER, geo); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      if (inst) {
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
        for (let i = 0; i < 3; i++) {
          gl.enableVertexAttribArray(1 + i); gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 48, i * 16); gl.vertexAttribDivisor(1 + i, 1);
        }
      }
      gl.bindVertexArray(null);
      return v;
    }
    const layers = {
      dab: { vao: vao(quadBuf, data.dabs), count: data.dabs.length / 12, verts: 4 },
      blade: { vao: vao(stripBuf, data.blades), count: data.blades.length / 12, verts: (SEG + 1) * 2 },
      flower: { vao: vao(quadBuf, data.flowers), count: data.flowers.length / 12, verts: 4 },
    };
    const charVao = vao(quadBuf, null);

    // 地面網格：從中心往外一圈圈，外形跟草地一樣（edgeR）
    const ground = [];
    const RINGS = 24, SLICES = 120, GMAX = 0.95;
    const gv = (i, j) => {
      const a = (j / SLICES) * Math.PI * 2, d = (i / RINGS) * GMAX, e = edgeR(a);
      return [Math.cos(a) * e * d, Math.sin(a) * e * d, d];
    };
    for (let i = 0; i < RINGS; i++) for (let j = 0; j < SLICES; j++) {
      const A = gv(i, j), B = gv(i + 1, j), C = gv(i + 1, j + 1), D = gv(i, j + 1);
      for (const v of [A, B, C, A, C, D]) ground.push(...v);
    }
    const groundVao = gl.createVertexArray(); gl.bindVertexArray(groundVao);
    const groundBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, groundBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ground), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
    gl.bindVertexArray(null);
    const groundCount = ground.length / 3;

    // 人物貼圖
    const list = options.situations && options.situations.length ? options.situations : null;
    const textures = new Map();
    function texture(i) {
      if (textures.has(i)) return textures.get(i);
      const item = list ? list[i % list.length] : {};
      const entry = { tex: gl.createTexture(), ready: false, aspect: 1.5, scale: item.scale || 1, ground: item.ground ?? 0.13 };
      textures.set(i, entry);
      const upload = (src) => {
        gl.bindTexture(gl.TEXTURE_2D, entry.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        entry.aspect = src.width / src.height; entry.texel = [1 / src.width, 1 / src.height]; entry.ready = true;
      };
      if (list) {
        const img = new Image();
        img.onload = () => upload(img);
        img.onerror = () => upload(placeholder(i));
        img.src = list[i % list.length].src;
      } else upload(placeholder(i));
      return entry;
    }

    // 狀態
    const st = {
      angle: 0, angleTarget: 0,        // 以「格」為單位
      grow: 0, growing: false, growStart: 0,
      pointer: null, trail: [],        // 滑鼠撥草：現在位置和留下的尾跡
      char: 0, nextChar: null, fade: 0, sink: 0,
      view: 0,                         // 0 = 首頁整塊草地，1 = 列表下方拉近的草丘（中間值＝鏡頭移動中）
      focus: 0,                        // 拉近之後停在哪：0 = 列表的草丘（壓很低、沒人物），1 = Info（退後一點、人物整個露出）
      infoRoom: 0, infoRoomTo: 0,      // Info 文字的底（離畫面頂端幾像素，沒捲動時）；人物會讓位到它下面（慢慢跟上，不會跳）
      charOn: true, charVis: 1,        // 離開首頁時人物先消失，回來時再出現
      t0: performance.now(),
    };
    const steps = options.steps || 24;
    const stepAngle = (Math.PI * 2) / steps;
    texture(0);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
    }

    // 正投影相機：遠近一樣大，畫面才像平面插畫
    function camera() {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const aspect = W / H;
      // ppw = 每 1 單位幾個像素。跟原站一樣只看視窗「高度」：寬度不管，所以手機直放時草地會比畫面寬、人物變大
      // 首頁：0.49 × 高度
      // 列表：同一片草地拉近，中間隆起成小丘，靠近的一半落在畫面下方外面（1920×878 時草地比畫面稍寬）
      // 中間用對數內插，拉近的速度看起來才平均
      // Info：比首頁大、比列表小，人物整個坐在畫面下方中間（INFO 在檔案上方）；窄螢幕再限制寬度，人物才不會比畫面寬
      const v = st.view, f = st.focus;
      // 列表的草丘：螢幕很矮時（手機橫放，高度 560 以下）再往下壓，留多一點位置給作品列表
      const low = clamp((560 - H) / 170, 0, 1);
      const mid = W > H ? clamp((1000 - H) / 280, 0, 1) : 0;
      const feetY = INFO.feet + INFO.midFeet * mid + INFO.lowFeet * low;
      let infoPpw = Math.min(INFO.zoom * H, INFO.maxWidth * W);
      const fit = (feetY * H - st.infoRoom - INFO.gap) / INFO.head;
      if (st.infoRoom && fit > INFO.giveUp * H) infoPpw = Math.min(infoPpw, Math.max(INFO.minZoom * H, fit));
      const near = Math.exp(lerp(Math.log(1.093 * H), Math.log(infoPpw), f));
      const ppw = Math.exp(lerp(Math.log(0.49 * H), Math.log(near), v));
      // Info 的草丘位置：人物的腳固定在畫面高度的 INFO.feet 附近（不管縮放多少）
      // 矮螢幕（手機橫放）人物再往下沉一點，留多一點位置給文字（跟列表的草丘一樣）
      const infoShift = -(feetY * 2 - 1) - 0.03 * infoPpw / (H / 2);
      const shiftY = lerp(-0.56, lerp(-1.38 - 0.1 * low, infoShift, f), v);
      const elev = 13 * Math.PI / 180;   // 原站俯視角約 12–13°
      const halfH = (H / 2) / ppw, halfW = halfH * aspect;
      const yaw = st.angle * stepAngle;
      const target = [0, 0.03, 0], dist = 6;
      const eye = [Math.sin(yaw) * Math.cos(elev) * dist, target[1] + Math.sin(elev) * dist, Math.cos(yaw) * Math.cos(elev) * dist];
      const view = lookAt(eye, target, [0, 1, 0]);
      const proj = ortho(-halfW, halfW, -halfH, halfH, 0.1, 20);
      const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
      const up = [-Math.sin(elev) * Math.sin(yaw), Math.cos(elev), -Math.sin(elev) * Math.cos(yaw)];
      return { vp: mul(proj, view), right, up, shift: [0, shiftY], eye, target, halfW, halfH, W, H };
    }

    function setCommon(prog, cam, time, balls) {
      const u = prog.u;
      gl.useProgram(prog.p);
      if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, cam.vp);
      if (u.uShift) gl.uniform2fv(u.uShift, cam.shift);
      if (u.uTime) gl.uniform1f(u.uTime, time);
      if (u.uGrow) gl.uniform1f(u.uGrow, st.grow);
      if (u.uWind) gl.uniform1f(u.uWind, 0.45);
      if (u.uRight) gl.uniform3fv(u.uRight, cam.right);
      if (u.uUp) gl.uniform3fv(u.uUp, cam.up);
      if (u.uRootShade) gl.uniform1f(u.uRootShade, 0.42);
      const K = window.SUNLIGHT || {};
      if (u.uShadeK) gl.uniform1f(u.uShadeK, K.shade || 0);
      if (u.uGrassRimK) gl.uniform1f(u.uGrassRimK, K.grassRim || 0);
      if (u.uCharRimK) gl.uniform1f(u.uCharRimK, K.charRim || 0);
      if (u.uRimCol) gl.uniform3fv(u.uRimCol, K.rimCol || [1, 0.86, 0.6]);
      if (u.uShadeCol) gl.uniform3fv(u.uShadeCol, K.shadeCol || [0.58, 0.53, 0.45]);
      if (u.uFarCol) gl.uniform3fv(u.uFarCol, K.farCol || [0.76, 0.77, 0.64]);
      if (u['uBalls[0]']) gl.uniform4fv(u['uBalls[0]'], balls);
    }

    // 把螢幕上的滑鼠位置換算成草地上的一點（正投影：沿著視線打到地面）
    function toGround(px, py) {
      const c = st.cam;
      if (!c) return null;
      const nx = (px / c.W) * 2 - 1, ny = 1 - (py / c.H) * 2 - c.shift[1];
      const f = [c.target[0] - c.eye[0], c.target[1] - c.eye[1], c.target[2] - c.eye[2]];
      const fl = Math.hypot(...f); f[0] /= fl; f[1] /= fl; f[2] /= fl;
      const p = [0, 1, 2].map((i) => c.eye[i] + c.right[i] * nx * c.halfW + c.up[i] * ny * c.halfH);
      if (f[1] >= -1e-4) return null;
      const t = -p[1] / f[1];
      return [p[0] + f[0] * t, p[2] + f[2] * t];
    }
    function pushers(now) {
      const RADIUS = lerp(0.09, 0.12, st.view);
      const out = new Float32Array(36);
      if (st.pointer) out.set([st.pointer[0], st.pointer[1], RADIUS, 1], 0);
      st.trail = st.trail.filter((p) => now - p[2] < 900);
      st.trail.slice(-8).forEach((p, i) => out.set([p[0], p[1], RADIUS * 0.8, 0.6 * (1 - (now - p[2]) / 900)], 4 + i * 4));
      return out;
    }

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const time = (now - st.t0) / 1000;
      resize();

      // 動畫：生長、轉動、日夜、人物淡入淡出
      if (st.growing) st.grow = Math.min(1.6, ((now - st.growStart) / 1000) / 1.9 * 1.6);
      st.angle += (st.angleTarget - st.angle) * (1 - Math.exp(-dt * 9));
      st.infoRoom += (st.infoRoomTo - st.infoRoom) * (1 - Math.exp(-dt * 8));
      const appear = clamp((st.grow - 0.5) / 0.5, 0, 1);
      if (st.nextChar !== null) {
        st.fade = Math.max(0, st.fade - dt / 0.16);
        if (st.fade === 0 && texture(st.nextChar).ready) { st.char = st.nextChar; st.nextChar = null; }
      } else if (texture(st.char).ready) st.fade = Math.min(1, st.fade + dt / 0.28);
      st.charVis = st.charOn ? Math.min(1, st.charVis + dt / 0.28) : Math.max(0, st.charVis - dt / 0.1);
      st.sink = (1 - st.fade * st.charVis) * 0.05 + (1 - appear) * 0.1;

      // 有光暈／柔焦時才走後製（白天沒有，就直接畫，跟原本一樣輕）
      const K = window.SUNLIGHT || {};
      const usePost = (K.bloom || 0) > 0.001 || (K.mist || 0) > 0.001;
      if (usePost) { setupPost(canvas.width, canvas.height); gl.bindFramebuffer(gl.FRAMEBUFFER, post.ms); }
      else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);

      const cam = camera();
      st.cam = cam;
      const balls = pushers(now);
      setCommon(progs.ground, cam, time, balls);
      gl.bindVertexArray(groundVao);
      gl.drawArrays(gl.TRIANGLES, 0, groundCount);
      for (const name of ['dab', 'blade', 'flower']) {
        const L = layers[name];
        if (!L.count) continue;
        setCommon(progs[name], cam, time, balls);
        gl.bindVertexArray(L.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, L.verts, L.count);
      }

      {
        const entry = texture(st.char);
        const alpha = st.fade * appear * st.charVis;
        if (entry.ready && alpha > 0) {
          const P = progs.char;
          setCommon(P, cam, time, balls);
          // 跟原站同樣的大小與位置：圖寬約草地的 0.32 倍；地面線預設在圖片底部往上 13%（人物的腳踩在地上，content.js 每張可用 ground 改）；
          // 往鏡頭方向前移約草地半徑的 8%
          const w = 0.88 * entry.scale, h = w / entry.aspect;   // scale：content.js 裡每張可以各自調大小
          const ex = cam.eye[0], ez = cam.eye[2], el = Math.hypot(ex, ez) || 1;
          gl.uniform3fv(P.u.uCenter, [ex / el * 0.11, -entry.ground * h - 0.015 - st.sink, ez / el * 0.11]);
          gl.uniform2fv(P.u.uSize, [w, h]);
          gl.uniform1f(P.u.uFade, alpha);
          gl.uniform2fv(P.u.uTexel, entry.texel);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, entry.tex);
          gl.uniform1i(P.u.uTex, 0);
          gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.bindVertexArray(charVao);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.disable(gl.BLEND);
        }
      }
      if (usePost) postProcess();
      gl.bindVertexArray(null);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);


    return {
      grow() { st.growing = true; st.growStart = performance.now(); },
      setAngle(steps, instant) { st.angleTarget = steps; if (instant) st.angle = steps; },
      get angle() { return st.angle; },
      // 鏡頭：0 = 首頁，1 = 列表下方的草丘；動畫由外面一格一格給
      setView(v) { st.view = v; },
      // 拉近之後的位置：0 = 列表的草丘，1 = Info（人物整個露出）
      setFocus(f) { st.focus = f; },
      // Info 文字的底在哪（像素，從畫面頂端算、不含捲動）；0 = 不管
      setInfoRoom(y) { st.infoRoomTo = y; },
      showCharacter(on) { st.charOn = on; },
      // px, py：相對於 canvas 左上角的滑鼠位置；傳 null 代表滑鼠離開
      setPointer(px, py) {
        if (px === null) { st.pointer = null; return; }
        const g = toGround(px, py);
        if (!g || Math.hypot(g[0], g[1]) > 1.5) { st.pointer = null; return; }
        const last = st.trail[st.trail.length - 1];
        if (!last || Math.hypot(g[0] - last[0], g[1] - last[1]) > 0.04) st.trail.push([g[0], g[1], performance.now()]);
        st.pointer = g;
      },
      setSituation(i) {
        const n = list ? list.length : steps;
        const idx = ((i % n) + n) % n;
        if (idx === st.char && st.nextChar === null) return;
        st.nextChar = idx; texture(idx);
      },
    };
  }

  window.Field = { mount };
})();
