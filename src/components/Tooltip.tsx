import { AnimatePresence, motion } from 'motion/react'
import { useId, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'

/**
 * 提示氣泡。
 *
 * 版面上不放說明文字，需要解釋的地方改成滑鼠移上去才出現。
 *
 * 無障礙上的處理：
 *   - 觸發元素是真的 button，鍵盤 Tab 得到，focus 也會展開（觸控裝置沒有 hover，
 *     直接點一下就能看）
 *   - 用 aria-describedby 連到內容，讀螢幕的人不會漏掉這段說明
 */
export function Tooltip({
  text,
  children,
  side = 'top',
}: {
  text: string
  /** 不給就用預設的 i 圖示 */
  children?: ReactNode
  side?: 'top' | 'bottom'
}) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="說明"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault()
          setOpen((v) => !v)
        }}
        className="inline-flex items-center text-ink-faint transition-colors hover:text-ink-soft"
      >
        {children ?? <Info size={14} strokeWidth={1.8} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: side === 'top' ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: side === 'top' ? 4 : -4 }}
            transition={{ duration: 0.15 }}
            className={`pointer-events-none absolute left-1/2 z-50 w-max max-w-[15rem]
                        -translate-x-1/2 rounded-lg border border-rule bg-paper-raised
                        px-2.5 py-1.5 text-[12px] leading-snug text-ink-soft shadow-xl
                        backdrop-blur-md
                        ${side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
