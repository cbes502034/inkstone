/**
 * 文字頭像 — 依 id 決定色相，同一個人永遠同一色。
 * 用 SVG data URI，不依賴外部圖床，離線也能顯示。
 * 新註冊還沒上傳照片的使用者就用這個當預設，比灰色人形圖示好看得多。
 */

/** 只走黑白藍 —— 同一個色相家族裡取深淺，放在夜空上不會跳出來搶戲 */
const PALETTE = [
  { bg: '#1E2A44', fg: '#9DBBF0' }, // 夜藍
  { bg: '#243349', fg: '#8FB4E8' }, // 靛
  { bg: '#1A2438', fg: '#A8C4F2' }, // 深海
  { bg: '#2A3550', fg: '#B0C8F5' }, // 星霧
  { bg: '#20293C', fg: '#96AFDC' }, // 石青
  { bg: '#182034', fg: '#8CA8D8' }, // 墨藍
]

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/** 取顯示名稱的頭一個字 —— 中文取首字，英文取首字母 */
function initial(name: string): string {
  const ch = name.trim()[0] ?? '?'
  return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch
}

export function letterAvatar(id: string, displayName: string): string {
  const { bg, fg } = PALETTE[hash(id) % PALETTE.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
<rect width="96" height="96" fill="${bg}"/>
<text x="48" y="49" font-family="Noto Serif TC, serif" font-size="42" font-weight="500"
 fill="${fg}" text-anchor="middle" dominant-baseline="central">${initial(displayName)}</text>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** 頭像來源：使用者上傳的優先，沒有就退回文字頭像 */
export function avatarSrc(user: {
  id: string
  displayName: string
  avatarUrl: string | null
}): string {
  return user.avatarUrl ?? letterAvatar(user.id, user.displayName)
}
