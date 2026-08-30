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
}

interface Shooting {
  x: number
  y: number
  len: number
  angle: number
  life: number
  ttl: number
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
function makeWingSprite(core: string, glow: string): HTMLCanvasElement {
  const w = 104
  const h = 104
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!

  // 原點放在右緣中央 —— 那裡是身體，翅膀往左長出去，另一邊靠翻轉
  g.translate(w - 6, h / 2)

  /** 前翅：大、往上外側張開，尖端明確。蝴蝶的辨識度幾乎全在這一片 */
  function forewing() {
    g.beginPath()
    g.moveTo(0, -3)
    // 前緣：從肩部快速往左上拉到翅尖
    g.bezierCurveTo(-18, -30, -52, -44, -80, -38)
    // 翅尖轉折 —— 這個角是「蝴蝶」跟「花瓣」的差別
    g.lineTo(-88, -20)
    // 外緣與後緣：帶一點內凹再收回身體
    g.bezierCurveTo(-72, -12, -46, -6, -26, -2)
    g.lineTo(0, -1)
    g.stroke()
  }

  /** 後翅：小、圓、往下墜，尾端帶一個短尾突 */
  function hindwing() {
    g.beginPath()
    g.moveTo(0, 1)
    g.bezierCurveTo(-20, 6, -44, 14, -54, 28)
    // 尾突：小小一個角，古典鳳蝶的特徵
    g.lineTo(-46, 38)
    g.bezierCurveTo(-34, 30, -16, 16, 0, 4)
    g.stroke()
  }

  /** 翅脈：三筆就好。太多會糊成一團亮塊，失去線稿感 */
  function veins() {
    g.beginPath()
    g.moveTo(-4, -3)
    g.lineTo(-70, -32)
    g.moveTo(-4, -2)
    g.lineTo(-74, -22)
    g.moveTo(-3, 2)
    g.lineTo(-48, 28)
    g.stroke()
  }

  const pass = (color: string, blur: number, lw: number, withVeins: boolean) => {
    g.strokeStyle = color
    g.shadowColor = glow
    g.shadowBlur = blur
    g.lineWidth = lw
    g.lineJoin = 'round'
    g.lineCap = 'round'
    forewing()
    hindwing()
    if (withVeins) veins()
  }

  // 三層。外面兩層是紫色的暈，最上面一層是細而亮的白 ——
  // 參考裡的蝴蝶是「白線稿發著紫光」，不是紫色的蝴蝶。
  // 白線必須夠粗才蓋得過底下的暈，先前只有 1.1px 完全被吃掉。
  pass(glow, 16, 5, false)
  pass(glow, 8, 2.6, true)
  pass(core, 3, 1.6, true)

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

export function StarField() {
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

    const starRGB = isDark ? '232, 240, 255' : '110, 128, 180'
    const baseAlpha = isDark ? 1 : 0.32
    const sprite = makeGlowSprite(starRGB)

    let width = 0
    let height = 0
    let dpr = 1
    let dust: HTMLCanvasElement | null = null
    let glows: Glow[] = []
    let shooting: Shooting | null = null
    let raf = 0
    let running = true
    let nextShootingAt = performance.now() + 2500 + Math.random() * 4000

    // 蝴蝶：白色線稿本體 ＋ 紫色滑行軌跡。
    // 只在深色主題出現 —— 霓虹描邊放在淺色底上會變成髒髒的灰線。
    const wing = isDark ? makeWingSprite('rgba(226, 240, 255, 0.95)', 'rgba(150, 120, 255, 0.9)') : null
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
      // 路徑是照舊尺寸算的，視窗改變後會飛到畫面外或穿牆，重來比較乾淨
      butterflies = []

      const count = Math.round((width * height) / 9000)
      glows = Array.from({ length: count }, () => {
        const { x, y, w } = sampleStar()
        const depth = Math.random()
        return {
          x,
          y,
          size: 6 + depth * 22,
          phase: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 0.9,
          alpha: (0.3 + depth * 0.7) * (0.45 + w * 0.55),
          spike: depth > 0.86,
        }
      })
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
    function spawnButterfly(delay = 0) {
      const fromLeft = Math.random() < 0.5
      const x0 = fromLeft ? -80 : width + 80
      const x1 = fromLeft ? width + 80 : -80
      const y0 = height * (0.1 + Math.random() * 0.8)
      const y1 = height * (0.1 + Math.random() * 0.8)

      // 控制點往上下拉開，路徑才會有起伏而不是一條平緩的斜線
      const swing = height * (0.18 + Math.random() * 0.3) * (Math.random() < 0.5 ? -1 : 1)

      butterflies.push({
        p: [
          x0, y0,
          x0 + (x1 - x0) * 0.3, y0 + swing,
          x0 + (x1 - x0) * 0.7, y1 - swing,
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
        hue: 258 + Math.random() * 34, // 紫到洋紅之間
        trail: [],
      })
      const b = butterflies[butterflies.length - 1]
      const depth = Math.random()
      b.scale = 0.34 + depth * 0.5
      b.speed = (0.000075 + (1 - depth) * 0.00009)
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
      return 0.3 + 0.7 * Math.min(1, Math.max(0, (centerDist - 0.28) / 0.34))
    }

    function drawButterflies(now: number) {
      if (!wing || reduced || !isDark) return

      // 陣陣：一次放二到四隻，彼此錯開零點幾秒，然後安靜一段時間。
      // 等距地一隻一隻飛過會像跑馬燈；成群出現再退場，才像真的有一陣蝴蝶
      // 經過。安靜的間隔比群本身重要 —— 沒有留白就只是滿畫面在動。
      if (butterflies.length === 0 && now >= nextButterflyAt) {
        const flock = 2 + Math.floor(Math.random() * 3)
        for (let i = 0; i < flock; i++) spawnButterfly(i * (260 + Math.random() * 420))
        nextButterflyAt = now + 11000 + Math.random() * 14000
      }

      butterflies = butterflies.filter((b) => {
        if (b.delay > 0) {
          b.delay -= 16
          return true
        }

        b.t += b.speed * 16
        if (b.t >= 1) return false

        const [bx, by] = bezier(b.p, b.t)

        // 顫動加在垂直於行進方向上，加在 y 軸的話往下飛時會看起來像抖動
        b.bob += b.bobSpeed * 16
        const [ax, ay] = bezier(b.p, Math.min(1, b.t + 0.01))
        const dx = ax - bx
        const dy = ay - by
        const len = Math.hypot(dx, dy) || 1
        const off = Math.sin(b.bob) * b.bobAmp
        const x = bx + (-dy / len) * off
        const y = by + (dx / len) * off

        // 進出畫面時淡入淡出，不要憑空出現又憑空消失
        const fade = Math.min(1, Math.min(b.t, 1 - b.t) / 0.12)
        const dim = readingDim(x)
        const alpha = fade * dim

        b.trail.push({ x, y })
        // 蝴蝶每幀只移動一到兩個像素，26 個點的軌跡總長不到 50px ——
        // 整條都被翅膀的光暈蓋住，等於沒有。要 140 個點才拉得出
        // 看得見的滑行路徑
        if (b.trail.length > 140) b.trail.shift()

        // --- 紫色滑行軌跡 ---
        if (b.trail.length > 2) {
          for (let i = 1; i < b.trail.length; i++) {
            const p0 = b.trail[i - 1]
            const p1 = b.trail[i]
            // 越靠近尾端越淡、越細
            const k = i / b.trail.length
            ctx.lineCap = 'round'

            // 外層：寬而暈的紫，負責「有一道光劃過」的存在感
            ctx.strokeStyle = `hsla(${b.hue}, 95%, 66%, ${0.34 * k * k * alpha})`
            ctx.lineWidth = 6.5 * k * b.scale
            ctx.beginPath()
            ctx.moveTo(p0.x, p0.y)
            ctx.lineTo(p1.x, p1.y)
            ctx.stroke()

            // 內層：細而亮的淡紫，只在靠近蝴蝶的那一段出現，
            // 讓軌跡有個明確的「頭」而不是一條均勻的帶子
            if (k > 0.55) {
              const kk = (k - 0.55) / 0.45
              ctx.strokeStyle = `hsla(${b.hue + 12}, 100%, 88%, ${0.5 * kk * kk * alpha})`
              ctx.lineWidth = 2 * kk * b.scale
              ctx.beginPath()
              ctx.moveTo(p0.x, p0.y)
              ctx.lineTo(p1.x, p1.y)
              ctx.stroke()
            }
          }
        }

        // --- 本體 ---
        b.flap += b.flapSpeed * 16
        // 拍翅：水平縮放在 0.18~1 之間擺動。不歸零，
        // 完全閉合的瞬間會整隻消失，看起來像閃爍
        const open = 0.18 + 0.82 * Math.abs(Math.cos(b.flap))

        // 讓機身朝著行進方向 —— 不轉的話飛下坡時會像在平移
        const angle = Math.atan2(ay - by, ax - bx)

        const sw = wing.width * b.scale
        const sh = wing.height * b.scale

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(angle * 0.35) // 只轉一部分，全轉會太用力
        ctx.globalAlpha = alpha

        // 右翅
        ctx.save()
        ctx.scale(open, 1)
        ctx.drawImage(wing, -sw, -sh / 2, sw, sh)
        ctx.restore()

        // 左翅：水平翻轉同一張貼圖
        ctx.save()
        ctx.scale(-open, 1)
        ctx.drawImage(wing, -sw, -sh / 2, sw, sh)
        ctx.restore()

        ctx.restore()
        ctx.globalAlpha = 1
        return true
      })
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

    function draw(now: number) {
      // 尺寸還是 0 就先不畫，等 ResizeObserver 通知有尺寸了再重建
      if (width < 1 || height < 1) {
        if (running) raf = requestAnimationFrame(draw)
        return
      }

      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      // 星塵極緩慢地飄，接縫處再貼一張，看不出重複
      if (dust) {
        if (!reduced) dustOffset = (dustOffset + 0.012) % height
        ctx.globalAlpha = 1
        ctx.drawImage(dust, 0, dustOffset, width, height)
        ctx.drawImage(dust, 0, dustOffset - height, width, height)
      }

      for (const s of glows) {
        const twinkle = reduced
          ? 1
          : 0.6 + 0.4 * Math.sin(now * 0.0011 * s.speed + s.phase)
        const a = s.alpha * twinkle * baseAlpha
        if (a <= 0.01) continue

        ctx.globalAlpha = a
        ctx.drawImage(sprite, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size)

        if (s.spike && isDark) {
          ctx.globalAlpha = 1
          drawSpike(s.x, s.y, s.size * 1.5, a * 0.5)
        }
      }

      ctx.globalAlpha = 1

      if (!reduced && isDark) {
        if (!shooting && now >= nextShootingAt) spawnShooting()

        if (shooting) {
          shooting.life += 16
          const t = shooting.life / shooting.ttl

          if (t >= 1) {
            shooting = null
            nextShootingAt = now + 3000 + Math.random() * 6000
          } else {
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
        }
      }

      drawButterflies(now)

      ctx.globalCompositeOperation = 'source-over'
      if (running) raf = requestAnimationFrame(draw)
    }

    build()
    raf = requestAnimationFrame(draw)

    let resizeTimer = 0
    const onResize = () => {
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
  }, [isDark])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  )
}
