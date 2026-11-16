/* 網站文字：要改字、換連結，只改這個檔案。作品在 works.js。 */
window.SITE = {
  name: 'therapist.160',   // 瀏覽器分頁的標題

  // 首頁大標題：開場先打 before + aside，刪掉 aside，再打 after。
  // 滑鼠移到標題上時會再打出 aside 和 tail（The not Boring Think?），移開就刪掉。
  title: { before: 'The', aside: 'not', after: 'Boring Think', tail: '?' },
  // 首頁介紹句：分段寫，窄螢幕只會在段與段之間換行（不會把一段從中間拆開）
  blurb: ['Most good ideas', 'start out looking boring.'],
  cta: { label: 'See the work', href: 'posts/' },

  // 首頁左上角的 logo（最後一個「.」會是紅色）；滑鼠移上去會冒出 mark 那句話
  logo: 'therapist.160',
  mark: 'You are here.',
  labels: {
    works: 'Works',
    info: 'Info',
    backToField: 'Back to the field',
    allWorks: 'All works',
    backToWork: 'Back to the work',   // Info 從單篇進來時，左上角回到那一篇
    dragToTurn: 'Drag to turn',
    entries: (n) => (n === 1 ? '1 work' : `${n} works`),
  },

  // Info 頁（右上角 Info）：個人介紹（2026-11-03 Vic 改寫；觀點來自 Vic 的 LinkedIn 文章、104 自傳）
  //   Vic：標題英文、內文中文；有觀點、有個性的口吻；不寫任職公司、品牌名、過去的產業、得獎
  //   heading：大標題；lead：第一段（字大一點、思源宋體）；body：之後每一段
  info: {
    heading: 'Info',
    lead: '嗨，我是 Vic！',
    body: [
      '我相信品牌與人們一樣，越有內涵越有趣。從創意的觀點、說話的語氣與蘊含的個性，這些不同的性質所堆疊起來，正是一個品牌的樣貌。',
      '下方還有其他平台，來了解更多吧～',
    ],
  },

  // 右上角的社群按鈕（開新分頁）
  social: [
    { kind: 'instagram', label: 'On Instagram', href: 'https://www.instagram.com/therapist.160/' },
    { kind: 'github', label: 'On GitHub', href: 'https://github.com/Vic-Chen-160' },
  ],

  // 草地上的人物：每轉一格換一張。3:2、背景塗滿洋紅色 #FF00FF，用 tools/situation.py 轉成 70 KB 內的 WebP。
  // 還沒放素材時會自動用替代圖。
  // scale：這張在草地上的大小（預設 1，覺得太大就調小，例如 0.85）。
  //   對齊方式：頭的大小（含頭髮）跟「小偷偷零食」差不多；02、03、06、09 是照這個量過再調的
  // ground：地面線在圖片底部往上多少（預設 0.13）；數字越小人物越往上抬、露出越多
  situations: [
    { src: 'assets/situations/01.webp' },   // 跟貓咪玩
    { src: 'assets/situations/02.webp', scale: 0.88 },   // 看著 Mac 思考
    { src: 'assets/situations/03.webp', scale: 0.85 },   // 躺著看天空發呆
    { src: 'assets/situations/04.webp', ground: 0 },   // 手沖黑咖啡
    { src: 'assets/situations/05.webp' },   // 打瞌睡
    { src: 'assets/situations/06.webp', scale: 0.7 },   // 用手機玩手遊
    { src: 'assets/situations/07.webp' },   // 看漫畫
    { src: 'assets/situations/08.webp' },   // 吃沙拉
    { src: 'assets/situations/09.webp', scale: 0.88 },   // 仰臥起坐（貓壓腳）
    { src: 'assets/situations/10.webp' },   // 小偷偷零食
  ],
  steps: 24,   // 只在還沒放人物圖時用；有圖時，轉一圈的格數＝上面的張數

  // 作品清單不在這裡：在 assets/js/works.js（用 tools/sync_works.py 從雲端素材資料夾產生）
};
