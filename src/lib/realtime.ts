import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { AppNotification, Conversation, Message, Presence } from '../types'
import { showNotification } from './notify'
import { emitTyping } from './typing'
import { playMessage, playNotification } from './sound'
import { useAuth } from '../store/auth'

/**
 * 即時通道。
 *
 * 通知、聊天訊息、上線狀態都走這一條 WebSocket。
 *
 * 收到事件後直接更新 TanStack Query 的快取，而不是打 API 重新抓 ——
 * 前者是即時的，後者會多一趟往返，而且熱門文章被連續按讚時
 * 會變成一秒好幾次請求。
 */

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000

type ServerEvent =
  | { event: 'ping'; data: null }
  | { event: 'notification'; data: AppNotification }
  | { event: 'message'; data: Message }
  | { event: 'presence'; data: { userId: string; presence: Presence } }
  | {
      event: 'typing'
      data: { conversationId: string; userId: string; displayName: string }
    }

function wsUrl(token: string): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'
  const url = new URL(base.replace(/\/$/, '') + '/ws', window.location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('token', token)
  return url.toString()
}

/**
 * 目前這條連線。
 *
 * 聊天室要送「正在輸入」訊號，但它不該自己再開一條 WebSocket ——
 * 一個使用者開多條連線，伺服器那邊會誤判上線狀態，也浪費資源。
 * 所以共用同一條，用一個模組層級的參考交換。
 */
let socket: WebSocket | null = null

export function sendRealtime(payload: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

export function useRealtime(): void {
  const qc = useQueryClient()
  const { isAuthed, accessToken } = useAuth()

  // 放進 ref 讓重連的排程不會因為重新渲染而被重置
  const wsRef = useRef<WebSocket | null>(null)
  const attemptRef = useRef(0)
  const timerRef = useRef<number | undefined>(undefined)

  /**
   * 最近處理過的事件 id。
   *
   * 就算連線本身沒有重疊，網路重送、伺服器重試都可能讓同一則訊息到達兩次。
   * 而重複的代價是使用者直接看得到的：訊息在畫面上出現兩行、未讀數加兩次。
   * 這一層很便宜，值得放著。
   */
  const seenRef = useRef(new Set<string>())

  useEffect(() => {
    if (!isAuthed || !accessToken) return

    /**
     * 這一輪 effect 是否已經被收掉。
     *
     * 必須是區域變數，不能用 ref —— ref 是跨 effect 共用的一格記憶體。
     * effect 重跑時（access token 每小時續期就會發生）順序是：
     * 舊連線 close() → 新的 effect 把旗標設回 false → 舊連線的 onclose
     * 這時才觸發，讀到 false，於是誤判成「意外斷線」再開一條。
     * 連線就這樣一條一條疊上去，每則訊息被算兩次、三次。
     *
     * 區域變數屬於它自己那一輪，舊連線讀到的永遠是舊的那個 true。
     */
    let cancelled = false
    let current: WebSocket | null = null

    /** 同一則只處理一次。回傳 false 代表這是重複的，該直接忽略 */
    const firstTime = (id: string): boolean => {
      const seen = seenRef.current
      if (seen.has(id)) return false
      seen.add(id)
      // 不讓它無限成長。這個上限遠大於任何合理的重複窗口
      if (seen.size > 500) {
        for (const k of seen) {
          seen.delete(k)
          if (seen.size <= 400) break
        }
      }
      return true
    }

    const connect = () => {
      if (cancelled) return

      const ws = new WebSocket(wsUrl(accessToken))
      current = ws
      wsRef.current = ws
      socket = ws

      ws.onopen = () => {
        attemptRef.current = 0
      }

      ws.onmessage = (raw) => {
        let msg: ServerEvent
        try {
          msg = JSON.parse(raw.data)
        } catch {
          return
        }

        switch (msg.event) {
          case 'ping':
            // 回應心跳，讓伺服器知道這條連線還活著
            ws.send(JSON.stringify({ event: 'pong' }))
            break

          case 'notification':
            if (!firstTime(msg.data.id)) break
            // 直接插到清單最前面，不用重新抓
            qc.setQueryData<AppNotification[]>(['notifications'], (old) =>
              old ? [msg.data, ...old] : [msg.data],
            )
            playNotification()
            showNotification(
              `${msg.data.actor.displayName}`,
              msg.data.preview || '有新的動態',
              msg.data.href,
            )
            break

          case 'message': {
            const m = msg.data
            if (!firstTime(m.id)) break
            qc.setQueryData<Message[]>(['messages', m.conversationId], (old) =>
              old ? [...old, m] : [m],
            )
            playMessage(m.conversationId)
            showNotification(m.sender.displayName, m.body, `/chat/${m.conversationId}`)
            // 人正在看的那個對話不算未讀 —— 訊息就顯示在他眼前，
            // 卻同時在側邊欄跳一個紅點，那是很怪的。
            // ChatRoom 會在同一時間通知伺服器，兩邊的認知才會一致
            const viewing = window.location.pathname === `/chat/${m.conversationId}`

            // 對話列表的最後一則訊息與未讀數也要跟著動
            qc.setQueryData<Conversation[]>(['conversations'], (old) =>
              old
                ? old
                    .map((c) =>
                      c.id === m.conversationId
                        ? {
                            ...c,
                            lastMessage: m,
                            updatedAt: m.createdAt,
                            unreadCount: viewing ? 0 : c.unreadCount + 1,
                          }
                        : c,
                    )
                    .sort(
                      (a, b) =>
                        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
                    )
                : old,
            )
            break
          }

          case 'presence':
            // 好友上下線：更新所有帶到這個人的快取
            patchPresence(qc, msg.data.userId, msg.data.presence)
            break

          case 'typing':
            emitTyping(
              msg.data.conversationId,
              msg.data.userId,
              msg.data.displayName,
            )
            break
        }
      }

      ws.onclose = () => {
        // 只清掉自己。晚到的 onclose 不該把別條連線的參考抹掉
        if (wsRef.current === ws) wsRef.current = null
        if (socket === ws) socket = null
        if (cancelled) return

        // 指數退避重連。網路斷掉或伺服器休眠時，
        // 固定間隔的重連會變成沒有意義的洪水
        attemptRef.current += 1
        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** (attemptRef.current - 1),
          RECONNECT_MAX_MS,
        )
        timerRef.current = window.setTimeout(connect, delay)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    /**
     * 回到前景、或網路恢復時，立刻重連。
     *
     * 這是「通知要重新整理才看得到」的主因。手機瀏覽器會凍結背景分頁
     * 並切斷 WebSocket；使用者切回來時，指數退避可能已經排到三十秒後，
     * 那段期間所有即時事件都收不到 —— 而重新整理會重建連線，
     * 所以症狀看起來像是「一定要重新整理」。
     *
     * 退避本身是對的（伺服器休眠時不該用固定間隔洪水式重連），
     * 但「使用者剛回來」是一個明確的訊號：現在值得馬上試一次。
     */
    const reconnectNow = () => {
      if (cancelled) return
      if (wsRef.current?.readyState === WebSocket.OPEN) return
      if (document.visibilityState !== 'visible') return

      window.clearTimeout(timerRef.current)
      // 退避歸零 —— 不然下一次斷線又從三十秒起跳
      attemptRef.current = 0
      connect()
    }

    document.addEventListener('visibilitychange', reconnectNow)
    window.addEventListener('online', reconnectNow)
    window.addEventListener('focus', reconnectNow)

    return () => {
      cancelled = true
      window.clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', reconnectNow)
      window.removeEventListener('online', reconnectNow)
      window.removeEventListener('focus', reconnectNow)
      current?.close()
      if (wsRef.current === current) wsRef.current = null
      if (socket === current) socket = null
    }
  }, [isAuthed, accessToken, qc])
}

/** 使用者物件散落在很多份快取裡，上線狀態變動要一起更新 */
function patchPresence(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  presence: Presence,
): void {
  const touch = (u: { id: string; presence?: Presence }) =>
    u.id === userId ? { ...u, presence } : u

  qc.setQueriesData({ queryKey: ['friends'] }, (old: unknown) =>
    Array.isArray(old) ? old.map(touch) : old,
  )

  qc.setQueriesData({ queryKey: ['conversations'] }, (old: unknown) =>
    Array.isArray(old)
      ? (old as Conversation[]).map((c) => ({ ...c, members: c.members.map(touch) }))
      : old,
  )

  qc.setQueriesData({ queryKey: ['user'] }, (old: unknown) =>
    old && typeof old === 'object' && 'id' in old ? touch(old as never) : old,
  )
}
