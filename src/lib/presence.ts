import { useEffect } from 'react'
import { auth } from './api'
import { useAuth } from '../store/auth'
import type { Presence } from '../types'

/**
 * 上線狀態。
 *
 * 狀態是後端算的，跟著每個使用者物件一起回傳 —— 前端不再自己推算，
 * 這樣「對方關閉了顯示上線狀態」這件事才擋得住（後端一律回 offline，
 * 前端根本拿不到真實狀態）。
 *
 * 待辦：目前靠查詢時附帶的欄位 + 心跳，即時性不足。
 * 接上 WebSocket 後改由推送更新。
 */

const LABEL: Record<Presence, string> = {
  online: '上線中',
  away: '閒置中',
  offline: '離線',
}

export function presenceLabel(p: Presence): string {
  return LABEL[p]
}

/** 離線時顯示「最後上線」，線上就直接說上線中 */
export function presenceText(p: Presence, lastSeenAt: string | null): string {
  if (p !== 'offline') return LABEL[p]
  if (!lastSeenAt) return '離線'

  const diff = Date.now() - new Date(lastSeenAt).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return '剛剛還在線上'
  if (mins < 60) return `${mins} 分鐘前上線`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小時前上線`
  const days = Math.floor(hours / 24)
  return days < 8 ? `${days} 天前上線` : '很久沒上線'
}

/**
 * 心跳。
 *
 * 讓自己維持在線上。分頁切到背景就停 —— 使用者沒在看的時候
 * 不該還顯示成上線中，也不必浪費請求。
 */
const HEARTBEAT_MS = 30_000

export function useHeartbeat(): void {
  const isAuthed = useAuth((s) => s.isAuthed)

  useEffect(() => {
    if (!isAuthed) return

    let timer: number | undefined

    const beat = () => {
      if (!document.hidden) auth.heartbeat().catch(() => {})
    }

    beat()
    timer = window.setInterval(beat, HEARTBEAT_MS)

    // 從背景切回來立刻補一次，不用等下一輪
    const onVisible = () => {
      if (!document.hidden) beat()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (timer) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isAuthed])
}
