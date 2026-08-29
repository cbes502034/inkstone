import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Heart, PencilLine, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { PostBody } from '../components/PostBody'
import { Button, FadeIn, Skeleton } from '../components/ui'
import { comments, posts } from '../lib/api'
import { readingMinutes } from '../lib/markup'
import { absoluteDate, relativeTime } from '../lib/time'
import { useAuth } from '../store/auth'

export function PostDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const [draft, setDraft] = useState('')

  const { data: post, isLoading } = useQuery({
    queryKey: ['post', id],
    queryFn: () => posts.get(id),
  })

  const { data: list } = useQuery({
    queryKey: ['comments', id],
    queryFn: () => comments.list(id),
  })

  const like = useMutation({
    mutationFn: () => posts.toggleLike(id),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['post', id] })
      const prev = qc.getQueryData(['post', id])
      qc.setQueryData(['post', id], (p: any) =>
        p
          ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
          : p,
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(['post', id], ctx?.prev),
  })

  const addComment = useMutation({
    mutationFn: (body: string) => comments.create(id, body),
    onSuccess: () => {
      setDraft('')
      qc.invalidateQueries({ queryKey: ['comments', id] })
      qc.invalidateQueries({ queryKey: ['post', id] })
    },
  })

  const removePost = useMutation({
    mutationFn: () => posts.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] })
      navigate('/')
    },
  })

  if (isLoading || !post) {
    return (
      <div className="px-5 py-8 sm:px-8">
        <Skeleton className="mb-4 h-8 w-3/4" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    )
  }

  return (
    <article>
      {/* 返回 */}
      <div className="sticky top-[52px] z-20 border-b border-rule bg-paper/85 px-3 py-2 backdrop-blur-md md:top-0">
        <button
          onClick={() => navigate(-1)}
          className="press flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
        >
          <ArrowLeft size={17} />
          返回
        </button>
      </div>

      <FadeIn className="px-5 py-8 sm:px-10 sm:py-12">
        {/* 標題 */}
        <h1 className="text-[30px] leading-[1.3] tracking-tight sm:text-[38px]">
          {post.title}
        </h1>

        {/* 作者 */}
        <div className="mt-6 flex items-center gap-3 border-b border-rule pb-6">
          <Link to={`/u/${post.author.username}`}>
            <Avatar user={post.author} size={42} />
          </Link>
          <div className="min-w-0 flex-1 text-sm leading-tight">
            <Link
              to={`/u/${post.author.username}`}
              className="font-medium text-ink hover:underline"
            >
              {post.author.displayName}
            </Link>
            <p className="mt-0.5 text-[13px] text-ink-faint">
              {absoluteDate(post.createdAt)}
              <span className="mx-1.5">·</span>
              {readingMinutes(post.body)} 分鐘
              {post.edited && (
                <>
                  <span className="mx-1.5">·</span>
                  編輯於 {relativeTime(post.updatedAt)}
                </>
              )}
            </p>
          </div>

          {post.isMine && (
            <div className="flex shrink-0 items-center gap-1">
              <Link
                to={`/write?edit=${post.id}`}
                aria-label="編輯"
                className="press grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
              >
                <PencilLine size={17} />
              </Link>
              <button
                aria-label="刪除"
                onClick={() => {
                  if (confirm('刪除後無法復原，確定嗎？')) removePost.mutate()
                }}
                className="press grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-accent-wash hover:text-accent"
              >
                <Trash2 size={17} />
              </button>
            </div>
          )}
        </div>

        {/* 內文 */}
        <div className="mt-8">
          <PostBody source={post.body} />
        </div>

        {/* 喜歡 */}
        <div className="mt-10 flex items-center gap-3 border-t border-rule pt-7">
          <button
            onClick={() => like.mutate()}
            aria-pressed={post.likedByMe}
            className={`press flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors
              ${
                post.likedByMe
                  ? 'border-accent bg-accent-wash text-accent'
                  : 'border-rule-strong text-ink-soft hover:border-accent hover:text-accent'
              }`}
          >
            <Heart size={16} className={post.likedByMe ? 'fill-accent' : ''} />
            {post.likeCount}
          </button>
          <span className="text-sm text-ink-faint">{post.commentCount} 則留言</span>
        </div>
      </FadeIn>

      {/* 留言 */}
      <section className="border-t border-rule px-5 py-8 sm:px-10">
        <h2 className="mb-6 text-lg">留言</h2>

        <div className="mb-8 flex gap-3">
          {user && <Avatar user={user} size={36} />}
          <div className="min-w-0 flex-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="說點什麼…"
              rows={2}
              className="w-full resize-none rounded-xl border border-rule bg-paper-raised px-3.5 py-2.5
                         text-[15px] outline-none transition-colors placeholder:text-ink-faint focus:border-accent"
            />
            {draft.trim() && (
              <div className="mt-2 flex justify-end">
                <Button
                  onClick={() => addComment.mutate(draft)}
                  loading={addComment.isPending}
                >
                  送出
                </Button>
              </div>
            )}
          </div>
        </div>

        {list?.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-faint">
            還沒有人留言，當第一個吧。
          </p>
        )}

        <div className="flex flex-col gap-6">
          {list?.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Link to={`/u/${c.author.username}`} className="shrink-0">
                <Avatar user={c.author} size={36} />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-[13px]">
                  <Link
                    to={`/u/${c.author.username}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {c.author.displayName}
                  </Link>
                  <span className="text-ink-faint">{relativeTime(c.createdAt)}</span>
                </div>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </article>
  )
}
