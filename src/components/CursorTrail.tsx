import { useEffect, useRef } from 'react'
import { useTheme } from '../lib/theme'

/**
 * 游標的紫色拖行軌跡。
 *
 * 畫在最上層而不是跟星空共用畫布 —— 星空在 -z-10，那裡的東西會被
 * 內容蓋住，而游標的軌跡必須跟著游標走在所有東西前面。
 *
 * 三個克制的地方：
 *   只在有精準指標的裝置上出現。觸控螢幕沒有游標，畫了也是殘影。
 *   尊重 prefers-reduced-motion。會跟著游標動的東西對前庭敏感的人不友善。
 *   停止移動時軌跡會自己收乾淨，然後整個迴圈停下來 ——
 *   沒有東西要畫還一直跑 requestAnimationFrame 是白費電。
 */

interface Point {
  x: number
  y: number
  /** 出生時間，用來算淡出 */
  born: number
}

/** 一個點從出現到完全消失的毫秒數 */
const LIFE = 520

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

    let width = 0
    let height = 0
    let dpr = 1
    let points: Point[] = []
    let raf = 0

    // 夜裡是紫色的霓虹光；白天是陽光的暖金。
    //
    // 白天不能靠「亮」取勝 —— 淺色底上越亮越看不見，
    // 所以三層都往深的方向走，靠彩度與明度差把它壓出來。
    const hue = isDark ? 272 : 38
    const sat = isDark ? 96 : 92
    const outerL = isDark ? 62 : 58
    const midL = isDark ? 72 : 48
    const coreL = isDark ? 90 : 36
    const outerA = isDark ? 0.26 : 0.2
    const midA = isDark ? 0.55 : 0.42
    const coreA = isDark ? 0.8 : 0.62

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function draw() {
      const now = performance.now()
      ctx.clearRect(0, 0, width, height)

      // 過期的點丟掉。游標停住之後軌跡會自己縮短、消失
      points = points.filter((p) => now - p.born < LIFE)

      if (points.length < 2) {
        // 沒東西可畫就停下來，等下一次滑鼠移動再喚醒
        raf = 0
        return
      }

      // 夜裡用疊加，交疊處會更亮，像光而不是顏料。
      // 白天不行 —— 疊加在白底上只會得到白色，等於什麼都沒畫
      ctx.globalCompositeOperation = isDark ? 'lighter' : 'source-over'
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]
        const b = points[i]
        // 越新的越亮越粗，尾巴自然收細
        const age = (now - b.born) / LIFE
        const k = 1 - age
        if (k <= 0) continue

        // 三層：外暈、主體、亮芯 —— 霓虹燈管的結構。
        //
        // 衰減用 k 而不是 k²：平方會讓中段以後迅速掉到看不見，
        // 結果是只有游標正後方那一小截亮著，看起來像個光點而不是拖曳。
        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${outerL}%, ${outerA * k})`
        ctx.lineWidth = 13 * k
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()

        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${midL}%, ${midA * k})`
        ctx.lineWidth = 5.5 * k
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()

        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${coreL}%, ${coreA * k * k})`
        ctx.lineWidth = 1.8 * k
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(draw)
    }

    function onMove(e: PointerEvent) {
      points.push({ x: e.clientX, y: e.clientY, born: performance.now() })
      // 上限只是保險。正常情況下過期機制就會把長度壓在二十幾個點
      if (points.length > 60) points.shift()
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
