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
  const closedByUs = useRef(false)

  useEffect(() => {
    if (!isAuthed || !accessToken) return

    closedByUs.current = false

    const connect = () => {
      const ws = new WebSocket(wsUrl(accessToken))
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
            qc.setQueryData<Message[]>(['messages', m.conversationId], (old) =>
              old ? [...old, m] : [m],
            )
            playMessage()
            showNotification(m.sender.displayName, m.body, `/chat/${m.conversationId}`)
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
                            unreadCount: c.unreadCount + 1,
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
        wsRef.current = null
        if (socket === ws) socket = null
        if (closedByUs.current) return

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

    return () => {
      closedByUs.current = true
      window.clearTimeout(timerRef.current)
      wsRef.current?.close()
      wsRef.current = null
      socket = null
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
