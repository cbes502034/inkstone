import { useMutation } from '@tanstack/react-query'
import { Check, Flag, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { moderation } from '../lib/api'
import { Button } from './ui'

type Target = 'post' | 'comment' | 'user'

const LABEL: Record<Target, string> = {
  post: '這篇文章',
  comment: '這則留言',
  user: '這個人',
}

/** 常見理由做成選項 —— 大多數人不想打字，而選項也讓後台好分類 */
const REASONS = [
  '騷擾或霸凌',
  '仇恨言論',
  '垃圾訊息或廣告',
  '不實資訊',
  '侵犯隱私',
  '侵害著作權',
  '其他',
]

export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean
  onClose: () => void
  targetType: Target
  targetId: string
}) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [done, setDone] = useState(false)

  const submit = useMutation({
    mutationFn: () =>
      moderation.report({
        targetType,
        targetId,
        reason: detail.trim() ? `${reason}：${detail.trim()}` : reason,
      }),
    onSuccess: () => setDone(true),
  })

  const close = () => {
    onClose()
    // 留一點時間讓關閉動畫跑完再重設，不然會看到內容瞬間跳掉
    setTimeout(() => {
      setReason('')
      setDetail('')
      setDone(false)
    }, 250)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            role="dialog"
            aria-label="檢舉"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col
                       rounded-t-2xl border border-rule bg-paper-raised backdrop-blur-xl
                       sm:inset-0 sm:m-auto sm:h-fit sm:max-w-md sm:rounded-2xl"
          >
            <header className="flex items-center gap-2 border-b border-rule px-5 py-4">
              <Flag size={17} className="text-ink-soft" />
              <h2 className="text-[16px]">檢舉{LABEL[targetType]}</h2>
              <button
                onClick={close}
                aria-label="關閉"
                className="press ml-auto grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
              >
                <X size={18} />
              </button>
            </header>

            {done ? (
              <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                <Check size={40} strokeWidth={1.4} className="text-accent" />
                <p className="text-[15px] text-ink">已經收到你的檢舉</p>
                <p className="text-[13px] leading-relaxed text-ink-faint">
                  我們會以人工判斷。為了避免檢舉被當成攻擊他人的工具，
                  不會單憑檢舉數量就下架內容。
                </p>
                <Button variant="outline" onClick={close} className="mt-2">
                  關閉
                </Button>
              </div>
            ) : (
              <div className="flex min-h-0 flex-col overflow-y-auto px-5 py-5">
                <p className="mb-4 text-[13px] leading-relaxed text-ink-soft">
                  發生什麼事？
                </p>

                <div className="flex flex-col gap-1.5">
                  {REASONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setReason(r)}
                      className={`press rounded-xl border px-3.5 py-2.5 text-left text-[14px] transition-colors
                        ${
                          reason === r
                            ? 'border-accent bg-accent-wash text-ink'
                            : 'border-rule text-ink-soft hover:border-rule-strong hover:text-ink'
                        }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                {reason && (
                  <textarea
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="補充說明（選填）"
                    className="mt-4 w-full resize-none rounded-xl border border-rule bg-paper
                               px-3.5 py-2.5 text-[14px] outline-none placeholder:text-ink-faint
                               focus:border-accent"
                  />
                )}

                {submit.isError && (
                  <p className="mt-3 text-[13px] text-accent">
                    {(submit.error as Error).message}
                  </p>
                )}

                <Button
                  full
                  disabled={!reason}
                  loading={submit.isPending}
                  onClick={() => submit.mutate()}
                  className="mt-5"
                >
                  送出檢舉
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
