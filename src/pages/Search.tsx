import { useQuery } from '@tanstack/react-query'
import { Search as SearchIcon, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { PostCard } from '../components/PostCard'
import { EmptyState, PageTitle, PostSkeleton } from '../components/ui'
import { posts } from '../lib/api'

/**
 * 文章裡的 #標籤 點下去會導到這裡，網址帶 ?q=標籤，
 * 搜尋框自動填入該文字並立刻查詢 —— 使用者不用再打一次。
 */
export function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [input, setInput] = useState(q)

  // 網址變動（例如從別頁點標籤進來）時同步輸入框
  useEffect(() => setInput(q), [q])

  // 輸入防抖，避免每打一個字就打一次 API
  useEffect(() => {
    const t = setTimeout(() => {
      if (input !== q) setParams(input ? { q: input } : {}, { replace: true })
    }, 350)
    return () => clearTimeout(t)
  }, [input, q, setParams])

  const { data, isLoading } = useQuery({
    queryKey: ['search', q],
    queryFn: () => posts.search(q),
    enabled: q.trim().length > 0,
  })

  const hasResults = (data?.posts.length ?? 0) + (data?.users.length ?? 0) > 0

  return (
    <div className="scrim min-h-dvh">
      <PageTitle title="探索" />

      <div className="sticky top-[52px] z-20 border-b border-rule bg-paper/90 px-5 py-3 backdrop-blur-md sm:px-8 md:top-0">
        <div className="flex items-center gap-2.5 rounded-full border border-rule bg-paper-raised px-4 py-2.5 focus-within:border-accent">
          <SearchIcon size={17} className="shrink-0 text-ink-faint" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="輸入關鍵字或標籤"
            autoComplete="off"
            className="min-w-0 flex-1 border-none bg-transparent p-0 text-[15px] outline-none placeholder:text-ink-faint"
          />
          {input && (
            <button
              onClick={() => setInput('')}
              aria-label="清除"
              className="press shrink-0 text-ink-faint hover:text-ink"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {!q && (
        <EmptyState
          icon={<SearchIcon size={30} strokeWidth={1.4} />}
          title="想找什麼？"
          description="文章、標籤，或是某個人。"
        />
      )}

      {q && isLoading && (
        <>
          <PostSkeleton />
          <PostSkeleton />
        </>
      )}

      {q && !isLoading && !hasResults && (
        <EmptyState
          title={`找不到「${q}」`}
          description="換個說法試試，或是你可以自己寫一篇關於這個主題的文章。"
        />
      )}

      {/* 人 */}
      {data && data.users.length > 0 && (
        <section className="border-b border-rule">
          <h2 className="px-5 pb-2 pt-6 text-[13px] font-medium tracking-wide text-ink-faint sm:px-8">
            使用者
          </h2>
          {data.users.map((u) => (
            <Link
              key={u.id}
              to={`/u/${u.username}`}
              className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-paper-raised sm:px-8"
            >
              <Avatar user={u} size={42} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">{u.displayName}</p>
                <p className="truncate text-[13px] text-ink-faint">
                  @{u.username}
                  {u.bio && <span className="mx-1.5">·</span>}
                  {u.bio}
                </p>
              </div>
            </Link>
          ))}
        </section>
      )}

      {/* 文章 */}
      {data && data.posts.length > 0 && (
        <section>
          <h2 className="px-5 pb-1 pt-6 text-[13px] font-medium tracking-wide text-ink-faint sm:px-8">
            文章 · {data.posts.length} 篇
          </h2>
          <div className="flex flex-col gap-3 p-3 pt-1 sm:gap-4 sm:p-4 sm:pt-1">
            {data.posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
