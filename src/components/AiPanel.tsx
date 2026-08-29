import { useMutation } from '@tanstack/react-query'
import { Check, CornerDownLeft, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { ai } from '../lib/api'
import type { AiTurn } from '../types'
import { PostBody } from './PostBody'

interface Props {
  open: boolean
  onClose: () => void
  onAccept: (draft: { title: string; body: string }) => void
}

const SUGGESTIONS = [
  '想寫今天通勤路上看到的事',
  '記錄一道做失敗很多次的菜',
  '整理最近讀完的一本書',
]

/** 手機是從底部推上來的 sheet，桌機是從右側滑入的側欄 —— 動畫方向要跟著版面走 */
function useIsWide() {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return wide
}

/**
 * 寫作助手。
 *
 * 對話只存在這個元件的 state 裡，後端對應的暫存放 Redis 並設 TTL，
 * 兩邊都不落地資料庫 —— 使用者採用草稿或關閉面板，紀錄就消失。
 */
export function AiPanel({ open, onClose, onAccept }: Props) {
  const [turns, setTurns] = useState<AiTurn[]>([])
  const [input, setInput] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const isWide = useIsWide()

  const send = useMutation({
    mutationFn: (prompt: string) => ai.compose(prompt, turns),
    onSuccess: (reply) => setTurns((t) => [...t, reply]),
  })

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [turns, send.isPending])

  const submit = () => {
    const text = input.trim()
    if (!text || send.isPending) return
    setTurns((t) => [
      ...t,
      {
        id: `u_${Date.now()}`,
        role: 'user',
        body: text,
        createdAt: new Date().toISOString(),
      },
    ])
    setInput('')
    send.mutate(text)
  }

  /** 採用草稿 —— 關閉面板並清空暫存，符合「滿意即結束」的設計 */
  const accept = (draft: { title: string; body: string }) => {
    onAccept(draft)
    setTurns([])
    setInput('')
  }

  const close = () => {
    onClose()
    setTurns([])
    setInput('')
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
            className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px]"
          />

          <motion.aside
            initial={isWide ? { x: '100%' } : { y: '100%' }}
            animate={isWide ? { x: 0 } : { y: 0 }}
            exit={isWide ? { x: '100%' } : { y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col rounded-t-2xl
                       border border-rule bg-paper-raised shadow-2xl
                       sm:inset-y-0 sm:left-auto sm:right-0 sm:h-dvh sm:w-[420px] sm:rounded-none sm:border-y-0"
          >
            {/* 標頭 */}
            <header className="flex items-center justify-between border-b border-rule px-5 py-4">
              <h2 className="text-[17px]">幫你起個頭</h2>
              <button
                onClick={close}
                aria-label="關閉"
                className="press grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
              >
                <X size={18} />
              </button>
            </header>

            {/* 對話 */}
            <div ref={scroller} className="flex-1 overflow-y-auto px-5 py-5">
              {turns.length === 0 && (
                <div>
                  <p className="text-[15px] leading-relaxed text-ink-soft">
                    想寫什麼？跟我說一聲，我幫你開個頭。
                  </p>
                  <div className="mt-5 flex flex-col gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setInput(s)
                        }}
                        className="press rounded-xl border border-rule px-3.5 py-2.5 text-left
                                   text-[14px] text-ink-soft transition-colors
                                   hover:border-accent hover:text-ink"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-5">
                {turns.map((turn) =>
                  turn.role === 'user' ? (
                    <p
                      key={turn.id}
                      className="self-end rounded-2xl rounded-br-md bg-paper-sunk px-4 py-2.5
                                 text-[15px] leading-relaxed text-ink"
                      style={{ maxWidth: '85%' }}
                    >
                      {turn.body}
                    </p>
                  ) : (
                    <div key={turn.id}>
                      <p
                        className={`text-[15px] leading-relaxed ${
                          turn.kind === 'refusal' ? 'text-ink-soft' : 'text-ink'
                        }`}
                      >
                        {turn.body}
                      </p>

                      {turn.draft && (
                        <div className="mt-3 rounded-xl border border-rule bg-paper p-4">
                          <h3 className="text-[17px] leading-snug">{turn.draft.title}</h3>
                          <div className="mt-2 max-h-56 overflow-y-auto text-[14px]">
                            <PostBody source={turn.draft.body} />
                          </div>
                          <button
                            onClick={() => accept(turn.draft!)}
                            className="press mt-4 flex w-full items-center justify-center gap-2
                                       rounded-full bg-accent py-2.5 text-sm font-medium text-white
                                       transition-colors hover:bg-accent-hover"
                          >
                            <Check size={16} />
                            就是這個，放進編輯器
                          </button>
                        </div>
                      )}
                    </div>
                  ),
                )}

                {send.isPending && (
                  <div className="flex gap-1.5 py-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="size-1.5 rounded-full bg-ink-faint"
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{
                          duration: 1.1,
                          repeat: Infinity,
                          delay: i * 0.16,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 輸入 */}
            <div className="border-t border-rule p-4">
              <div className="flex items-end gap-2 rounded-2xl border border-rule bg-paper px-3.5 py-2.5 focus-within:border-accent">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submit()
                    }
                  }}
                  rows={1}
                  placeholder="想寫什麼？"
                  className="max-h-28 min-h-6 flex-1 resize-none border-none bg-transparent p-0
                             text-[15px] outline-none placeholder:text-ink-faint"
                />
                <button
                  onClick={submit}
                  disabled={!input.trim() || send.isPending}
                  aria-label="送出"
                  className="press grid size-8 shrink-0 place-items-center rounded-full
                             bg-accent text-white transition-colors disabled:bg-rule-strong"
                >
                  <CornerDownLeft size={15} />
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
