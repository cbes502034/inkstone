import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 「正在輸入」訊號。
 *
 * 送出端做節流：打字時每個按鍵都送一次會變成洪水，
 * 而對方只需要知道「有人在打」，不需要知道打了幾個字。
 *
 * 接收端做過期：對方可能關掉分頁、斷網、或就這樣放著不打了，
 * 收不到「停止輸入」的訊號。所以每則訊號自帶有效期，
 * 時間到就自己消失，不依賴對方送結束通知。
 */

const SEND_THROTTLE_MS = 2000
const EXPIRE_MS = 4000

/** 對外的事件匯流排 —— realtime.ts 收到訊號後丟進來 */
type Listener = (conversationId: string, userId: string, name: string) => void
const listeners = new Set<Listener>()

export function emitTyping(
  conversationId: string,
  userId: string,
  name: string,
): void {
  for (const fn of listeners) fn(conversationId, userId, name)
}

/** 訂閱某個對話裡「誰正在輸入」，回傳目前正在打字的人名 */
export function useTypingIndicator(conversationId: string): string[] {
  const [names, setNames] = useState<Map<string, { name: string; at: number }>>(
    new Map(),
  )

  useEffect(() => {
    const onTyping: Listener = (convId, userId, name) => {
      if (convId !== conversationId) return
      setNames((prev) => {
        const next = new Map(prev)
        next.set(userId, { name, at: Date.now() })
        return next
      })
    }

    listeners.add(onTyping)

    // 定期清掉過期的 —— 對方可能就這樣放著不打了，
    // 不會有「停止輸入」的訊號進來
    const sweep = window.setInterval(() => {
      setNames((prev) => {
        const now = Date.now()
        const next = new Map<string, { name: string; at: number }>()
        let changed = false
        for (const [id, v] of prev) {
          if (now - v.at < EXPIRE_MS) next.set(id, v)
          else changed = true
        }
        return changed ? next : prev
      })
    }, 1000)

    return () => {
      listeners.delete(onTyping)
      window.clearInterval(sweep)
    }
  }, [conversationId])

  return [...names.values()].map((v) => v.name)
}

/** 打字時呼叫。內部有節流，可以每個按鍵都叫。 */
export function useTypingSender(
  conversationId: string,
  send: (payload: unknown) => void,
): () => void {
  const lastSent = useRef(0)

  return useCallback(() => {
    const now = Date.now()
    if (now - lastSent.current < SEND_THROTTLE_MS) return
    lastSent.current = now
    send({ event: 'typing', conversationId })
  }, [conversationId, send])
}
