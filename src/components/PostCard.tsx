import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Heart, MessageSquare, PencilLine, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { posts } from '../lib/api'
import { extractTags, readingMinutes } from '../lib/markup'
import { relativeTime } from '../lib/time'
import type { Post } from '../types'
import { Avatar } from './Avatar'
import { ConfirmDialog } from './ConfirmDialog'
import { PostExcerpt } from './PostBody'

export function PostCard({ post }: { post: Post }) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const like = useMutation({
    // 後端按讚與取消是兩支各自冪等的端點，這裡帶入「要變成什麼狀態」
    mutationFn: () => posts.setLike(post.id, !post.likedByMe),
    // 樂觀更新 —— 點下去畫面立刻反應，不等 API 回來
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['feed'] })
      const snapshot = qc.getQueriesData({ queryKey: ['feed'] })
      patchEverywhere(qc, post.id, (p) => ({
        ...p,
        likedByMe: !p.likedByMe,
        likeCount: p.likeCount + (p.likedByMe ? -1 : 1),
      }))
      return { snapshot }
    },
    onError: (_e, _v, ctx) => {
      // 失敗就還原，使用者不會看到假的成功狀態
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
    },
  })

  const [confirmDelete, setConfirmDelete] = useState(false)

  const remove = useMutation({
    mutationFn: () => posts.remove(post.id),
    onSuccess: () => {
      // 直接把它從列表拿掉，不等重新請求 —— 使用者剛按下刪除，
      // 卡片還留在畫面上會讓人以為沒成功
      removeEverywhere(qc, post.id)
      setConfirmDelete(false)
    },
    onError: () => setConfirmDelete(false),
  })

  const tags = post.tags.length ? post.tags : extractTags(post.body)

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => navigate(`/post/${post.id}`)}
      className="panel group cursor-pointer px-5 py-6 transition-colors
                 hover:border-rule-strong sm:px-7 sm:py-7"
    >
      {/* 作者列 */}
      <div className="mb-3.5 flex items-center gap-2.5">
        <Link
          to={`/u/${post.author.username}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0"
        >
          <Avatar user={post.author} size={34} />
        </Link>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px]">
          <Link
            to={`/u/${post.author.username}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-ink hover:underline"
          >
            {post.author.displayName}
          </Link>
          <span className="text-ink-faint">{relativeTime(post.createdAt)}</span>
          {post.edited && (
            <span className="text-ink-faint" title={`編輯於 ${relativeTime(post.updatedAt)}`}>
              · 已編輯
            </span>
          )}
        </div>

        {/* 只有自己的文章才有編輯 —— 後端同樣會驗證擁有者，不是只靠這裡藏按鈕 */}
        {/* 只有自己的文章才有這兩顆 —— 後端同樣會驗證擁有者，不是只靠這裡藏按鈕 */}
        {post.isMine && (
          <div
            className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity
                       focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100"
          >
            <Link
              to={`/write?edit=${post.id}`}
              onClick={(e) => e.stopPropagation()}
              aria-label="編輯這篇"
              className="press grid size-8 place-items-center rounded-full text-ink-faint
                         transition-colors hover:bg-paper-sunk hover:text-ink"
            >
              <PencilLine size={16} />
            </Link>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setConfirmDelete(true)
              }}
              aria-label="刪除這篇"
              className="press grid size-8 place-items-center rounded-full text-ink-faint
                         transition-colors hover:bg-accent-wash hover:text-accent"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* 標題與摘要 */}
      <h2 className="mb-2 text-[21px] leading-snug tracking-tight text-ink sm:text-[23px]">
        {post.title}
      </h2>
      <PostExcerpt
        source={post.body}
        max={120}
        className="mb-4 line-clamp-3 text-[15px] leading-relaxed text-ink-soft"
      />

      {/* 標籤 */}
      {tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-x-3 gap-y-1.5">
          {tags.slice(0, 4).map((t) => (
            <button
              key={t}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/search?q=${encodeURIComponent(t)}`)
              }}
              className="text-[13px] text-accent transition-opacity hover:opacity-70"
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {/* 互動列 */}
      <div className="flex items-center gap-5 text-[13px] text-ink-faint">
        <button
          onClick={(e) => {
            e.stopPropagation()
            like.mutate()
          }}
          className="press flex items-center gap-1.5 transition-colors hover:text-accent"
          aria-pressed={post.likedByMe}
          aria-label={post.likedByMe ? '取消喜歡' : '喜歡'}
        >
          <motion.span
            animate={post.likedByMe ? { scale: [1, 1.35, 1] } : {}}
            transition={{ duration: 0.32 }}
          >
            <Heart
              size={16}
              className={post.likedByMe ? 'fill-accent text-accent' : ''}
              strokeWidth={1.8}
            />
          </motion.span>
          <span className={post.likedByMe ? 'text-accent' : ''}>{post.likeCount}</span>
        </button>

        <span className="flex items-center gap-1.5">
          <MessageSquare size={16} strokeWidth={1.8} />
          {post.commentCount}
        </span>

        <span className="ml-auto">{readingMinutes(post.body)} 分鐘</span>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="刪除這篇文章？"
        description="連同底下的留言一起消失，而且沒有辦法復原。"
        confirmLabel="刪除"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </motion.article>
  )
}

/** 從所有列表快取裡移除這篇 —— 動態牆、搜尋、個人頁可能都有它 */
function removeEverywhere(qc: ReturnType<typeof useQueryClient>, postId: string) {
  qc.setQueriesData({ queryKey: ['feed'] }, (old: any) => {
    if (!old?.pages) return old
    return {
      ...old,
      pages: old.pages.map((page: any) => ({
        ...page,
        items: page.items.filter((p: Post) => p.id !== postId),
      })),
    }
  })
  qc.setQueriesData({ queryKey: ['posts', 'mine'] }, (old: any) =>
    Array.isArray(old) ? old.filter((p: Post) => p.id !== postId) : old,
  )
  qc.removeQueries({ queryKey: ['post', postId] })
}

/** 同一篇文章可能出現在多個查詢快取裡（動態牆、搜尋、個人頁），一起更新 */
function patchEverywhere(
  qc: ReturnType<typeof useQueryClient>,
  postId: string,
  fn: (p: Post) => Post,
) {
  qc.setQueriesData({ queryKey: ['feed'] }, (old: any) => {
    if (!old?.pages) return old
    return {
      ...old,
      pages: old.pages.map((page: any) => ({
        ...page,
        items: page.items.map((p: Post) => (p.id === postId ? fn(p) : p)),
      })),
    }
  })
  qc.setQueryData(['post', postId], (old: Post | undefined) => (old ? fn(old) : old))
}
