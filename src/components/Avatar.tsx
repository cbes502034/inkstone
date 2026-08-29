import { avatarSrc } from '../lib/avatar'
import { presenceLabel } from '../lib/presence'
import type { Presence } from '../types'

interface Props {
  /** 狀態跟著使用者物件一起從後端來，前端不自己推算 */
  user: {
    id: string
    displayName: string
    avatarUrl: string | null
    presence?: Presence
  }
  size?: number
  /** 顯示上線狀態圓點。列表、聊天、個人頁用得到；文章內文就不必了 */
  showPresence?: boolean
  className?: string
}

const DOT_COLOR: Record<Presence, string> = {
  online: 'bg-online',
  away: 'bg-ink-faint',
  offline: 'bg-ink-faint',
}

export function Avatar({ user, size = 40, showPresence = false, className = '' }: Props) {
  const presence: Presence = user.presence ?? 'offline'

  // 圓點隨頭像等比縮放，小頭像上才不會顯得笨重
  const dot = Math.max(8, Math.round(size * 0.27))

  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: size, height: size }}
    >
      <img
        src={avatarSrc(user)}
        alt={user.displayName}
        width={size}
        height={size}
        loading="lazy"
        className={`rounded-full object-cover ring-1 ring-rule ${className}`}
        style={{ width: size, height: size }}
      />
      {showPresence && (
        <span
          title={`${user.displayName}：${presenceLabel(presence)}`}
          className={`absolute bottom-0 right-0 rounded-full ring-2 ring-paper ${DOT_COLOR[presence]}`}
          style={{ width: dot, height: dot }}
        >
          <span className="sr-only">{presenceLabel(presence)}</span>
        </span>
      )}
    </span>
  )
}

/** 群組用 —— 疊三張成員頭像 */
export function AvatarStack({
  users,
  size = 40,
}: {
  users: Array<{ id: string; displayName: string; avatarUrl: string | null }>
  size?: number
}) {
  const shown = users.slice(0, 3)
  const inner = Math.round(size * 0.62)
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {shown.map((u, i) => (
        <img
          key={u.id}
          src={avatarSrc(u)}
          alt=""
          className="absolute rounded-full object-cover ring-2 ring-paper"
          style={{
            width: inner,
            height: inner,
            left: i === 0 ? 0 : i === 1 ? size - inner : (size - inner) / 2,
            top: i === 2 ? size - inner : 0,
            zIndex: i,
          }}
        />
      ))}
    </div>
  )
}
