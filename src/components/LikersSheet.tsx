import { useQuery } from '@tanstack/react-query'
import { Heart, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { posts } from '../lib/api'
import { presenceText, usePresence } from '../lib/presence'
import type { UserPublic } from '../types'
import { Avatar } from './Avatar'
import { Skeleton } from './ui'

/**
 * 誰按了讚。
 *
 * 手機從底部推上來，桌機置中。名單把自己和好友排前面 ——
 * 使用者最想知道的是「我認識的人有誰按了」。
 */
export function LikersSheet({
  postId,
  open,
  onClose,
}: {
  postId: string
  open: boolean
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['likers', postId],
    queryFn: () => posts.likers(postId),
    enabled: open,
  })

  const shown = data?.items.length ?? 0
  const others = Math.max(0, (data?.total ?? 0) - shown)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            role="dialog"
            aria-label="按讚的人"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col
                       rounded-t-2xl border border-rule bg-paper-raised backdrop-blur-xl
                       sm:inset-0 sm:m-auto sm:h-fit sm:max-w-sm sm:rounded-2xl"
          >
            <header className="flex items-center gap-2 border-b border-rule px-5 py-4">
              <Heart size={17} className="fill-accent text-accent" />
              <h2 className="text-[16px]">
                {data ? `${data.total} 人喜歡` : '喜歡'}
              </h2>
              <button
                onClick={onClose}
                aria-label="關閉"
                className="press ml-auto grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
              >
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto py-2">
              {isLoading &&
                [0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <Skeleton className="size-10 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                ))}

              {data?.items.map((u) => (
                <LikerRow key={u.id} user={u} onNavigate={onClose} />
              ))}

              {others > 0 && (
                <p className="px-5 py-4 text-[13px] text-ink-faint">
                  還有 {others} 人也喜歡這篇
                </p>
              )}

              {!isLoading && shown === 0 && (
                <p className="px-5 py-8 text-center text-sm text-ink-faint">
                  還沒有人按讚。
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function LikerRow({ user, onNavigate }: { user: UserPublic; onNavigate: () => void }) {
  const state = usePresence(user.id)
  return (
    <Link
      to={`/u/${user.username}`}
      onClick={onNavigate}
      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-paper-sunk"
    >
      <Avatar user={user} size={40} showPresence />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">
          {user.displayName}
        </span>
        <span className="block truncate text-[12px] text-ink-faint">
          @{user.username}
          <span className="mx-1.5">·</span>
          {presenceText(state, user.lastSeenAt)}
        </span>
      </span>
    </Link>
  )
}
