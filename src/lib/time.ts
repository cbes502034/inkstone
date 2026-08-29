/** 時間顯示 —— 一週內用相對時間，超過就顯示日期。 */

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < MIN) return '剛剛'
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分鐘前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小時前`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`
  return absoluteDate(iso)
}

export function absoluteDate(iso: string): string {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return sameYear
    ? `${d.getMonth() + 1} 月 ${d.getDate()} 日`
    : `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/** 聊天室用 —— 今天只顯示時分 */
export function clockTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** 訊息分隔線用的日期標籤 */
export function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  if (isToday) return '今天'
  const yesterday = new Date(today.getTime() - DAY)
  if (d.toDateString() === yesterday.toDateString()) return '昨天'
  return absoluteDate(iso)
}
