import { AlertTriangle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { Button } from './ui'

/**
 * 不可復原動作的確認框。
 *
 * 用它取代瀏覽器原生的 confirm()：原生對話框沒有樣式、跳在畫面正中央，
 * 跟整個介面格格不入，而且在某些情境會被瀏覽器直接忽略掉。
 *
 * 焦點預設落在「取消」——刪除是不可復原的，
 * 使用者慌張連按 Enter 時應該落在安全的那一邊。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '確定',
  cancelLabel = '取消',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', damping: 32, stiffness: 380 }}
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-2xl border
                       border-rule bg-surface-solid p-6 backdrop-blur-xl
                       sm:inset-x-0 sm:mx-auto sm:max-w-sm"
          >
            <div className="mb-4 flex items-start gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-accent-wash text-accent">
                <AlertTriangle size={18} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] leading-snug text-ink">{title}</h2>
                {description && (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                    {description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              {/* autoFocus 而不是自己抓 ref —— 共用的 Button 沒有轉發 ref，
                  為了一個對話框去改它不划算 */}
              <Button autoFocus variant="ghost" onClick={onCancel} disabled={loading}>
                {cancelLabel}
              </Button>
              <Button onClick={onConfirm} loading={loading}>
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
