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
        return
      }

      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      dust = buildDust()

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
