import { useEffect, useRef } from 'react'
import { useTheme } from '../lib/theme'

/**
 * 游標後面的小雲朵。
 *
 * 不是一條連續的線，而是一小朵一小朵接連冒出來：游標每移動一小段
 * 就留下一團，每團自己膨脹一下再散掉。連續的線會讓人一直意識到
 * 「這是一條軌跡」，而一團一團的雲比較像是游標帶起來的東西，
 * 更輕、也更不搶戲。
 *
 * 每朵雲由三到五個圓疊成，各自的位移與半徑都不同 —— 只用一個圓
 * 會是個球，要疊起來才有雲那種不規則的邊。
 *
 * 三個克制的地方：
 *   只在有精準指標的裝置上出現。觸控螢幕沒有游標，畫了也是殘影。
 *   尊重 prefers-reduced-motion。跟著游標動的東西對前庭敏感的人不友善。
 *   雲散完就停下整個迴圈 —— 沒有東西要畫還一直跑 rAF 是白費電。
 */

interface Blob {
  dx: number
  dy: number
  r: number
}

interface Puff {
  x: number
  y: number
  born: number
  /** 整朵的基準大小 */
  scale: number
  /** 慢慢往哪飄。雲不會停在原地 */
  vx: number
  vy: number
  blobs: Blob[]
}

/**
 * 一朵雲從冒出到散盡的毫秒數。
 *
 * 這個值決定拖曳有多長 —— 活得越久，同時留在畫面上的就越多，
 * 尾巴自然就拉得越遠。
 */
const LIFE = 1300

/** 游標移動多遠才留下一朵。太密會連成一條，就失去一團一團的感覺 */
const SPACING = 24

export function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isDark } = useTheme()

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const canvas: HTMLCanvasElement = el

    // 觸控裝置沒有游標；會動的裝飾對前庭敏感的人也不友善
    if (!window.matchMedia('(pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const context = canvas.getContext('2d')
    if (!context) return
    const ctx: CanvasRenderingContext2D = context

    // 白天是被陽光照亮的雲；夜裡是紫調的星雲。
    //
    // 白天不能用純白 —— 卡片就是白的，白雲畫上去等於隱形。
    // 真實的雲本來也不是純白：受光的一面亮，背光的一面是帶藍的灰。
    // 用那個灰當外圈，白只留在核心，於是在藍天上看得到白、
    // 在白卡片上看得到灰邊。
    const tint = isDark ? '196, 170, 255' : '150, 176, 208'
    const core = isDark ? '236, 224, 255' : '255, 255, 255'
    // 壓得很低。這是游標的裝飾，長時間工作時它會一直在視線裡 ——
    // 稍微搶一點就會變成干擾，而干擾累積起來就是「用久很煩」。
    // 寧可淡到只在移動的瞬間察覺得到
    const peak = isDark ? 0.3 : 0.34

    let width = 0
    let height = 0
    let dpr = 1
    let puffs: Puff[] = []
    let raf = 0
    let lastX = 0
    let lastY = 0
    let seeded = false

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function spawn(x: number, y: number) {
      // 一朵就是一團，不再由好幾個圓疊成。
      // 疊起來的邊比較像真的雲，但一路拖過去會糊成一整片；
      // 單獨一團反而讓「一顆一顆」的節奏清楚
      const base = 11 + Math.random() * 6
      puffs.push({
        x,
        y,
        born: performance.now(),
        scale: 0.85 + Math.random() * 0.5,
        // 往上飄一點點 —— 輕的東西會浮起來，往下掉會像水滴
        vx: (Math.random() - 0.5) * 0.05,
        vy: -0.012 - Math.random() * 0.022,
        blobs: [{ dx: 0, dy: 0, r: base }],
      })
      // 上限跟著壽命一起放大，否則尾巴會在中途被砍掉
      if (puffs.length > 48) puffs.shift()
    }

    function draw() {
      const now = performance.now()
      ctx.clearRect(0, 0, width, height)

      puffs = puffs.filter((p) => now - p.born < LIFE)
      if (puffs.length === 0) {
        // 沒東西可畫就停下來，等下一次滑鼠移動再喚醒
        raf = 0
        return
      }

      // 夜裡用疊加，交疊處更亮像光；白天用一般疊合，
      // 疊加在白底上只會得到白色，等於什麼都沒畫
      ctx.globalCompositeOperation = isDark ? 'lighter' : 'source-over'

      for (const p of puffs) {
        const t = (now - p.born) / LIFE

        // 先快速膨出來再慢慢散開 —— 那個「繃」的一下就在前兩成的時間裡。
        // 線性放大會像慢慢吹氣球，少了冒出來的感覺
        const pop = t < 0.2 ? easeOut(t / 0.2) : 1 + (t - 0.2) * 0.55
        // 線性淡出，不是平方。平方在前三分之一就掉掉一半，
        // 尾巴會斷在半途；線性才拖得完整
        const alpha = (1 - t) * peak

        const age = now - p.born
        const cx = p.x + p.vx * age
        const cy = p.y + p.vy * age

        for (const b of p.blobs) {
          const r = b.r * p.scale * pop
          if (r < 0.5) continue
          const bx = cx + b.dx * p.scale
          const by = cy + b.dy * p.scale

          // 徑向漸層，邊緣化開 —— 實心圓會是一顆球，不是雲
          // 一朵雲只有一個圓，所以這個漸層必須自己撐起密度。
          // 先前是三到五個圓疊起來累積出來的，換成單顆之後
          // 同一組色標就顯得太薄了 —— 中段要撐住，不能一離開中心就掉
          // 從中心就開始化開，不留實心的核。有核的話每一朵都是一個
          // 明確的圓，一路拖過去像一串珠子壓在字上；整朵都糊掉才會
          // 像是空氣裡的一點霧
          const g = ctx.createRadialGradient(bx, by, 0, bx, by, r)
          g.addColorStop(0, `rgba(${core}, ${alpha * 0.85})`)
          g.addColorStop(0.35, `rgba(${tint}, ${alpha * 0.5})`)
          g.addColorStop(0.68, `rgba(${tint}, ${alpha * 0.2})`)
          g.addColorStop(1, `rgba(${tint}, 0)`)
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(bx, by, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(draw)
    }

    function easeOut(x: number): number {
      return 1 - (1 - x) * (1 - x)
    }

    function onMove(e: PointerEvent) {
      const x = e.clientX
      const y = e.clientY

      if (!seeded) {
        seeded = true
        lastX = x
        lastY = y
        return
      }

      // 依走過的距離決定，不是依時間 —— 慢慢移動時才不會在原地
      // 堆出一大團，快速甩過去也仍然留得下一串
      if (Math.hypot(x - lastX, y - lastY) < SPACING) return
      lastX = x
      lastY = y

      spawn(x, y)
      if (!raf) raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })

    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
    }
  }, [isDark])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] h-full w-full"
    />
  )
}
