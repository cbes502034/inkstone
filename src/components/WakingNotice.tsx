import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

/**
 * 冷啟動提示。
 *
 * 免費方案的後端閒置 15 分鐘會休眠，下一個請求要等 30~50 秒喚醒。
 * 這段時間畫面上什麼都沒有，使用者只會覺得「壞了」然後關掉。
 *
 * 這個元件在請求超過幾秒還沒回來時出現，說明正在發生什麼、
 * 大概要等多久。等待本身無法縮短，但「知道還要多久」跟
 * 「不知道發生什麼事」是完全不同的體驗。
 *
 * 只在真的慢的時候才出現 —— 平常請求半秒就回來，
 * 一律顯示只會變成雜訊。
 */

const SHOW_AFTER_MS = 2500

export function WakingNotice({ show }: { show: boolean }) {
  const [visible, setVisible] = useState(false)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!show) {
      setVisible(false)
      setSeconds(0)
      return
    }

    const timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    const tick = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(tick)
    }
  }, [show])

  if (!visible) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed inset-x-0 bottom-24 z-40 mx-auto w-fit max-w-[90vw] md:bottom-8"
    >
      <div className="flex items-center gap-3 rounded-full border border-rule bg-paper-raised px-4 py-2.5 shadow-xl backdrop-blur-md">
        <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <span className="text-[13px] leading-tight text-ink-soft">
          伺服器正在喚醒，大約需要一分鐘
          {seconds > 5 && (
            <span className="ml-1.5 text-ink-faint">（{seconds} 秒）</span>
          )}
        </span>
      </div>
    </motion.div>
  )
}
