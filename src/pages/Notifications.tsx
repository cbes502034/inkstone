import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Heart, MessageSquare, UserPlus, Users } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { EmptyState, PageTitle, Skeleton } from '../components/ui'
import { notifications } from '../lib/api'
import { relativeTime } from '../lib/time'
import type { AppNotification, NotificationKind } from '../types'

const ICON: Record<NotificationKind, typeof Heart> = {
  post_liked: Heart,
  post_commented: MessageSquare,
  friend_request: UserPlus,
  friend_accepted: UserPlus,
  group_invited: Users,
}

const VERB: Record<NotificationKind, string> = {
  post_liked: '喜歡你的文章',
  post_commented: '在你的文章留言',
  friend_request: '想加你為好友',
  friend_accepted: '接受了你的好友邀請',
  group_invited: '邀請你加入群組',
}

export function Notifications() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: notifications.list,
  })

  // 這一趟看過哪幾則原本是未讀的。
  //
  // 需要記下來，是因為下面會馬上把它們標成已讀 —— 若直接照 n.read 來上色，
  // 使用者一進頁面，藍底就在同一瞬間全部消失，等於看不出哪幾則是新的。
  // 記在 ref 而不是 state：它只影響畫面上的樣式，不需要為它重新渲染。
  const wasUnread = useRef(new Set<string>())
  for (const n of data ?? []) if (!n.read) wasUnread.current.add(n.id)

  // 進到這一頁就把伺服器上的未讀清掉。
  //
  // 原本只有按下「全部標為已讀」才會送出這個請求，於是幾乎沒有人送過 ——
  // 未讀狀態一直留在資料庫裡。在這台看起來像讀過了（因為你人就在看），
  // 換一台裝置打開卻整排又是未讀。
  //
  // 未讀是跟著帳號走的狀態，不是跟著這台瀏覽器，所以它必須存回伺服器。
  useEffect(() => {
    if (!data?.some((n) => !n.read)) return
    void notifications.markAllRead().then(() => {
      // 本地直接改，不重抓 —— 這一份資料我們已經有了，
      // 差別只在那個布林值
      qc.setQueryData<AppNotification[]>(['notifications'], (old) =>
        old?.map((n) => (n.read ? n : { ...n, read: true })),
      )
    })
  }, [data, qc])

  return (
    <div className="scrim min-h-dvh">
      {/*
        原本這裡有一個「全部標為已讀」按鈕。現在進頁面就會自動標記，
        它已經沒有事情可做 —— 留著一個按了什麼都不會變的按鈕，
        比沒有按鈕更糟。
      */}
      <PageTitle title="通知" />

      {isLoading && (
        <div className="flex flex-col gap-5 p-5 sm:p-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-4 w-52" />
            </div>
          ))}
        </div>
      )}

      {data?.length === 0 && (
        <EmptyState
          icon={<Bell size={30} strokeWidth={1.4} />}
          title="目前沒有通知"
          description="有人按讚、留言或加你好友的時候，會出現在這裡。"
        />
      )}

      {data?.map((n) => {
        const Icon = ICON[n.kind]
        return (
          <Link
            key={n.id}
            to={n.href}
            className={`flex gap-3 border-b border-rule px-5 py-4 transition-colors hover:bg-paper-raised sm:px-8
              ${wasUnread.current.has(n.id) ? 'bg-accent-wash/40' : ''}`}
          >
            <div className="relative shrink-0">
              <Avatar user={n.actor} size={42} />
              <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-paper-raised ring-1 ring-rule">
                <Icon size={11} className="text-accent" />
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-snug">
                <span className="font-medium">{n.actor.displayName}</span>
                <span className="text-ink-soft"> {VERB[n.kind]}</span>
              </p>
              <p className="mt-1 line-clamp-2 text-[13px] text-ink-faint">{n.preview}</p>
              <p className="mt-1 text-[12px] text-ink-faint">{relativeTime(n.createdAt)}</p>
            </div>

            {wasUnread.current.has(n.id) && (
              <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" />
            )}
          </Link>
        )
      })}
    </div>
  )
}
