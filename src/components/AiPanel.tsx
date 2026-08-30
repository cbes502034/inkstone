import { useMutation } from '@tanstack/react-query'
import { Check, CornerDownLeft, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ai } from '../lib/api'
import type { AiTurn } from '../types'
import { PostBody } from './PostBody'

interface Props {
  open: boolean
  onClose: () => void
  onAccept: (draft: { title: string; body: string }) => void
}

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
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isWide = useIsWide()

  // 同一次寫作的多輪對話共用一個 session，關閉面板時拿它去後端清掉暫存
  const [sessionId, setSessionId] = useState<string | null>(null)

  const send = useMutation({
    mutationFn: (prompt: string) => ai.compose(prompt, sessionId),
    onSuccess: (reply) => {
      if (reply.sessionId) setSessionId(reply.sessionId)
      setTurns((t) => [...t, reply])
    },
  })

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [turns, send.isPending])

  // 輸入框跟著內容長高。單靠 CSS 做不到 —— textarea 的高度由 rows 決定，
  // 不會隨內容變，所以字一多就變成在一行的框裡捲動。
  //
  // 先歸零再量：不歸零的話 scrollHeight 永遠不小於目前高度，
  // 刪字時就只會長不會縮。max-h 由 CSS 收尾，超過就換成捲動。
  //
  // 用 useLayoutEffect 而不是 useEffect：在瀏覽器繪製前就把高度設好，
  // 否則會看到框先跳一下再回位。
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [input])

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

  /** 結束這次對話：本機清空，後端的暫存也一併刪掉，不留紀錄 */
  const reset = () => {
    if (sessionId) ai.endSession(sessionId).catch(() => {})
    setSessionId(null)
    setTurns([])
    setInput('')
  }

  /** 採用草稿 —— 關閉面板並清空暫存，符合「滿意即結束」的設計 */
  const accept = (draft: { title: string; body: string }) => {
    onAccept(draft)
    reset()
  }

  const close = () => {
    onClose()
    reset()
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
                <p className="text-[15px] leading-relaxed text-ink-soft">
                  想寫什麼？跟我說一聲，我幫你開個頭。
                </p>
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
                  ref={inputRef}
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
                  className="max-h-40 flex-1 resize-none overflow-y-auto border-none bg-transparent
                             p-0 text-[15px] leading-relaxed outline-none
                             placeholder:text-ink-faint"
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
