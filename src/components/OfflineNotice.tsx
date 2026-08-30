import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

/**
 * 離線提示。
 *
 * 斷網時所有請求都會失敗，畫面上只會出現一堆莫名其妙的錯誤，
 * 使用者往往以為是網站壞了。明講「你目前沒有連線」，
 * 他們就知道該檢查什麼。
 *
 * navigator.onLine 只反映「有沒有連上網路介面」，
 * 連上但沒有實際連通（例如飯店 WiFi 要先登入）它仍然是 true。
 * 這是已知的限制，但對最常見的情況（關掉 WiFi、進電梯）夠用。
 */
export function OfflineNotice() {
  const [offline, setOffline] = useState(() => !navigator.onLine)

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)

    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          role="status"
          className="fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-3"
        >
          <div className="flex items-center gap-2.5 rounded-full border border-rule bg-paper-raised px-4 py-2 shadow-xl backdrop-blur-md">
            <WifiOff size={15} className="shrink-0 text-ink-faint" />
            <span className="text-[13px] text-ink-soft">
              目前沒有網路連線
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
