import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Heart, MessageSquare, UserPlus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { EmptyState, PageTitle, Skeleton } from '../components/ui'
import { notifications } from '../lib/api'
import { relativeTime } from '../lib/time'
import type { NotificationKind } from '../types'

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

  const markRead = useMutation({
    mutationFn: notifications.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const unread = data?.filter((n) => !n.read).length ?? 0

  return (
    <div className="scrim min-h-dvh">
      <PageTitle
        title="通知"
        right={
          unread > 0 ? (
            <button
              onClick={() => markRead.mutate()}
              className="press text-[13px] text-ink-soft transition-colors hover:text-accent"
            >
              全部標為已讀
            </button>
          ) : undefined
        }
      />

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
              ${n.read ? '' : 'bg-accent-wash/40'}`}
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

            {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" />}
          </Link>
        )
      })}
    </div>
  )
}
