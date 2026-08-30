import { useEffect, useRef } from 'react'
import { useTheme } from '../lib/theme'

/**
 * 星空背景。
 *
 * 自己用 Canvas 畫，不外連圖片 —— 外部圖有授權問題、拖慢首屏，
 * 也沒辦法跟介面配色精準對上。
 *
 * 分成兩層來畫，兼顧密度與效能：
 *   星塵層：上千顆細小星點，一次畫進離屏畫布重複貼上，每幀成本幾乎為零。
 *           位置沿一條斜向的銀河帶聚集，才有真實星空的疏密感。
 *   光輝層：一百多顆較大的星，會呼吸閃爍，最亮的幾顆帶十字星芒。
 *
 * 可讀性靠內容欄的霧面層保護（見 index.css 的 reading-surface），
 * 所以這裡可以放心把夜空畫得濃一點。
 */

interface Glow {
  x: number
  y: number
  size: number
  phase: number
  speed: number
  alpha: number
  spike: boolean
  /** 已經亮了多久（毫秒）。到期就熄掉，換一顆長在別處的新星 */
  life: number
  ttl: number
  /** 被星座用到的星不汰換 —— 不然連線會在畫面上跳來跳去 */
  locked: boolean
}

/** 一個星座：把幾顆相鄰的亮星連起來的一條折線 */
interface Constellation {
  /** 依序連起來的星星在 glows 裡的索引 */
  path: number[]
  /** 各自的呼吸相位，讓每個星座明滅的時機不同 */
  phase: number
  /** 星座也會換。同一組圖案掛一整晚會像是畫上去的背景 */
  life: number
  ttl: number
}

interface Shooting {
  x: number
  y: number
  len: number
  angle: number
  life: number
  ttl: number
}

/** 一顆多邊形光斑。跟著光芒一起出現，但位置各自隨機 */
interface Flare {
  x: number
  y: number
  size: number
  sides: number
  turn: number
  life: number
  ttl: number
}

interface Ray {
  /** 從太陽算起的方向 */
  angle: number
  /** 張角。每一道的粗細不同，成束才不會像梳子 */
  spread: number
  length: number
  life: number
  ttl: number
  /** 這一道的亮度權重。有粗有細、有亮有暗才像真的光芒 */
  weight: number
}

interface Cloud {
  x: number
  y: number
  /** 一朵雲由幾團圓弧堆成，每團各自的位移與半徑 */
  puffs: Array<{ dx: number; dy: number; r: number }>
  speed: number
  alpha: number
}

interface Butterfly {
  /** 滑行路徑用三次貝茲，兩個控制點決定那條弧線有多「飄」 */
  p: [number, number, number, number, number, number, number, number]
  t: number
  speed: number
  scale: number
  flap: number
  flapSpeed: number
  /** 顫動：垂直於行進方向的小幅擺盪，蝴蝶不會像紙飛機那樣平滑滑行 */
  bob: number
  bobSpeed: number
  bobAmp: number
  /** 同一批出生的錯開一點，不要整群疊在一起 */
  delay: number
  /**
   * 側身的方向與程度。
   *
   * 從側面看蝴蝶時，近的那片翅膀看起來比遠的那片大 ——
   * 兩邊等大只會出現在正上方俯視，也就是標本的視角。
   */
  lean: number
  /**
   * 繞圈。
   *
   * 蝴蝶不會像紙飛機那樣沿一條線滑過去 —— 牠們一路盤旋、打轉、
   * 忽然折返。這裡在原本的漂移路徑上疊一個圓周運動：
   *
   *   loops       整趟繞幾圈。0 就是幾乎直線飄過
   *   loopRadius  圈子多大
   *   loopPhase   起始角度，讓每隻的圈不會同步
   *   loopDir     順時針或逆時針
   */
  loops: number
  loopRadius: number
  loopPhase: number
  loopDir: number
  /**
   * 速度的起伏。
   *
   * 等速前進是機器的行為。蝴蝶忽快忽慢，有時停在半空幾秒才又動 ——
   * 那個不規則比路徑本身更能讓人覺得牠是活的。
   */
  pacePhase: number
  paceFreq: number
  /** 用哪一張翅膀貼圖（決定顏色） */
  sprite: number
  /** 軌跡的色相，跟翅膀同色才像是同一隻留下的 */
  hue: number
  trail: Array<{ x: number; y: number }>
}

/**
 * 翅膀貼圖 —— 霓虹描邊，不是實心色塊。
 *
 * 烘一次、之後每幀只是貼上去。發光靠 shadowBlur，但那個很貴，
 * 所以只在建立貼圖時付一次成本，不放進動畫迴圈。
 *
 * 只畫「一邊」的翅膀，另一邊靠水平翻轉。拍翅就是把水平縮放
 * 從 1 壓到接近 0 再回來 —— 不必逐幀重算形狀。
 */
/**
 * 蝴蝶的色盤。取自參考影片的舞台燈：青、天藍、紫羅蘭、洋紅，
 * 外加一隻偶爾出現的暖琥珀 —— 那是串燈的顏色，數量少才顯得珍貴。
 */
const WING_HUES = [188, 205, 232, 265, 292, 320, 38]

/**
 * 白天的蝴蝶品種。
 *
 * 真實的蝴蝶不是一片單色，是分區的配色 —— 翅根往往是深的（黑、褐），
 * 中段才是那個讓人記住的顏色，外緣多半又壓回深色，再點上白斑。
 * 所以這裡每一種都給三個顏色而不是一個色相：
 *
 *   root  翅根，靠近身體。多半是黑或深褐
 *   mid   主色。這是這隻蝴蝶「是什麼顏色」的答案
 *   edge  外緣暗帶。幾乎每種蝴蝶都有，少了它會像色紙剪的
 *   spot  斑點的顏色，通常是白或淡黃
 *
 * 紋樣有三種，可以疊加：
 *   stripes  條紋，順著翅脈的方向
 *   spots    斑點，沿翅緣排
 *   waves    波紋，橫過翅面的波狀帶。蛺蝶科很多都有這種紋
 *
 * 品種取材自真實的蝶類。全部自己編的話很容易滑向「彩虹配色」，
 * 而自然界的配色之所以好看，是因為它們有限制。
 */
const DAY_SPECIES = [
  {
    // 帝王蝶：墨黑翅根、烈橙翅面、黑緣白斑
    root: '#1c1917', mid: '#f97316', edge: '#0c0a09', spot: '#ffffff',
    spots: true, stripes: true, waves: false, tail: false,
  },
  {
    // 白紋鳳蝶：近黑的底，一道白帶橫過。對比最強的一隻。有尾
    root: '#0c0a09', mid: '#ffffff', edge: '#0c0a09', spot: '#ffffff',
    spots: true, stripes: true, waves: false, tail: true,
  },
  {
    // 藍閃蝶：墨黑翅根，翅面是幾乎發光的金屬藍
    root: '#0f172a', mid: '#38bdf8', edge: '#020617', spot: '#f0f9ff',
    spots: false, stripes: false, waves: true, tail: false,
  },
  {
    // 紅粉蝶：深褐轉粉，翅緣壓到近黑
    root: '#451a03', mid: '#fda4af', edge: '#1c1917', spot: '#fff1f2',
    spots: true, stripes: false, waves: true, tail: false,
  },
  {
    // 白蛺蝶：純黑白。沒有任何彩度，反而最搶眼
    root: '#0c0a09', mid: '#fafaf9', edge: '#0c0a09', spot: '#ffffff',
    spots: true, stripes: false, waves: true, tail: false,
  },
  {
    // 咖啡蛺蝶：深咖啡底配奶油色，翅緣近黑
    root: '#2c1810', mid: '#e7c9a0', edge: '#1c1917', spot: '#fffbeb',
    spots: true, stripes: false, waves: true, tail: false,
  },
  {
    // 紫斑蝶：墨黑底透出亮紫，白斑排在外緣。有尾
    root: '#1e1b4b', mid: '#a78bfa', edge: '#0c0a09', spot: '#ffffff',
    spots: true, stripes: false, waves: true, tail: true,
  },
  {
    // 青斑蝶：黑底配淡青，白斑。有尾
    root: '#042f2e', mid: '#99f6e4', edge: '#0c0a09', spot: '#ffffff',
    spots: true, stripes: true, waves: false, tail: true,
  },
  {
    // 黃粉蝶：亮黃配黑緣。整組裡最輕的一隻，全部都深會變得沉重
    root: '#a16207', mid: '#fde047', edge: '#1c1917', spot: '#ffffff',
    spots: false, stripes: false, waves: true, tail: false,
  },
]

/**
 * 畫面上同時存在的蝴蝶數 —— 後面那一層。
 *
 * 下限就是上限，所以永遠恰好一隻在後面、一隻在前面，合計兩隻。
 * 有下限是關鍵：先前是「一群飛完就全部消失，安靜十幾秒再來一群」，
 * 中間那段空白讓整件事變成一段一段的。維持下限才有源源不絕的感覺。
 *
 * 數量刻意壓得很低。這是背景，不是主角 —— 兩隻安靜地飛過，
 * 比一群熱鬧地飛過更接近「夢境」，而且完全不干擾閱讀。
 */
const MIN_BUTTERFLIES = 1
const MAX_BUTTERFLIES = 1

/**
 * 身體 —— 頭、胸、腹，加上兩根觸角。
 *
 * 先前完全沒畫身體，只有兩片翅膀左右對稱地拍動。那是這隻蝴蝶
 * 一直不像蝴蝶的最大原因：真實的蝴蝶中間有一條明確的軸，
 * 翅膀是「長在身體上」而不是憑空對稱的兩片。
 *
 * 身體單獨一張貼圖，因為它不能跟翅膀一起被翻轉 ——
 * 翅膀左右鏡射，身體只有一個，畫在正中央。
 *
 * 方向：頭朝上、腹朝下。翅膀往左右張開，所以身體的軸是垂直的。
 */
/**
 * 月亮。
 *
 * 白天有太陽，夜裡就該有月亮 —— 少了它，那片夜空只是「有星星的
 * 深色背景」，而不是一個有光源的天空。星星的光太散，撐不起
 * 「這裡有東西在照著」的感覺。
 *
 * 畫法比照太陽：一團沒有邊界的光，不是一個有形體的圓盤。
 * 先前畫成有月海、有明暗交界的球，結果跟太陽變成兩種語言 ——
 * 一邊是氛圍、一邊是插圖。兩個光源要嘛都給形體，要嘛都不給，
 * 而這個背景的調性是前者會太搶。
 *
 * 中心亮、往外化開，只是收得比太陽快一點點，
 * 所以還看得出「那裡有一顆」而不是一片泛光。
 */
function makeMoonSprite(r: number): HTMLCanvasElement {
  // r 是月亮本體的視半徑；貼圖再往外留兩倍多給光暈
  const size = Math.ceil(r * 7)
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const cx = size / 2
  const cy = size / 2
  const half = size / 2

  // 本體要有一段大致均勻的亮區，才會被讀成「一顆有大小的東西」。
  // 先前的亮核只佔貼圖半徑的百分之七 —— 那個尺度就是一顆星星，
  // 不管畫得多柔都不會變成月亮。
  //
  // 亮度仍然壓著：月亮是夜的一部分，不是畫面的主角。
  // 放大而不加亮，就是「大而微光」。
  const body = (r * 0.78) / half
  const rim = r / half

  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, half)
  glow.addColorStop(0, 'rgba(246, 250, 255, 0.46)')
  glow.addColorStop(body, 'rgba(238, 245, 255, 0.4)')
  glow.addColorStop(rim, 'rgba(216, 231, 253, 0.28)')
  // 光暈往外拉得更遠、掉得更慢 —— 太陽就是這樣，
  // 它的存在感有一半來自那片擴散出去的光，而不是本體
  glow.addColorStop(rim + (1 - rim) * 0.25, 'rgba(198, 218, 251, 0.16)')
  glow.addColorStop(rim + (1 - rim) * 0.55, 'rgba(180, 204, 248, 0.07)')
  glow.addColorStop(1, 'rgba(166, 190, 244, 0)')
  g.fillStyle = glow
  g.fillRect(0, 0, size, size)

  return c
}

function makeBodySprite(dark: boolean, color: string): HTMLCanvasElement {
  // 身體要明顯小於翅展。先前跟翅膀差不多高，看起來變成
  // 「大身體配小翅膀」，比例整個反過來
  const w = 18
  const h = 64
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.translate(w / 2, h / 2)

  if (dark) {
    g.shadowColor = 'rgba(190, 210, 255, 0.9)'
    g.shadowBlur = 6
  }

  // --- 觸角 ---
  // 從頭部往前上方分開，末端帶一個小球。那個小球是蝴蝶跟蛾
  // 最容易分辨的地方，少了它會偏向蛾
  g.strokeStyle = color
  g.lineWidth = dark ? 1.2 : 1.4
  g.lineCap = 'round'
  for (const dir of [-1, 1]) {
    g.beginPath()
    g.moveTo(dir * 0.9, -14)
    g.quadraticCurveTo(dir * 5, -22, dir * 6, -29)
    g.stroke()
    g.beginPath()
    g.arc(dir * 6, -30, 1.4, 0, Math.PI * 2)
    g.fillStyle = color
    g.fill()
  }

  // --- 頭 ---
  g.beginPath()
  g.arc(0, -13, 2.6, 0, Math.PI * 2)
  g.fillStyle = color
  g.fill()

  // --- 胸 ---
  // 比腹部粗，翅膀就是長在這一段上
  g.beginPath()
  g.ellipse(0, -5, 3.3, 7, 0, 0, Math.PI * 2)
  g.fill()

  // --- 腹 ---
  // 往下漸細。分節用幾道橫線暗示，不必真的畫出每一節
  g.beginPath()
  g.moveTo(-2.8, -1)
  g.quadraticCurveTo(-2.4, 15, 0, 23)
  g.quadraticCurveTo(2.4, 15, 2.8, -1)
  g.closePath()
  g.fill()

  if (!dark) {
    // 白天才畫分節。夜裡是發光的線稿，多加細節只會糊成一團
    g.strokeStyle = 'rgba(255, 255, 255, 0.22)'
    g.lineWidth = 0.9
    for (let i = 0; i < 5; i++) {
      const y = 1.5 + i * 4
      const half = 2.6 - i * 0.4
      g.beginPath()
      g.moveTo(-half, y)
      g.lineTo(half, y)
      g.stroke()
    }
  }

  return c
}

function makeWingSprite(
  hue: number,
  dark: boolean,
  species = 0,
  tail = false,
): HTMLCanvasElement {
  const w = 104
  const h = 104
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!

  // 原點放在右緣中央 —— 那裡是身體，翅膀往左長出去，另一邊靠翻轉
  g.translate(w - 6, h / 2)

  const glowColor = dark
    ? `hsla(${hue}, 100%, 68%, 0.95)`
    : `hsla(${hue}, 70%, 60%, 0.35)`

  /**
   * 前翅：大面積的圓弧，往上外側整片張開。
   *
   * 蝴蝶的辨識度幾乎全在這一片，而關鍵是「寬」——
   * 先前畫成一道細長的弧，結果看起來像葉子或鳥的翅膀。
   * 真正的蝴蝶前翅是一大片：前緣往外上方拉開、翅端圓鈍、
   * 外緣再整片繞回身體。中間包住的面積比輪廓本身重要得多。
   */
  function forewingPath() {
    g.moveTo(0, -5)
    // 前緣：從肩部往外上方拉開，弧度要飽滿
    g.bezierCurveTo(-10, -34, -34, -54, -60, -50)
    // 翅端：圓鈍，不是尖角
    g.bezierCurveTo(-80, -47, -92, -30, -86, -14)
    // 外緣與後緣：整片繞回身體
    g.bezierCurveTo(-78, -2, -40, 4, 0, 0)
    g.closePath()
  }

  /**
   * 後翅：比前翅小一號、更圓，往下外側墜。
   *
   * tail 決定要不要那個水滴狀的尾突。不是每種蝴蝶都有 ——
   * 鳳蝶有、粉蝶沒有。全部都加上去就變成同一款了。
   */
  function hindwingPath() {
    g.moveTo(0, 2)
    g.bezierCurveTo(-14, 12, -38, 18, -50, 32)
    if (tail) {
      // 尾突：像一滴水掛在翅緣下方
      g.bezierCurveTo(-56, 40, -54, 49, -47, 53)
      g.bezierCurveTo(-43, 47, -42, 40, -40, 36)
    } else {
      // 沒有尾突就是一道飽滿的圓弧收回來
      g.bezierCurveTo(-56, 41, -46, 46, -36, 38)
    }
    g.bezierCurveTo(-24, 28, -10, 14, 0, 4)
    g.closePath()
  }

  function forewing() {
    g.beginPath()
    forewingPath()
  }

  function hindwing() {
    g.beginPath()
    hindwingPath()
  }

  /**
   * 翅脈：從翅根放射出去。
   *
   * 這是真實蝴蝶最結構性的特徵 —— 看虎斑蝶或帝王蝶就知道，
   * 粗黑的脈從身體那端扇形散開，橫過整片橙色翅面。
   * 先前畫成幾乎看不見的細線，等於把蝴蝶最像蝴蝶的地方拿掉了。
   *
   * 前翅六條、後翅四條，都從靠近身體的同一小塊區域出發。
   */
  function veins() {
    g.beginPath()
    // 前翅：扇形散開到翅端與外緣
    const fore: Array<[number, number]> = [
      [-62, -46], [-76, -36], [-84, -25], [-84, -14], [-72, -6], [-52, -2],
    ]
    for (const [ex, ey] of fore) {
      g.moveTo(-4, -3)
      g.lineTo(ex, ey)
    }
    // 後翅：往下外側散開
    const hind: Array<[number, number]> = [
      [-48, 30], [-38, 36], [-26, 30], [-14, 18],
    ]
    for (const [ex, ey] of hind) {
      g.moveTo(-3, 3)
      g.lineTo(ex, ey)
    }
  }

  const pass = (color: string, blur: number, lw: number, withVeins: boolean) => {
    g.strokeStyle = color
    g.shadowColor = glowColor
    g.shadowBlur = blur
    g.lineWidth = lw
    g.lineJoin = 'round'
    g.lineCap = 'round'
    forewing()
    g.stroke()
    hindwing()
    g.stroke()
    if (withVeins) {
      veins()
      g.stroke()
    }
  }

  if (dark) {
    // 夜：三層。外面兩層是彩色的暈，最上面一層細而亮的白 ——
    // 參考裡的蝴蝶是「白線稿發著彩光」，不是彩色的蝴蝶。
    // 白線必須夠粗才蓋得過底下的暈，先前只有 1.1px 完全被吃掉。
    pass(`hsla(${hue}, 95%, 62%, 0.85)`, 16, 5, false)
    pass(`hsla(${hue}, 98%, 70%, 0.9)`, 8, 2.6, true)
    pass('rgba(232, 244, 255, 0.95)', 3, 1.6, true)
  } else {
    // 日：實體的蝴蝶，不是發光的線稿。
    //
    // 霓虹是夜晚的語彙 —— 那種東西在陽光下根本不會被看見。
    // 白天的蝴蝶是有重量的：翅膀分區上色、外緣壓深、底下有一點柔影
    // 表示它離背景有距離。
    const sp = DAY_SPECIES[species % DAY_SPECIES.length]

    // 底色：翅根 → 主色 → 外緣。三段而不是兩段，
    // 因為真實蝴蝶的顏色是分區的，不是從一色平順地過渡到另一色
    const grad = g.createLinearGradient(0, 0, -90, -12)
    grad.addColorStop(0, sp.root)
    grad.addColorStop(0.42, sp.mid)
    grad.addColorStop(0.86, sp.mid)
    grad.addColorStop(1, sp.edge)

    g.shadowColor = 'rgba(40, 30, 20, 0.3)'
    g.shadowBlur = 7
    g.shadowOffsetY = 2
    g.fillStyle = grad
    forewing()
    g.fill()
    hindwing()
    g.fill()

    // 影子只加一次，紋樣不需要再帶一層
    g.shadowColor = 'transparent'
    g.shadowBlur = 0
    g.shadowOffsetY = 0

    // 紋樣要裁進翅膀裡，否則會畫到輪廓外面變成一團髒東西
    g.save()
    g.beginPath()
    forewingPath()
    hindwingPath()
    g.clip()

    // 外緣暗帶。用「粗線描邊 ＋ 裁切」做出來 ——
    // 只有落在翅膀內側的那一半會留下，剛好就是沿著翅緣的一圈。
    // 幾乎每種蝴蝶都有這道深邊，少了它會像色紙剪出來的
    g.strokeStyle = sp.edge
    g.globalAlpha = 0.75
    g.lineWidth = 16
    forewing()
    g.stroke()
    hindwing()
    g.stroke()
    g.globalAlpha = 1

    if (sp.stripes) {
      // 條紋順著翅脈的方向，垂直於前緣。橫著畫會像百葉窗
      g.strokeStyle = sp.edge
      g.globalAlpha = 0.55
      g.lineWidth = 3.4
      g.lineCap = 'round'
      for (let i = 0; i < 7; i++) {
        const t = -14 - i * 12
        g.beginPath()
        g.moveTo(t, -52)
        g.lineTo(t - 18, 50)
        g.stroke()
      }
      g.globalAlpha = 1
    }

    if (sp.waves) {
      // 波紋：橫過翅面的波狀帶，順著翅緣的弧度走。
      // 跟條紋的差別在方向 —— 條紋是從翅根往外放射，
      // 波紋是繞著翅膀的弧一圈一圈往外推，像水面的漣漪。
      g.strokeStyle = sp.edge
      g.lineWidth = 2.6
      g.lineCap = 'round'
      for (let band = 0; band < 3; band++) {
        const spread = 0.62 + band * 0.16
        g.globalAlpha = 0.5 - band * 0.1
        g.beginPath()
        for (let i = 0; i <= 26; i++) {
          const t = i / 26
          // 沿著一條從翅端掃到後翅的弧，加上小幅的正弦擾動變成波
          const ang = -1.25 + t * 2.4
          const wob = Math.sin(t * Math.PI * 5) * 4.5
          const r = (58 + wob) * spread
          const x = -Math.cos(ang) * r - 18
          const y = Math.sin(ang) * r * 0.82
          if (i === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        g.stroke()
      }
      g.globalAlpha = 1
    }

    if (sp.spots) {
      // 斑點沿翅緣排，越靠翅端越小 —— 真實的蝴蝶多半是這樣
      g.fillStyle = sp.spot
      const spots: Array<[number, number, number]> = [
        [-74, -34, 4.4], [-60, -40, 3.8], [-46, -36, 3.1],
        [-82, -22, 3.6], [-70, -12, 3], [-46, 30, 3.4], [-32, 24, 2.7],
      ]
      for (const [sx, sy, r] of spots) {
        g.beginPath()
        g.arc(sx, sy, r, 0, Math.PI * 2)
        g.fill()
      }
    }

    g.restore()

    // 翅緣線：把形狀的邊界收乾淨
    g.strokeStyle = sp.edge
    g.lineWidth = 1.3
    g.lineJoin = 'round'
    forewing()
    g.stroke()
    hindwing()
    g.stroke()

    // 翅脈：粗、深、明顯。這是白天的蝴蝶最像蝴蝶的地方 ——
    // 參考照片裡的虎斑蝶，黑脈橫過整片橙色翅面，比任何斑點都醒目。
    // 裁進翅膀裡畫，脈不該長到輪廓外面
    g.save()
    g.beginPath()
    forewingPath()
    hindwingPath()
    g.clip()
    g.strokeStyle = sp.edge
    g.globalAlpha = 0.8
    g.lineWidth = 2.8
    g.lineCap = 'round'
    veins()
    g.stroke()
    g.globalAlpha = 1
    g.restore()
  }

  return c
}

/** 柔邊光點貼圖，之後所有發亮的星都貼這張 */
function makeGlowSprite(rgb: string): HTMLCanvasElement {
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, `rgba(${rgb}, 1)`)
  grad.addColorStop(0.12, `rgba(${rgb}, 0.6)`)
  grad.addColorStop(0.35, `rgba(${rgb}, 0.16)`)
  grad.addColorStop(1, `rgba(${rgb}, 0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return c
}

/**
 * layer 決定這一份要畫什麼、畫在哪一層。
 *
 *   'sky'        星空 ＋ 主群蝴蝶，鋪在所有內容後面
 *   'butterflies' 只有蝴蝶，浮在卡片前面
 *
 * 之所以要兩層：畫布在內容後面時，卡片的半透明深色底會把背後的東西
 * 幾乎吃光 —— 手機上卡片佔滿寬度，蝴蝶等於看不見。但整群移到前面又會
 * 橫過文字，高對比的線條切過中文筆畫會直接吃掉可讀性。
 *
 * 所以主群留在後面，前面只放很少、很淡、較小的幾隻，像隔著玻璃看到的。
 * 附帶的好處是一前一後產生景深，比單層更有空間感。
 */
export function StarField({
  layer = 'sky',
}: { layer?: 'sky' | 'butterflies' | 'rays' } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isDark } = useTheme()

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    // 同上：下面的函式宣告拿不到 guard 的收斂結果，重綁一個非 null 的 const
    const canvas: HTMLCanvasElement = el
    const context = canvas.getContext('2d')
    if (!context) return
    // 重新綁一個確定非 null 的 const —— 底下的函式宣告會被提升，
    // TypeScript 不會把上面那個 guard 的收斂結果帶進去
    const ctx: CanvasRenderingContext2D = context

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const front = layer === 'butterflies'
    const raysOnly = layer === 'rays'

    // 前景下限是 0、上限是 1 —— 所以它時有時無。
    // 後面那一層永遠保留一隻，畫面因此不會完全空掉，
    // 而總數在一到兩隻之間自然起伏，不是固定的兩隻在跑。
    //
    // 前景那隻小一號、亮度砍到四成：它的工作是製造景深，不是搶戲。
    // 數量一多就會變成擋在字前面的雜訊。
    const minCount = front ? 0 : MIN_BUTTERFLIES
    const maxCount = front ? 1 : MAX_BUTTERFLIES
    // 白天的翅膀是填色的實心形狀，同樣的透明度會比夜裡的線稿
    // 擋掉多得多的字 —— 一隻線稿蝴蝶只遮住幾條線的位置，
    // 一隻填色蝴蝶會蓋掉整片。所以白天的前景要再壓一半，
    // 尺寸也再縮一號，讓它停留在「餘光看得到」而不是「擋在眼前」。
    const layerAlpha = front ? (isDark ? 0.4 : 0.32) : 1
    // 白天的前層不再縮那麼小。太小的填色蝴蝶會變成一個看不出是什麼的
    // 色塊 —— 紋樣完全看不見，反而更像髒污
    const layerScale = front ? 0.62 : 1

    const starRGB = isDark ? '232, 240, 255' : '110, 128, 180'
    const baseAlpha = isDark ? 1 : 0.32
    const sprite = makeGlowSprite(starRGB)

    let width = 0
    let height = 0
    let dpr = 1
    let dust: HTMLCanvasElement | null = null
    let glows: Glow[] = []
    let constellations: Constellation[] = []
    let shooting: Shooting | null = null
    let raf = 0
    let running = true
    let nextShootingAt = performance.now() + 2500 + Math.random() * 4000

    // 蝴蝶：白色線稿本體 ＋ 紫色滑行軌跡。
    // 只在深色主題出現 —— 霓虹描邊放在淺色底上會變成髒髒的灰線。
    // 夜裡每個色相各烘一張；白天每個品種各烘一張。
    // 十來張貼圖總共不到 500KB 記憶體，換來的是每隻蝴蝶都有自己的
    // 顏色與紋樣，而且不必逐幀重畫
    // 夜裡也要有無尾與有尾的差別，否則七隻飛過去都是同一個剪影
    const wings = isDark
      ? WING_HUES.map((h, i) => makeWingSprite(h, true, i, i % 3 === 0))
      : DAY_SPECIES.map((sp, i) => makeWingSprite(0, false, i, sp.tail))
    // 軌跡的色相。白天用主色 —— 那是這隻蝴蝶最被記住的顏色
    const wingHues = isDark ? WING_HUES : DAY_SPECIES.map(() => 210)

    // 身體：夜裡是發亮的淡藍，白天用該品種的外緣色 —— 那多半是
    // 黑或深褐，剛好就是真實蝴蝶身體的顏色
    const bodies = isDark
      ? [makeBodySprite(true, 'rgba(226, 240, 255, 0.92)')]
      : DAY_SPECIES.map((sp) => makeBodySprite(false, sp.edge))

    let clouds: Cloud[] = []
    let moon: HTMLCanvasElement | null = null
    let rays: Ray[] = []
    let flares: Flare[] = []
    let nextRayAt = performance.now() + 1200 + Math.random() * 2000

    /**
     * 白天的天空。
     *
     * 上方是較深的碧藍，往下漸淡到接近白的地平線 —— 真實的天空就是
     * 這個方向，因為越靠近地平線，視線穿過的大氣越厚，藍光散射掉的
     * 比例越高。順著這個規律畫，不必刻意就會像。
     *
     * 內容大多集中在畫面中下段，那裡本來就該是最淡的，
     * 所以這個漸層同時也是可讀性的保障。
     */
    function drawDaySky() {
      // 上方的藍要夠濃才看得出是天空。下方仍然收到接近白 ——
      // 內容集中在中下段，那裡淡才讀得舒服
      const sky = ctx.createLinearGradient(0, 0, 0, height)
      sky.addColorStop(0, '#6fa8dc')
      sky.addColorStop(0.22, '#93c0e8')
      sky.addColorStop(0.5, '#c3ddf4')
      sky.addColorStop(0.78, '#e4eefa')
      sky.addColorStop(1, '#f4f8fd')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, width, height)

      // 陽光：右上角一團暖光。位置固定，像一個確定的光源
      const [sx, sy] = sunPos()

      // 本體的半徑跟月亮用同一條公式 —— 日月是同一片天空的兩個時刻，
      // 大小理當一致。先前太陽只靠一條從中心急速衰減的漸層，
      // 亮區不到四十像素，比月亮小得多，所以顯得淡。
      const bodyR = Math.max(46, Math.min(84, width * 0.075))
      const reach = Math.max(width, height) * 0.6
      const body = (bodyR * 0.78) / reach
      const rim = bodyR / reach

      const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, reach)
      // 本體要有一小塊接近純白的核 —— 那是「這裡有一顆太陽」的訊號。
      // 只有一團漸層的話，雲一飄過來就把它整個蓋掉了
      // 不要硬核。先前給了一個 0.98 透明度的近白核心，
      // 結果讀起來像一顆貼上去的球，而不是陽光 —— 那個突兀感
      // 就是從這裡來的。
      //
      // 真實的太陽在照片裡是「一團越往外越淡的光」，中心與周圍
      // 之間沒有明確的界線。從中心就開始化開，才會被當成光源
      // 而不是物件。
      // 本體有一段大致均勻的亮區，才會被讀成一個有大小的光源；
      // 但中心與周圍之間仍然沒有硬邊 —— 那是「貼上去的球」的來源。
      // 之後接一片拉得很遠的暖暈，太陽的存在感有一半來自那片光。
      sun.addColorStop(0, 'rgba(255, 252, 232, 0.92)')
      sun.addColorStop(body, 'rgba(255, 246, 200, 0.8)')
      sun.addColorStop(rim, 'rgba(255, 236, 160, 0.54)')
      sun.addColorStop(rim + (1 - rim) * 0.12, 'rgba(255, 232, 152, 0.32)')
      sun.addColorStop(rim + (1 - rim) * 0.4, 'rgba(255, 232, 164, 0.14)')
      sun.addColorStop(1, 'rgba(255, 236, 186, 0)')
      ctx.fillStyle = sun
      ctx.fillRect(0, 0, width, height)
    }

    /** 太陽的位置。光芒從這裡放射出去，跟畫面上那團暖光是同一個光源 */
    function sunPos(): [number, number] {
      // 跟月亮同一個位置。日與夜是同一片天空的兩個時刻，
      // 光源的位置不該跟著換
      return [width * 0.82, height * 0.13]
    }

    /**
     * 白天的光芒 —— 陽光從太陽放射出來。
     *
     * 這是流星在白天的對應物，但兩者的行為必須不一樣：
     *
     *   流星是「墜落」—— 一個亮點拖著尾巴劃過去，重點在移動。
     *   光芒是「撒」—— 整束一次出現、閃一下、整束消失，重點在瞬間。
     *
     * 形狀也不同。第一版畫成幾道平行的光帶，那是錯的 ——
     * 真實的陽光是從一個點放射出去的，每一道的角度都不一樣，
     * 越遠越開。平行的光帶看起來像百葉窗，不像陽光。
     *
     * 而且平行的版本還有個實作上的錯：起點放在畫面上方之外、往左下
     * 延伸，等它降到畫面頂端時已經往左偏了七百多像素，整條落在
     * 左邊界外 —— 所以根本看不到。從太陽發散就沒有這個問題，
     * 光源在畫面內，光芒必定經過畫面。
     */
    function spawnRays() {
      // 星芒往四面八方射出去，不是朝一個方向的扇形。
      //
      // 先前做成單向的一束，那是「陽光穿過雲隙」的樣子；
      // 而參考的是鏡頭直視太陽時的星芒 —— 強光在光圈葉片的邊緣繞射，
      // 於是從光源向各個角度射出長短不一的細芒。
      const count = 16 + Math.floor(Math.random() * 10)
      const base = Math.random() * Math.PI * 2
      const diag = Math.hypot(width, height)

      for (let i = 0; i < count; i++) {
        // 角度大致等分再各自抖動。完全等分會像時鐘的刻度
        const angle = base + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.24

        // 長短差距要大：多數是短芒，少數幾道特別長。
        // 全部一樣長會變成一顆毛球
        const long = Math.random() < 0.22
        const len = long
          ? diag * (0.26 + Math.random() * 0.26)
          : diag * (0.06 + Math.random() * 0.1)

        rays.push({
          angle,
          // 越長的越細 —— 長芒是細細一條，短芒才是三角形的光瓣
          spread: long ? 0.004 + Math.random() * 0.005 : 0.014 + Math.random() * 0.044,
          length: len,
          life: -i * (8 + Math.random() * 18),
          ttl: 900 + Math.random() * 700,
          weight: long ? 0.7 + Math.random() * 0.3 : 0.3 + Math.random() * 0.4,
        })
      }

      // 光斑：兩顆，位置各自隨機、尺寸很大。
      //
      // 先前沿著光軸排了一串小的，那是照片裡光暈的排法，
      // 但在一個會捲動的介面上，那串東西讀起來像畫面髒了。
      // 改成偶爾出現的兩顆大的 —— 少而大才會被當成「光」，
      // 多而小只會被當成雜訊。
      flares = []
      for (let i = 0; i < 2; i++) {
        flares.push({
          x: width * (0.12 + Math.random() * 0.76),
          y: height * (0.1 + Math.random() * 0.7),
          size: Math.min(width, height) * (0.09 + Math.random() * 0.11),
          sides: Math.random() < 0.6 ? 6 : 4,
          turn: Math.random() * Math.PI,
          life: -i * (120 + Math.random() * 260),
          ttl: 1000 + Math.random() * 700,
        })
      }

      // 兩道特別長的水平光條。真實鏡頭幾乎都有這個，
      // 它比任何細節都更能讓人認出「這是強光進到鏡頭裡」
      for (const dir of [0, Math.PI]) {
        rays.push({
          angle: dir + (Math.random() - 0.5) * 0.08,
          spread: 0.003,
          length: diag * (0.4 + Math.random() * 0.26),
          life: 0,
          ttl: 1100 + Math.random() * 600,
          weight: 0.9,
        })
      }
    }

    /**
     * 光斑 —— 沿著光軸排開的一串菱形。
     *
     * 這是鏡頭光暈：強光進到鏡頭裡，在光圈的葉片之間反射，
     * 在光源到畫面中心的連線上留下一串多邊形的影子。
     * 參考圖裡那幾顆就是它，而它們正是讓一束光「看起來被拍下來」
     * 而不是「畫上去」的關鍵。
     *
     * 位置不是隨便放的：必定落在太陽與畫面中心的連線上，
     * 而且會延伸到中心的另一側。放錯位置的話眼睛會立刻覺得不對，
     * 雖然多數人說不出為什麼。
     */
    function drawFlares() {
      if (flares.length === 0) return

      flares = flares.filter((f) => {
        f.life += 16
        if (f.life < 0) return true
        const t = f.life / f.ttl
        if (t >= 1) return false

        // 快亮、慢滅
        const fade = t < 0.18 ? t / 0.18 : (1 - t) / 0.82
        const a = 0.62 * fade

        ctx.save()
        ctx.translate(f.x, f.y)
        ctx.rotate(f.turn)

        ctx.beginPath()
        polygon(f.size, f.sides)

        // 內裡是淡黃的半透明，邊緣化開。
        // 實心的話會變成一塊貼在畫面上的色紙，而光斑是透光的
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, f.size)
        g.addColorStop(0, `rgba(255, 246, 198, ${a * 0.34})`)
        g.addColorStop(0.58, `rgba(255, 242, 182, ${a * 0.5})`)
        g.addColorStop(0.9, `rgba(255, 238, 168, ${a * 0.72})`)
        g.addColorStop(1, `rgba(255, 236, 160, ${a * 0.4})`)
        ctx.fillStyle = g
        ctx.fill()

        // 輪廓。這是光斑看不看得見的關鍵 ——
        // 在白色的卡片上，淡黃的填色跟白底幾乎是同一個顏色，
        // 唯一能被眼睛抓到的是那一圈邊。所以邊要用彩度高一點的琥珀色，
        // 靠色相而不是亮度被看見；線細，壓在文字上也讀得到。
        ctx.strokeStyle = `rgba(228, 176, 64, ${a * 0.85})`
        ctx.lineWidth = 2
        ctx.lineJoin = 'round'
        ctx.stroke()

        // 內圈。真實的光斑是光圈葉片的重像，邊界不只一層
        ctx.beginPath()
        polygon(f.size * 0.66, f.sides)
        ctx.strokeStyle = `rgba(233, 190, 92, ${a * 0.45})`
        ctx.lineWidth = 1.2
        ctx.stroke()

        ctx.restore()
        return true
      })
    }

    /** 畫一個多邊形的路徑：六邊形，或壓扁的菱形 */
    function polygon(size: number, sides: number) {
      if (sides === 4) {
        ctx.moveTo(-size, 0)
        ctx.lineTo(0, -size * 0.62)
        ctx.lineTo(size, 0)
        ctx.lineTo(0, size * 0.62)
      } else {
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2
          const px = Math.cos(ang) * size
          const py = Math.sin(ang) * size * 0.88
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
      }
      ctx.closePath()
    }

    function drawRays(now: number) {
      if (reduced) return

      if (rays.length === 0 && now >= nextRayAt) {
        spawnRays()
        nextRayAt = now + 3500 + Math.random() * 5000
      }
      // 光斑活得比光芒久一點，這裡不能因為光芒收完就提早離開
      if (rays.length === 0 && flares.length === 0) return

      const [sx, sy] = sunPos()

      // 白天必須用一般疊合，不能用加亮。
      //
      // 這一點試錯了兩次才想通：白天的底是白卡片與淺藍天空，
      // 而任何「加亮」的模式（lighter、screen）碰到白色都只會得到白色 ——
      // 光芒壓在卡片上時，數學上就不可能顯示出來。那就是它一直
      // 沒有出現的原因。
      //
      // 所以白天的光芒只能是「比底色略暖」的一層，靠色相差而不是
      // 亮度差被看見。文字仍然讀得到：白卡片疊上這層之後底色約是
      // (255, 246, 220)，而字是接近黑的深藍，對比幾乎不變。
      ctx.globalCompositeOperation = 'source-over'

      rays = rays.filter((r) => {
        r.life += 16
        if (r.life < 0) return true // 還沒輪到它亮
        const t = r.life / r.ttl
        if (t >= 1) return false

        // 快亮、慢滅。閃光就是這個形狀 —— 平均的淡入淡出會像在呼吸
        const fade = t < 0.16 ? t / 0.16 : (1 - t) / 0.84

        // 明滅：每一道各自的相位與頻率，同一束裡的強度不會整齊劃一。
        // 真實的光芒會因為空氣裡的塵埃而閃動
        const shimmer = 0.72 + 0.28 * Math.sin(r.angle * 37 + now * 0.006)

        // 亮度要足以讓人看見光芒橫過整個畫面，但存在感必須靠「範圍」
        // 而不是「濃度」—— 沿長度拉得夠遠、邊緣化得夠開，
        // 單點的透明度不高，整道還是很有份量。
        // 做成實心的黃色塊反而會擋住底下的字。
        // 這個值刻意拉高。要讓人看見「光射穿整個畫面」，
        // 亮度就必須夠 —— 淡到只剩暗示的話，那不叫射線。
        //
        // 可讀性算過：白卡片（#fff）疊上這個淡黃之後底色約是
        // (255, 246, 221)，而文字是接近黑的深藍 —— 對比幾乎不變。
        // 會擋住字的是「深色或高彩度的實心塊」，不是淺色的光。
        // 放到卡片之上以後，同樣的亮度會顯得強得多 —— 先前它被
        // 卡片擋掉了大半。這裡砍到三分之一，讓它回到「一道光經過」
        // 而不是「畫面被打上一盞燈」
        // fade 給一個下限。不給的話，一道光芒大半輩子都處在淡入淡出
        // 的兩端，實際看到的平均亮度遠低於這個係數 —— 那是先前
        // 「調了好幾次還是看不見」的原因之一
        const a = 1 * Math.max(0.6, fade) * r.weight * shimmer

        const g = ctx.createLinearGradient(sx, sy,
          sx + Math.cos(r.angle) * r.length,
          sy + Math.sin(r.angle) * r.length)
        // 前面九成幾乎不衰減，最後才收掉。
        // 中途就淡光的話會變成「一小段光暈」而不是「射穿」
        // 沿長度持續淡化，不要整條同樣濃。
        // 光從太陽出發，越遠越散 —— 均勻的一整條會像實心的色帶
        // 淡黃，不是金黃。彩度壓低之後在白底上會變弱，
        // 所以靠透明度補回來 —— 淡而不透，才是「陽光」而不是「顏料」
        g.addColorStop(0, `rgba(255, 243, 186, ${a})`)
        g.addColorStop(0.24, `rgba(255, 240, 178, ${a * 0.74})`)
        g.addColorStop(0.55, `rgba(255, 239, 180, ${a * 0.42})`)
        g.addColorStop(0.8, `rgba(255, 243, 196, ${a * 0.17})`)
        g.addColorStop(1, 'rgba(255, 246, 210, 0)')
        ctx.fillStyle = g

        // 從光暈的邊緣起算，不是從太陽的中心點。
        //
        // 真實的星芒是強光在光圈邊緣繞射出來的，看起來就是從那團光的
        // 外緣長出去 —— 從正中心畫的話，光芒的根部會被光暈整個蓋住，
        // 反而顯得是「貼在太陽上的線」而不是「從光裡射出來」。
        const inner = Math.max(46, Math.min(84, width * 0.075)) * 0.72
        const ix = sx + Math.cos(r.angle) * inner
        const iy = sy + Math.sin(r.angle) * inner

        ctx.beginPath()
        ctx.moveTo(ix, iy)
        ctx.lineTo(
          sx + Math.cos(r.angle - r.spread) * r.length,
          sy + Math.sin(r.angle - r.spread) * r.length,
        )
        ctx.lineTo(
          sx + Math.cos(r.angle + r.spread) * r.length,
          sy + Math.sin(r.angle + r.spread) * r.length,
        )
        ctx.closePath()
        ctx.fill()
        return true
      })

      // 光斑自己算生命週期，不跟著光芒 ——
      // 它們亮得比較久，收得比較慢
      drawFlares()

      // 還給主迴圈，不要把疊加模式留成別人的副作用
      ctx.globalCompositeOperation = 'source-over'
    }

    function buildClouds() {
      const narrow = width < 640
      // 窄螢幕上雲的絕對尺寸要放大。同樣一朵在手機上只佔畫面的
      // 一小塊，看起來像污漬而不是雲 —— 雲之所以是雲，一部分來自
      // 它相對於天空的大小
      const sizeBoost = narrow ? 1.5 : 1
      const count = Math.max(narrow ? 4 : 3, Math.round(width / 420))
      clouds = Array.from({ length: count }, () => {
        const puffCount = 4 + Math.floor(Math.random() * 4)
        const base = (34 + Math.random() * 46) * sizeBoost
        // 避開太陽所在的那一角。雲從它前面飄過去會把它整個抹掉，
        // 而天上的雲本來也不會剛好停在太陽上
        const sunX = width * 0.82
        let cx = Math.random() * (width + 400) - 200
        if (Math.abs(cx - sunX) < width * 0.22) {
          cx = cx < sunX ? cx - width * 0.24 : cx + width * 0.24
        }

        return {
          x: cx,
          // 只在上半部。雲壓在文字上會變成髒污，而且天上本來就沒有低到腳邊的雲。
          // 手機上可以放低一點 —— 那裡的天空範圍本來就窄
          y: height * (0.03 + Math.random() * (narrow ? 0.42 : 0.34)),
          puffs: Array.from({ length: puffCount }, (_, i) => ({
            dx: (i - puffCount / 2) * base * 0.62,
            dy: (Math.random() - 0.5) * base * 0.42,
            r: base * (0.55 + Math.random() * 0.6),
          })),
          // 遠的慢、近的快，就有了層次
          speed: 0.05 + Math.random() * 0.16,
          // 濃度提高。先前壓在淺藍天空上幾乎看不出來 ——
          // 雲本來就該是白天最明顯的那個元素
          alpha: 0.44 + Math.random() * 0.4,
        }
      })
    }

    function drawClouds() {
      for (const c of clouds) {
        if (!reduced) c.x += c.speed
        // 整朵飄出右側就從左邊繞回來
        if (c.x - 260 > width) c.x = -260

        for (const puff of c.puffs) {
          const px = c.x + puff.dx
          const py = c.y + puff.dy
          const g = ctx.createRadialGradient(px, py, 0, px, py, puff.r)
          // 雲不是純白 —— 頂部受光偏暖，邊緣散開成透明
          g.addColorStop(0, `rgba(255, 255, 255, ${c.alpha})`)
          g.addColorStop(0.55, `rgba(252, 253, 255, ${c.alpha * 0.5})`)
          g.addColorStop(1, 'rgba(248, 251, 255, 0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(px, py, puff.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    let butterflies: Butterfly[] = []
    let nextButterflyAt = performance.now() + 1800 + Math.random() * 3000

    /**
     * 銀河帶：一條斜穿畫面的帶狀區域。
     * 回傳 0~1，越接近帶心值越大 —— 用來決定星點的疏密與亮度。
     */
    function bandWeight(x: number, y: number): number {
      // 帶心是一條從左上往右下的斜線
      const t = x / Math.max(width, 1)
      const centerY = height * (0.18 + t * 0.5)
      const spread = height * 0.34
      const d = Math.abs(y - centerY) / spread
      return Math.max(0, 1 - d * d)
    }

    /** 依銀河帶的權重取樣一個位置，讓星點自然地聚在帶上 */
    function sampleStar(): { x: number; y: number; w: number } {
      for (let i = 0; i < 8; i++) {
        const x = Math.random() * width
        const y = Math.random() * height
        const w = bandWeight(x, y)
        // 帶上機率高，帶外仍保留一些散星，不會出現空白區
        if (Math.random() < 0.25 + w * 0.75) return { x, y, w }
      }
      const x = Math.random() * width
      const y = Math.random() * height
      return { x, y, w: bandWeight(x, y) }
    }

    /** 星塵層：一次畫好，之後每幀只是貼上去 */
    function buildDust() {
      const c = document.createElement('canvas')
      c.width = Math.floor(width * dpr)
      c.height = Math.floor(height * dpr)
      const g = c.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)

      const count = Math.round((width * height) / 900)
      for (let i = 0; i < count; i++) {
        const { x, y, w } = sampleStar()
        const r = Math.random() < 0.86 ? 0.5 + Math.random() * 0.5 : 1 + Math.random() * 0.5
        const a = (0.12 + Math.random() * 0.55) * (0.35 + w * 0.65) * baseAlpha
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fillStyle = `rgba(${starRGB}, ${a})`
        g.fill()
      }
      return c
    }

    function build() {
      const rect = canvas.getBoundingClientRect()

      // 分頁在背景、元素還沒排版完、視窗最小化時尺寸會是 0。
      // 這時候建立畫布會產生 0x0 的貼圖，drawImage 會直接拋 InvalidStateError。
      if (rect.width < 1 || rect.height < 1) {
        width = 0
        height = 0
        dust = null
        glows = []
        constellations = []
        butterflies = []
        return
      }

      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      dust = buildDust()
      buildClouds()

      // 尺寸跟著畫面走，小螢幕上不要出現一顆佔掉半邊天的月亮。
      // 但下限要夠大 —— 太小的話不論怎麼畫都只會被當成星星
      moon = isDark ? makeMoonSprite(Math.max(46, Math.min(84, width * 0.075))) : null
      // 蝴蝶刻意不清空。牠們的路徑是用絕對座標算的，尺寸變了頂多稍微
      // 偏離，飛出畫面後自然會換新的一隻 —— 而清空的代價是使用者
      // 眼前的蝴蝶憑空消失，那個突兀遠大於路徑偏一點點。

      const count = Math.round((width * height) / 9000)
      glows = Array.from({ length: count }, () => makeGlow(false))

      // 星座一定要等星星都生出來才能連 —— 這行原本排在 glows 之前，
      // 於是每次都在對一個空陣列挑星，星座從來沒有真的出現過。
      if (isDark) buildConstellations()
    }

    /** 星星淡入／淡出的時間。夠長才會像「浮現」而不是「開燈」 */
    const STAR_FADE = 1600

    /**
     * 生一顆星。
     *
     * fresh 為真時從零開始淡入；建立整片星空時要傳 false，
     * 讓每顆的壽命隨機錯開 —— 否則整片會一起亮、一起暗，
     * 那是霓虹燈的行為，不是星空的。
     */
    function makeGlow(fresh: boolean): Glow {
      const { x, y, w } = sampleStar()
      const depth = Math.random()
      const ttl = 16000 + Math.random() * 30000
      return {
        x,
        y,
        size: 6 + depth * 22,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.9,
        alpha: (0.3 + depth * 0.7) * (0.45 + w * 0.55),
        spike: depth > 0.86,
        life: fresh ? 0 : Math.random() * ttl,
        ttl,
        locked: false,
      }
    }

    /**
     * 挑幾個星座出來。
     *
     * 作法是：隨機選一顆亮星當起點，然後一路找「還沒用過、而且距離
     * 落在某個範圍內」的鄰居接下去。距離要設下限也要設上限 ——
     * 太近的兩顆連起來看不出是線，太遠的則會橫跨半個畫面，
     * 不像星座像蜘蛛網。
     *
     * 形狀完全交給星星本來的分布決定，不預先畫好圖案。真實的星座
     * 也是這樣來的：先有星星，人再把看起來有關係的連起來。
     */
    function buildConstellations() {
      constellations = []
      for (const g of glows) g.locked = false
      const target = 3 + Math.floor(Math.random() * 2)
      for (let i = 0; i < target; i++) makeConstellation()
    }

    /**
     * 連出一個星座，成功的話推進 constellations 並鎖住用到的星。
     *
     * 起點挑得亮一些，接下來一路找「還沒被用掉、距離落在範圍內」的
     * 最近鄰居。距離要設下限也要設上限 —— 太近的兩顆連起來看不出是
     * 一條線，太遠的會橫跨半個畫面，那不像星座像蜘蛛網。
     */
    function makeConstellation(): boolean {
      if (glows.length < 12) return false

      const used = new Set<number>()
      for (const c of constellations) for (const i of c.path) used.add(i)

      const minD = Math.min(width, height) * 0.05
      const maxD = Math.min(width, height) * 0.19

      // 起點挑亮一點、而且偏上方的星。
      //
      // 偏上方是因為天空只有上面那一段真的露出來 —— 底下被卡片蓋著。
      // 在整張畫布上均勻挑的話，多數星座會連在使用者永遠看不到的
      // 地方。這也剛好符合直覺：要看星星本來就是往上看。
      //
      // 門檻試不到就放寬。小畫面上亮星本來就少，硬卡著只會又變成
      // 一個星座都連不出來
      let seed = -1
      for (const [bar, top] of [[0.5, 0.42], [0.3, 0.55], [0, 1]] as const) {
        for (let tries = 0; tries < 40; tries++) {
          const i = Math.floor(Math.random() * glows.length)
          if (!used.has(i) && glows[i].alpha > bar && glows[i].y < height * top) {
            seed = i
            break
          }
        }
        if (seed >= 0) break
      }
      if (seed < 0) return false

      const path = [seed]
      used.add(seed)
      const links = 3 + Math.floor(Math.random() * 4)

      for (let k = 0; k < links; k++) {
        const from = glows[path[path.length - 1]]
        let best = -1
        let bestD = Infinity

        for (let i = 0; i < glows.length; i++) {
          if (used.has(i)) continue
          const d = Math.hypot(glows[i].x - from.x, glows[i].y - from.y)
          if (d < minD || d > maxD) continue
          if (d < bestD) {
            bestD = d
            best = i
          }
        }
        if (best < 0) break
        path.push(best)
        used.add(best)
      }

      // 兩顆連不成星座
      if (path.length < 3) return false

      for (const i of path) {
        glows[i].locked = true
        // 星座裡的星要保證看得到，不然連線兩端是空的
        glows[i].alpha = Math.max(glows[i].alpha, 0.55)
        glows[i].life = Math.max(glows[i].life, STAR_FADE)
      }
      constellations.push({
        path,
        phase: Math.random() * Math.PI * 2,
        life: 0,
        ttl: 40000 + Math.random() * 40000,
      })
      return true
    }

    /** 星座淡入／淡出的時間。比星星更慢，圖案要慢慢被認出來 */
    const CONST_FADE = 3000

    /** 讓星座老去：到期的收掉、放開它的星，再補上新的一組 */
    function ageConstellations() {
      if (reduced) return

      for (let i = constellations.length - 1; i >= 0; i--) {
        const c = constellations[i]
        c.life += 16
        if (c.life >= c.ttl) {
          for (const idx of c.path) if (glows[idx]) glows[idx].locked = false
          constellations.splice(i, 1)
        }
      }

      // 補回來。一次只補一個，新舊交替才不會整片同時換掉
      if (constellations.length < 2) makeConstellation()
    }

    function spawnShooting() {
      shooting = {
        x: Math.random() * width * 0.85,
        y: Math.random() * height * 0.55,
        len: 110 + Math.random() * 140,
        angle: Math.PI / 6 + Math.random() * 0.3,
        life: 0,
        ttl: 750 + Math.random() * 450,
      }
    }

    /**
     * 放一隻蝴蝶進來。
     *
     * 路徑用三次貝茲從畫面外飛到另一側畫面外，兩個控制點隨機取，
     * 所以每一隻的弧線都不一樣 —— 走直線會很像遊戲裡的敵機。
     */
    /**
     * 畫面四邊之外的一個點。
     *
     * 進出的邊各自隨機，而且可以是同一邊 —— 蝴蝶從左邊飛進來、
     * 繞一圈再從左邊出去，比每一隻都橫越畫面自然得多。
     */
    function edgePoint(edge: number): [number, number] {
      const m = 90 // 退到畫面外的距離，進場前要完全看不見
      if (edge === 0) return [-m, height * (0.08 + Math.random() * 0.84)]
      if (edge === 1) return [width + m, height * (0.08 + Math.random() * 0.84)]
      if (edge === 2) return [width * (0.08 + Math.random() * 0.84), -m]
      return [width * (0.08 + Math.random() * 0.84), height + m]
    }

    function spawnButterfly(delay = 0) {
      const pick = Math.floor(Math.random() * wings.length)

      // 進出的邊獨立隨機。同一邊也可以 —— 那就是飛進來繞一圈再回去
      const inEdge = Math.floor(Math.random() * 4)
      const outEdge = Math.floor(Math.random() * 4)
      const [x0, y0] = edgePoint(inEdge)
      const [x1, y1] = edgePoint(outEdge)

      // 控制點往畫面內側拉。不拉的話，同一邊進出的路徑會整條貼著
      // 邊緣走，看起來像在畫面外擦過去而不是真的進來過
      const aimX = width * (0.25 + Math.random() * 0.5)
      const aimY = height * (0.2 + Math.random() * 0.6)
      const swing = Math.min(width, height) * (0.12 + Math.random() * 0.22)
      const sign = Math.random() < 0.5 ? -1 : 1

      butterflies.push({
        p: [
          x0, y0,
          x0 + (aimX - x0) * 0.85 + swing * sign,
          y0 + (aimY - y0) * 0.85 - swing * sign,
          x1 + (aimX - x1) * 0.85 - swing * sign,
          y1 + (aimY - y1) * 0.85 + swing * sign,
          x1, y1,
        ],
        t: 0,
        // 大的飛慢、小的飛快，看起來就有遠近
        speed: 0,
        scale: 0,
        flap: Math.random() * Math.PI * 2,
        flapSpeed: 0.006 + Math.random() * 0.004,
        bob: Math.random() * Math.PI * 2,
        bobSpeed: 0.0022 + Math.random() * 0.0018,
        bobAmp: 9 + Math.random() * 16,
        delay,
        // 有些偏左、有些偏右，也有少數幾乎正對著看
        lean: (Math.random() * 2 - 1) * 0.55,
        // 大約三分之一幾乎直線飄過，其餘會繞一到三圈。
        // 全部都繞會很鬧，全部都直又太機械
        loops: Math.random() < 0.34 ? 0 : 1 + Math.floor(Math.random() * 3),
        loopRadius: 26 + Math.random() * 52,
        loopPhase: Math.random() * Math.PI * 2,
        loopDir: Math.random() < 0.5 ? -1 : 1,
        pacePhase: Math.random() * Math.PI * 2,
        // 頻率的範圍要夠寬。差距太小的話，即使相位不同，
        // 幾隻並排飛起來還是會看起來像在同步變速
        paceFreq: 0.0006 + Math.random() * 0.0030,
        sprite: pick,
        hue: wingHues[pick],
        trail: [],
      })
      const b = butterflies[butterflies.length - 1]
      const depth = Math.random()
      // 側飛把水平方向壓掉一半，所以整體要放大才維持得住存在感
      b.scale = 0.5 + depth * 0.6
      // 基礎速度：遠的（小的）慢、近的快，再各自加一段隨機。
      // 只用 depth 決定的話，同樣大小的兩隻速度就會一模一樣
      b.speed = (0.00006 + (1 - depth) * 0.00008) * (0.6 + Math.random() * 0.9)
    }

    /**
     * 某隻蝴蝶在進度 t 的位置。
     *
     * 由兩件事疊起來：一條橫越畫面的漂移路徑（貝茲），
     * 加上一個繞著它轉的圓周。圓的半徑兩端收成零 ——
     * 所以牠是從畫面外直直飄進來、中途才開始盤旋、離開前又收直，
     * 而不是一進場就在原地打轉。
     */
    function posAt(b: Butterfly, t: number): [number, number] {
      const [bx, by] = bezier(b.p, t)
      if (b.loops === 0) return [bx, by]

      // 半徑的包絡線：中段最大、兩端為零
      const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, t)))
      const r = b.loopRadius * envelope
      const a = b.loopPhase + b.loopDir * t * b.loops * Math.PI * 2
      return [bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.7]
    }

    /** 貝茲取點 */
    function bezier(p: Butterfly['p'], t: number): [number, number] {
      const u = 1 - t
      const a = u * u * u
      const b = 3 * u * u * t
      const c = 3 * u * t * t
      const d = t * t * t
      return [
        a * p[0] + b * p[2] + c * p[4] + d * p[6],
        a * p[1] + b * p[3] + c * p[5] + d * p[7],
      ]
    }

    /**
     * 中央閱讀區要壓暗。
     *
     * 內容欄在畫面中間，蝴蝶從文字後面飛過時如果全亮，
     * 中文筆畫會被光線切斷 —— 這是整個背景設計一開始就定下的規則：
     * 可讀性優先於氣氛。回傳 0~1 的亮度係數。
     */
    function readingDim(x: number): number {
      const centerDist = Math.abs(x - width / 2) / (width / 2)
      // 中央 55% 壓到三成亮，往兩側逐漸放開
      // 夜裡壓到三成 —— 發光的線條穿過中文筆畫特別傷。
      // 白天壓到六成就夠：填色的蝴蝶不會發光，而卡片在淺色主題下是
      // 不透明得多的白底，本來就擋掉大半
      const floor = isDark ? 0.3 : 0.6
      return floor + (1 - floor) * Math.min(1, Math.max(0, (centerDist - 0.28) / 0.34))
    }

    function drawButterflies(now: number) {
      if (reduced) return

      const dark = isDark

      // 疊加模式在白底上只會得到白色 —— 白天必須改回一般疊合，
      // 否則不管畫什麼都是隱形的。夜裡則要疊加，光才會互相加亮
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'

      // 畫面上永遠留著幾隻。先前是「全部飛完 → 安靜十幾秒 → 再來一群」，
      // 結果是一段一段的，中間整片空白。改成隨時補足下限，
      // 密度仍然有起伏（偶爾一陣比較多），但不會歸零。
      const alive = butterflies.length
      if (alive < minCount) {
        // 缺幾隻補幾隻，錯開零點幾秒進場，不要整排同時冒出來
        const need = minCount - alive
        for (let i = 0; i < need; i++) spawnButterfly(i * (400 + Math.random() * 900))
      } else if (alive < maxCount && now >= nextButterflyAt) {
        // 額外的一陣：在下限之上偶爾多放幾隻，密度才有呼吸感
        const extra = 1 + Math.floor(Math.random() * 3)
        for (let i = 0; i < extra; i++) spawnButterfly(i * (300 + Math.random() * 700))
        nextButterflyAt = now + 7000 + Math.random() * 11000
      }

      butterflies = butterflies.filter((b) => {
        if (b.delay > 0) {
          b.delay -= 16
          return true
        }

        // 速度調變。
        //
        // 兩條頻率不同的正弦疊起來，得到一條不會重複的起伏曲線 ——
        // 單一正弦會有明顯的週期感，看久了就發現牠在規律地快慢快慢。
        //
        // 加 0.42 之後取正值：曲線低於那個門檻的期間 pace 就是 0，
        // 蝴蝶停在原地。那些停頓不是特例，是這條曲線自然的一部分。
        const w =
          Math.sin(b.pacePhase + now * b.paceFreq) * 0.62 +
          Math.sin(b.pacePhase * 1.7 + now * b.paceFreq * 2.3) * 0.38
        // 常態與例外分開寫，不要讓速度自己滑向零。
        //
        // 先前是 max(0, w + 0.95)：曲線只要接近最低點，pace 就落到
        // 0.05 這種數字 —— 技術上還在動，看起來已經是停住了。
        // 所以「滯留」的實際比例遠高於門檻本身的意思。
        //
        // 現在常態就是一直在飛，只是忽快忽慢；真正的停頓是一個
        // 獨立的條件，而且門檻高到大約只佔百分之一的時間。
        let pace = 1.02 + w * 0.32 // 0.7 ~ 1.34，一直在移動
        if (w < -0.965) pace = 0 // 兩條正弦同時接近最低點才會發生

        b.t += b.speed * pace * 16
        if (b.t >= 1) return false

        const [bx, by] = posAt(b, b.t)

        // 顫動加在垂直於行進方向上，加在 y 軸的話往下飛時會看起來像抖動
        b.bob += b.bobSpeed * 16
        // 前瞻點也要走同一條合成路徑，否則繞圈時機身會朝著錯的方向
        const [ax, ay] = posAt(b, Math.min(1, b.t + 0.01))
        const dx = ax - bx
        const dy = ay - by
        const len = Math.hypot(dx, dy) || 1
        const off = Math.sin(b.bob) * b.bobAmp
        const x = bx + (-dy / len) * off
        const y = by + (dx / len) * off

        // 進出畫面時淡入淡出，不要憑空出現又憑空消失
        const fade = Math.min(1, Math.min(b.t, 1 - b.t) / 0.12)
        // 前景不再額外壓暗中央 —— 它本來就整層都很淡，
        // 再壓一次會變回看不見，那就失去分層的意義
        const dim = front ? 1 : readingDim(x)

        // 白天的卡片比夜裡透（淺色主題是 60% 白，夜裡是 52% 深藍），
        // 所以後層那隻穿過卡片時會更明顯。整體再壓一階
        // 後層在卡片後面，卡片本身就是保護 —— 不必再自己壓一次。
        // 白天真正需要克制的是前層，那一層在文字之上
        const dayFactor = 1
        const alpha = fade * dim * layerAlpha * dayFactor

        b.trail.push({ x, y })
        // 蝴蝶每幀只移動一到兩個像素，26 個點的軌跡總長不到 50px ——
        // 整條都被翅膀的光暈蓋住，等於沒有。要 140 個點才拉得出
        // 看得見的滑行路徑
        if (b.trail.length > 140) b.trail.shift()

        // --- 滑行軌跡 ---
        //
        // 分段畫，不是每兩點畫一次。逐段描邊在最多九隻、每隻 140 個點的
        // 情況下是每幀兩千五百次 stroke 呼叫 —— canvas 的 stroke 有固定
        // 開銷，那個量在低階裝置上會直接掉幀。
        //
        // 改成把軌跡切成幾段，每段用同一個寬度與透明度畫成一條折線：
        // 每隻蝴蝶從 280 次描邊降到七次，視覺上幾乎看不出差別，
        // 因為相鄰兩點的粗細本來就只差一點點。
        if (b.trail.length > 4) {
          const TIERS = 5
          const per = b.trail.length / TIERS
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'

          for (let tier = 0; tier < TIERS; tier++) {
            const from = Math.floor(tier * per)
            const to = Math.min(b.trail.length, Math.floor((tier + 1) * per) + 1)
            if (to - from < 2) continue

            // 段的中點代表這一段的新舊程度
            const k = (tier + 0.5) / TIERS

            ctx.beginPath()
            ctx.moveTo(b.trail[from].x, b.trail[from].y)
            for (let i = from + 1; i < to; i++) ctx.lineTo(b.trail[i].x, b.trail[i].y)

            if (dark) {
              // 夜：發光的軌跡。外層寬而暈，負責「有一道光劃過」的存在感
              ctx.strokeStyle = `hsla(${b.hue}, 95%, 66%, ${0.34 * k * k * alpha})`
              ctx.lineWidth = 6.5 * k * b.scale
              ctx.stroke()

              // 內層：只在最靠近蝴蝶的兩段出現，讓軌跡有明確的「頭」
              // 而不是一條均勻的帶子
              if (tier >= TIERS - 2) {
                ctx.strokeStyle = `hsla(${b.hue + 12}, 100%, 88%, ${0.45 * k * k * alpha})`
                ctx.lineWidth = 2 * k * b.scale
                ctx.stroke()
              }
            } else {
              // 日：不畫光帶。陽光下不會有一條發亮的線跟在蝴蝶後面，
              // 那是夜晚的語彙。白天留下的是一道很淡的空氣擾動，
              // 寬而極透，比較像是「牠剛剛經過這裡」的殘影
              ctx.strokeStyle = `hsla(${b.hue}, 60%, 62%, ${0.1 * k * k * alpha})`
              ctx.lineWidth = 9 * k * b.scale
              ctx.stroke()
            }
          }
        }

        // --- 本體 ---
        b.flap += b.flapSpeed * 16

        // 拍翅 —— 側飛的視角。
        //
        // 先前讓水平縮放在 0.18~1 之間擺動，於是每個週期都會有一瞬間
        // 整片攤平。那是標本的視角：把蝴蝶釘在板子上才會兩翼全開對著人。
        // 真的在飛的蝴蝶是從側面看到的，兩翼上下開合，最開也只到
        // 半展的程度。
        //
        // 不歸零：完全閉合的瞬間會整隻消失，看起來像閃爍。
        const open = 0.16 + 0.5 * Math.abs(Math.cos(b.flap))

        // 近的那片翅膀比遠的大。兩邊等大就退回俯視了
        const nearOpen = open * (1 + b.lean * 0.4)
        const farOpen = open * (1 - b.lean * 0.4)

        // 讓機身朝著行進方向 —— 不轉的話飛下坡時會像在平移
        const angle = Math.atan2(ay - by, ax - bx)

        const wing = wings[b.sprite]
        const sw = wing.width * b.scale * layerScale
        const sh = wing.height * b.scale * layerScale

        ctx.save()
        ctx.translate(x, y)
        // 身體對齊行進方向：頭在前、尾在後。
        //
        // 貼圖裡身體的頭朝上（-y）、翅膀在左右兩側，所以整隻多轉 90°
        // 之後，頭就指向行進方向，翅膀自然落在航線的上下兩側 ——
        // 而拍翅原本是水平壓縮，跟著轉成上下開合，正好就是蝴蝶飛行的樣子。
        //
        // 角度取自路徑的切線，而切線是連續變化的，所以牠只會轉彎，
        // 不會翻滾。
        ctx.rotate(angle + Math.PI / 2)
        ctx.globalAlpha = alpha

        // 遠的那片先畫，近的後畫 —— 這樣近的會壓在遠的上面，
        // 前後關係才對得起來
        const farFirst = b.lean >= 0

        ctx.save()
        ctx.scale(farFirst ? -farOpen : farOpen, 1)
        ctx.drawImage(wing, -sw, -sh / 2, sw, sh)
        ctx.restore()

        ctx.save()
        ctx.scale(farFirst ? nearOpen : -nearOpen, 1)
        ctx.drawImage(wing, -sw, -sh / 2, sw, sh)
        ctx.restore()

        // 身體畫在最後，蓋在兩片翅膀的接縫上 ——
        // 那條接縫本來就該被身體遮住，翅膀是長在身體上的
        const body = bodies[b.sprite % bodies.length]
        const bw = body.width * b.scale * layerScale
        const bh = body.height * b.scale * layerScale
        ctx.drawImage(body, -bw / 2, -bh / 2, bw, bh)

        ctx.restore()
        ctx.globalAlpha = 1
        return true
      })

      // 交還給主迴圈，不要把模式留在這裡變成別人的副作用
      ctx.globalCompositeOperation = isDark ? 'lighter' : 'source-over'
    }

    function drawShooting(now: number) {
      if (reduced || !isDark) return
      if (!shooting && now >= nextShootingAt) spawnShooting()
      if (!shooting) return

      shooting.life += 16
      const t = shooting.life / shooting.ttl
      if (t >= 1) {
        shooting = null
        nextShootingAt = now + 3000 + Math.random() * 6000
        return
      }

      const fade = Math.sin(Math.PI * t)
      const travel = t * 380
      const hx = shooting.x + Math.cos(shooting.angle) * travel
      const hy = shooting.y + Math.sin(shooting.angle) * travel
      const tx = hx - Math.cos(shooting.angle) * shooting.len
      const ty = hy - Math.sin(shooting.angle) * shooting.len

      const grad = ctx.createLinearGradient(tx, ty, hx, hy)
      grad.addColorStop(0, `rgba(${starRGB}, 0)`)
      grad.addColorStop(1, `rgba(${starRGB}, ${0.9 * fade})`)

      ctx.beginPath()
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.6
      ctx.lineCap = 'round'
      ctx.moveTo(tx, ty)
      ctx.lineTo(hx, hy)
      ctx.stroke()

      // 頭部帶一點光暈，才像有質量的東西劃過去
      ctx.globalAlpha = fade * 0.85
      ctx.drawImage(sprite, hx - 11, hy - 11, 22, 22)
      ctx.globalAlpha = 1
    }

    /** 十字星芒 —— 只給最亮的幾顆，畫龍點睛用 */
    function drawSpike(x: number, y: number, len: number, a: number) {
      const g = ctx.createLinearGradient(x - len, y, x + len, y)
      g.addColorStop(0, `rgba(${starRGB}, 0)`)
      g.addColorStop(0.5, `rgba(${starRGB}, ${a})`)
      g.addColorStop(1, `rgba(${starRGB}, 0)`)
      ctx.strokeStyle = g
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.moveTo(x - len, y)
      ctx.lineTo(x + len, y)
      ctx.stroke()

      const g2 = ctx.createLinearGradient(x, y - len, x, y + len)
      g2.addColorStop(0, `rgba(${starRGB}, 0)`)
      g2.addColorStop(0.5, `rgba(${starRGB}, ${a})`)
      g2.addColorStop(1, `rgba(${starRGB}, 0)`)
      ctx.strokeStyle = g2
      ctx.beginPath()
      ctx.moveTo(x, y - len)
      ctx.lineTo(x, y + len)
      ctx.stroke()
    }

    let dustOffset = 0

    /**
     * 整片星空的緩慢位移。
     *
     * 用兩條週期很長的正弦（約九十秒與兩分半）疊出來，而不是持續往
     * 一個方向飄 —— 持續飄的話要處理繞回邊界，而繞回時星座的連線
     * 會被拉成橫跨整個畫面的長條。擺動就沒有這個問題，
     * 而且慢到讓人不會察覺它在動，只覺得天空是活的。
     */
    function skyDrift(now: number): [number, number] {
      if (reduced) return [0, 0]
      return [
        Math.sin(now * 0.00007) * 14 + Math.sin(now * 0.000041) * 8,
        Math.cos(now * 0.00005) * 9 + Math.sin(now * 0.000033) * 5,
      ]
    }

    function draw(now: number) {
      // 尺寸還是 0 就先不畫，等 ResizeObserver 通知有尺寸了再重建
      if (width < 1 || height < 1) {
        if (running) raf = requestAnimationFrame(draw)
        return
      }

      ctx.clearRect(0, 0, width, height)

      // 前景層：蝴蝶與光線。星塵與星光不畫在這裡 ——
      // 那些鋪在文字上面會直接毀掉可讀性。
      //
      // 光線放在前景是刻意的：陽光是從觀看者這一側照過來的，
      // 它本來就該落在卡片「上面」而不是被卡片擋住。
      // 因為用疊加模式畫，落在字上也不會把字壓暗。
      if (front) {
        // 流星畫在這一層：它是掠過眼前的東西，躲在卡片後面就沒有意義了。
        // 用加亮模式 —— 夜裡的底是深色，加亮才會亮，
        // 而且深色的字加上一點光還是深色
        if (isDark) {
          ctx.globalCompositeOperation = 'lighter'
          drawShooting(now)
        }
        drawButterflies(now)
        ctx.globalCompositeOperation = 'source-over'
        if (running) raf = requestAnimationFrame(draw)
        return
      }

      // 光線自己一層。
      //
      // 它必須整張畫布以加亮的方式合成到頁面上（CSS 的 mix-blend-mode），
      // 才會真的「加亮」底下的卡片 —— 先前畫在前景層裡，
      // canvas 內部雖然用了 lighter，但那張畫布最後仍是以一般方式
      // 疊上去的，於是淡黃色壓在白卡片上等於看不見。那就是
      // 「光芒一直沒出現」的原因。
      //
      // 不能跟蝴蝶共用同一張：加亮模式會讓白天那些深色的蝴蝶整個消失。
      if (raysOnly) {
        if (!isDark) drawRays(now)
        if (running) raf = requestAnimationFrame(draw)
        return
      }

      // 白天畫的是天空與雲，不是星星。
      // 疊加模式在白底上只會得到白色，所以整條路都用一般疊合。
      if (!isDark) {
        ctx.globalCompositeOperation = 'source-over'
        drawDaySky()
        drawClouds()
        drawButterflies(now)
        if (running) raf = requestAnimationFrame(draw)
        return
      }

      ctx.globalCompositeOperation = 'lighter'

      // 月亮先畫。它在最遠的地方，星星是飄在它前面的
      if (moon) {
        const mx = width * 0.82
        const my = height * 0.13
        ctx.globalAlpha = 1
        ctx.drawImage(moon, mx - moon.width / 2, my - moon.height / 2)
      }

      // 星塵極緩慢地飄，接縫處再貼一張，看不出重複
      if (dust) {
        if (!reduced) dustOffset = (dustOffset + 0.012) % height
        ctx.globalAlpha = 1
        ctx.drawImage(dust, 0, dustOffset, width, height)
        ctx.drawImage(dust, 0, dustOffset - height, width, height)
      }

      const [driftX, driftY] = skyDrift(now)

      if (isDark) ageConstellations()

      // 星座的連線先畫，才會在星星後面 —— 線壓在星點上會蓋掉光暈
      if (isDark && constellations.length > 0) {
        ctx.lineWidth = 1.2
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        for (const c of constellations) {
          // 很慢地明滅。一直亮著會變成畫在天上的圖表，
          // 若隱若現才像是「剛好看出來的形狀」
          const breathe = reduced ? 0.7 : 0.55 + 0.28 * Math.sin(now * 0.0004 + c.phase)
          const born = Math.min(1, c.life / CONST_FADE)
          const gone = Math.min(1, Math.max(0, (c.ttl - c.life) / CONST_FADE))
          const a = 0.5 * breathe * Math.min(born, gone) * baseAlpha
          if (a <= 0.01) continue

          ctx.strokeStyle = `rgba(${starRGB}, ${a})`
          ctx.beginPath()
          // started 是必要的：原本只看 i === 0 決定 moveTo，
          // 萬一第一顆星不在了，整條線會從上一個路徑的終點拉過來
          let started = false
          for (const idx of c.path) {
            const g = glows[idx]
            if (!g) continue
            if (!started) {
              ctx.moveTo(g.x + driftX, g.y + driftY)
              started = true
            } else {
              ctx.lineTo(g.x + driftX, g.y + driftY)
            }
          }
          ctx.stroke()
        }
      }

      for (let i = 0; i < glows.length; i++) {
        const s = glows[i]

        // 星空會慢慢重畫自己：到期的星熄掉，換一顆長在別處的新星。
        // 位置固定不動的話，看久了會發現那只是一張貼圖 ——
        // 汰換讓每次回到這頁看到的夜空都不一樣。
        // 星座用到的星不動，不然連線會跟著跳
        if (!reduced) {
          s.life += 16
          if (s.life >= s.ttl && !s.locked) {
            glows[i] = makeGlow(true)
            continue
          }
        }

        // 淡入淡出。啪一聲出現的星星會被眼角捕捉到，很吵
        const born = Math.min(1, s.life / STAR_FADE)
        const gone = s.locked ? 1 : Math.min(1, Math.max(0, (s.ttl - s.life) / STAR_FADE))
        const envelope = reduced ? 1 : Math.min(born, gone)

        const twinkle = reduced
          ? 1
          : 0.6 + 0.4 * Math.sin(now * 0.0011 * s.speed + s.phase)
        const a = s.alpha * twinkle * baseAlpha * envelope
        if (a <= 0.01) continue

        const gx = s.x + driftX
        const gy = s.y + driftY
        ctx.globalAlpha = a
        ctx.drawImage(sprite, gx - s.size / 2, gy - s.size / 2, s.size, s.size)

        if (s.spike && isDark) {
          ctx.globalAlpha = 1
          drawSpike(gx, gy, s.size * 1.5, a * 0.5)
        }
      }

      ctx.globalAlpha = 1

      drawButterflies(now)

      ctx.globalCompositeOperation = 'source-over'
      if (running) raf = requestAnimationFrame(draw)
    }

    build()
    raf = requestAnimationFrame(draw)

    let resizeTimer = 0

    /**
     * 手機捲動時網址列會收合或展開，視窗高度跟著變 —— 那會讓
     * ResizeObserver 一直觸發。每一次重建都要重畫上千顆星塵，
     * 而且畫面會閃一下，捲個幾下整片背景就抖個不停。
     *
     * 寬度沒變、高度只差一點點的情況幾乎一定是網址列，直接忽略。
     * 星塵本來就是無縫平鋪的，高度差一點看不出來。
     */
    const onResize = () => {
      const rect = canvas.getBoundingClientRect()
      const sameWidth = Math.abs(rect.width - width) < 1
      const smallHeightDelta = Math.abs(rect.height - height) < 140
      if (width > 0 && sameWidth && smallHeightDelta) return

      // 重建星塵有成本，等使用者拉完視窗再做
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(build, 180)
    }
    window.addEventListener('resize', onResize)

    // window 的 resize 事件抓不到「元素從 0 尺寸變成有尺寸」這種情況
    const observer = new ResizeObserver(onResize)
    observer.observe(canvas)

    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        raf = requestAnimationFrame(draw)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.clearTimeout(resizeTimer)
      observer.disconnect()
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isDark, layer])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none fixed inset-0 h-full w-full ${
        // z-[5] 在內容之上、對話框（z-50）之下 —— 蝴蝶不該蓋住確認刪除的視窗
        layer === 'butterflies' ? 'z-[5]' : layer === 'rays' ? 'z-[4]' : '-z-10'
      }`}
      style={undefined}
    />
  )
}
