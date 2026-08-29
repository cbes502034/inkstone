import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Clock, MessageCircle, UserPlus } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { PostCard } from '../components/PostCard'
import { Button, EmptyState, FadeIn, PostSkeleton, Skeleton } from '../components/ui'
import { chat, friends, posts } from '../lib/api'
import { presenceText, usePresence } from '../lib/presence'
import { absoluteDate } from '../lib/time'

/**
 * 別人的個人頁 —— 純唯讀。
 *
 * 這裡刻意不放任何可以改動對方資料的介面：沒有編輯鈕、沒有頭像上傳、
 * 對方的信箱等私密欄位後端根本不會回傳。權限由後端強制，前端只是不顯示。
 */
export function UserProfile() {
  const { username = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', username],
    queryFn: () => friends.profile(username),
  })

  const state = usePresence(user?.id)

  const { data: theirPosts } = useQuery({
    queryKey: ['posts', 'author', user?.id],
    queryFn: () => posts.byAuthor(user!.id),
    enabled: Boolean(user),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['user', username] })
  const invite = useMutation({ mutationFn: friends.invite, onSuccess: refresh })
  const accept = useMutation({ mutationFn: friends.accept, onSuccess: refresh })

  const openChat = useMutation({
    mutationFn: () => chat.openDirect(user!.id),
    onSuccess: (conv) => navigate(`/chat/${conv.id}`),
  })

  if (isLoading || !user) {
    return (
      <div className="px-5 py-8 sm:px-8">
        <Skeleton className="mb-4 size-20 rounded-full" />
        <Skeleton className="mb-2 h-6 w-40" />
        <Skeleton className="h-4 w-24" />
      </div>
    )
  }

  return (
    <div>
      <div className="sticky top-[52px] z-20 border-b border-rule bg-paper/85 px-3 py-2 backdrop-blur-md md:top-0">
        <button
          onClick={() => navigate(-1)}
          className="press flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
        >
          <ArrowLeft size={17} />
          返回
        </button>
      </div>

      <FadeIn className="border-b border-rule px-5 py-8 sm:px-8">
        <div className="flex items-start gap-4">
          <Avatar user={user} size={78} showPresence />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl tracking-tight">{user.displayName}</h1>
            <p className="mt-0.5 text-sm text-ink-faint">@{user.username}</p>
            <p
              className={`mt-1 text-[13px] ${
                state === 'online' ? 'text-online' : 'text-ink-faint'
              }`}
            >
              {presenceText(state, user.lastSeenAt)}
            </p>
            <p className="mt-1.5 text-[13px] text-ink-faint">
              {user.postCount} 篇文章
              <span className="mx-1.5">·</span>
              加入於 {absoluteDate(user.createdAt)}
            </p>
          </div>
        </div>

        {user.bio && (
          <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">{user.bio}</p>
        )}

        {/* 關係操作 */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {user.friendState === 'none' && (
            <Button onClick={() => invite.mutate(user.id)} loading={invite.isPending}>
              <UserPlus size={16} />
              加好友
            </Button>
          )}
          {user.friendState === 'outgoing' && (
            <Button variant="outline" disabled>
              <Clock size={16} />
              等待對方回應
            </Button>
          )}
          {user.friendState === 'incoming' && (
            <Button onClick={() => accept.mutate(user.id)} loading={accept.isPending}>
              <Check size={16} />
              接受邀請
            </Button>
          )}
          {user.friendState === 'friends' && (
            <span className="flex items-center gap-1.5 rounded-full border border-rule-strong px-4 py-2 text-sm text-ink-soft">
              <Check size={15} />
              已是好友
            </span>
          )}

          <Button variant="outline" onClick={() => openChat.mutate()} loading={openChat.isPending}>
            <MessageCircle size={16} />
            傳訊息
          </Button>
        </div>
      </FadeIn>

      <h2 className="px-5 pb-1 pt-6 text-[13px] font-medium text-ink-faint sm:px-8">
        文章
      </h2>

      {!theirPosts && <PostSkeleton />}
      {theirPosts?.length === 0 && (
        <EmptyState title="還沒有文章" description={`${user.displayName} 還沒發表過東西。`} />
      )}
      {theirPosts?.map((p) => <PostCard key={p.id} post={p} />)}
    </div>
  )
}
