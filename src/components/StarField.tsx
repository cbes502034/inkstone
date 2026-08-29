import { useEffect, useRef } from 'react'
import { useTheme } from '../lib/theme'

/**
 * 星空背景。
 *
 * 自己用 Canvas 畫，不外連圖片 —— 外部圖有授權問題、拖慢首屏，
 * 也沒辦法跟介面配色精準對上。
 *
 * 可讀性優先的兩個決定：
 *   1. 星點畫成「柔光暈」而不是硬邊小圓點。密集的硬點是高頻噪訊，
 *      空間頻率跟中文筆畫太接近，會直接吃掉內文的可讀性。
 *   2. 密度壓得很低，並且越靠近畫面中央（閱讀欄所在）越淡。
 *      氣氛留在兩側，中間保持安靜。
 *
 * 效能：
 *   - 光暈預先畫成一張離屏貼圖，每幀只做 drawImage，不重算漸層
 *   - 分頁切到背景就停止繪製
 *   - prefers-reduced-motion 時完全靜止
 */

interface Star {
  x: number
  y: number
  size: number
  phase: number
  speed: number
  drift: number
  alpha: number
}

interface Shooting {
  x: number
  y: number
  len: number
  angle: number
  life: number
  ttl: number
}

/** 把一顆柔邊光點畫進離屏 canvas，之後重複使用 */
function makeGlowSprite(rgb: string): HTMLCanvasElement {
  const size = 64
  const sprite = document.createElement('canvas')
  sprite.width = size
  sprite.height = size
  const g = sprite.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, `rgba(${rgb}, 1)`)
  grad.addColorStop(0.14, `rgba(${rgb}, 0.55)`)
  grad.addColorStop(0.4, `rgba(${rgb}, 0.12)`)
  grad.addColorStop(1, `rgba(${rgb}, 0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return sprite
}

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isDark } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const starRGB = isDark ? '226, 234, 255' : '120, 134, 180'
    const baseAlpha = isDark ? 0.85 : 0.3
    const sprite = makeGlowSprite(starRGB)

    let width = 0
    let height = 0
    let stars: Star[] = []
    let shooting: Shooting | null = null
    let raf = 0
    let running = true
    let nextShootingAt = performance.now() + 6000 + Math.random() * 10000

    /**
     * 中央安靜帶：越靠近閱讀欄，星光越淡。
     * 不是把中央清空 —— 內容欄是半透明的，底下留一點星光，
     * 經過背景模糊後會化成柔暈，手機上才看得到夜空。
     */
    function calmFactor(x: number): number {
      const half = width / 2
      const quiet = Math.min(width, 1200) / 2 // 閱讀欄大約的半寬
      const d = Math.abs(x - half)
      if (d >= quiet) return 1
      const t = d / quiet
      return 0.4 + 0.6 * t * t
    }

    function build() {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // 密度刻意壓低 —— 這是氛圍，不是星圖
      const count = Math.round((width * height) / 17000)
      stars = Array.from({ length: count }, () => {
        const depth = Math.random()
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          size: 8 + depth * 20,
          phase: Math.random() * Math.PI * 2,
          speed: 0.35 + Math.random() * 0.55,
          drift: 0.003 + depth * 0.01,
          alpha: 0.3 + depth * 0.55,
        }
      })
    }

    function spawnShooting() {
      // 只從兩側出現，不劃過閱讀區
      const fromLeft = Math.random() < 0.5
      shooting = {
        x: fromLeft ? Math.random() * width * 0.16 : width * (0.84 + Math.random() * 0.14),
        y: Math.random() * height * 0.4,
        len: 70 + Math.random() * 90,
        angle: fromLeft ? Math.PI / 5 : Math.PI - Math.PI / 5,
        life: 0,
        ttl: 900 + Math.random() * 500,
      }
    }

    function draw(now: number) {
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      for (const s of stars) {
        const twinkle = reduced
          ? 1
          : 0.72 + 0.28 * Math.sin(now * 0.0009 * s.speed + s.phase)
        const a = s.alpha * twinkle * baseAlpha * calmFactor(s.x)

        if (a > 0.01) {
          ctx.globalAlpha = a
          ctx.drawImage(sprite, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size)
        }

        if (!reduced) {
          s.y += s.drift
          if (s.y > height + s.size) {
            s.y = -s.size
            s.x = Math.random() * width
          }
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
            nextShootingAt = now + 9000 + Math.random() * 16000
          } else {
            const fade = Math.sin(Math.PI * t)
            const travel = t * 260
            const hx = shooting.x + Math.cos(shooting.angle) * travel
            const hy = shooting.y + Math.sin(shooting.angle) * travel
            const tx = hx - Math.cos(shooting.angle) * shooting.len
            const ty = hy - Math.sin(shooting.angle) * shooting.len

            const grad = ctx.createLinearGradient(tx, ty, hx, hy)
            grad.addColorStop(0, `rgba(${starRGB}, 0)`)
            grad.addColorStop(1, `rgba(${starRGB}, ${0.5 * fade})`)

            ctx.beginPath()
            ctx.strokeStyle = grad
            ctx.lineWidth = 1.2
            ctx.lineCap = 'round'
            ctx.moveTo(tx, ty)
            ctx.lineTo(hx, hy)
            ctx.stroke()
          }
        }
      }

      ctx.globalCompositeOperation = 'source-over'
      if (running) raf = requestAnimationFrame(draw)
    }

    build()
    raf = requestAnimationFrame(draw)

    const onResize = () => build()
    window.addEventListener('resize', onResize)

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
