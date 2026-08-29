import { useEffect, useState } from 'react'
import type { Presence } from '../types'
import { USERS } from './mock/seed'

/**
 * 上線狀態頻道。
 *
 * 正式版本接 WebSocket（Supabase Realtime 的 presence channel）：
 *   - 前端連上就送心跳，斷線後由伺服器在寬限期（約 30 秒）後標記離線，
 *     這樣使用者切分頁、過隧道、短暫斷網不會一直閃「離線」。
 *   - 頁面 visibilitychange 超過數分鐘沒動作 → away。
 *   - 對方關閉「顯示上線狀態」時，後端一律回傳 offline 且不給 lastSeenAt。
 *
 * 這裡先用一個本機的 pub/sub 模擬同樣的介面，之後把 subscribe 內部換成
 * WebSocket 事件即可，用到的元件不需要改。
 */

type Listener = (map: Record<string, Presence>) => void

const state: Record<string, Presence> = {}
const listeners = new Set<Listener>()

for (const u of USERS) state[u.id] = u.presence

function emit() {
  const snapshot = { ...state }
  for (const fn of listeners) fn(snapshot)
}

export const presence = {
  get(userId: string): Presence {
    return state[userId] ?? 'offline'
  },

  snapshot(): Record<string, Presence> {
    return { ...state }
  },

  /** 自己的狀態改變時要往伺服器送 —— 例如切到背景分頁 */
  setSelf(next: Presence) {
    state['u_me'] = next
    emit()
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    fn({ ...state })
    return () => listeners.delete(fn)
  },
}

/* ---------------------------------------------------------------- 模擬 */

// 讓畫面上的狀態偶爾變動，才看得出這是即時的而不是寫死的
const FLIPPABLE = ['u_lin', 'u_chen', 'u_huang', 'u_tsai', 'u_hsu']
const CYCLE: Presence[] = ['online', 'away', 'offline']

setInterval(() => {
  const id = FLIPPABLE[Math.floor(Math.random() * FLIPPABLE.length)]
  const current = state[id] ?? 'offline'
  const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]
  state[id] = next
  const user = USERS.find((u) => u.id === id)
  if (user) {
    user.presence = next
    if (next !== 'online') user.lastSeenAt = new Date().toISOString()
  }
  emit()
}, 9000)

// 自己切到背景分頁就轉 away，回來再轉回 online
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    presence.setSelf(document.hidden ? 'away' : 'online')
  })
}

/* ------------------------------------------------------------------ */

/** 訂閱單一使用者的狀態 */
export function usePresence(userId: string | undefined): Presence {
  const [value, setValue] = useState<Presence>(() =>
    userId ? presence.get(userId) : 'offline',
  )

  useEffect(() => {
    if (!userId) return
    return presence.subscribe((map) => setValue(map[userId] ?? 'offline'))
  }, [userId])

  return value
}

/** 訂閱整份狀態表 —— 列表頁一次訂閱就好，不用每列各開一個 */
export function usePresenceMap(): Record<string, Presence> {
  const [map, setMap] = useState<Record<string, Presence>>(() => presence.snapshot())
  useEffect(() => presence.subscribe(setMap), [])
  return map
}

/* ------------------------------------------------------------ 文字呈現 */

const LABEL: Record<Presence, string> = {
  online: '上線中',
  away: '閒置中',
  offline: '離線',
}

export function presenceLabel(p: Presence): string {
  return LABEL[p]
}

/** 離線時顯示「最後上線」，線上時直接說上線中 */
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
