import { useInfiniteQuery } from '@tanstack/react-query'
import { Feather } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PostCard } from '../components/PostCard'
import { Button, EmptyState, PostSkeleton } from '../components/ui'
import { posts } from '../lib/api'
import { useAuth } from '../store/auth'

export function Feed() {
  const { user } = useAuth()
  const sentinel = useRef<HTMLDivElement>(null)

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['feed'],
      queryFn: ({ pageParam }) => posts.feed(pageParam),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
    })

  // 無限捲動 —— 捲到底自動載入下一頁
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const hour = new Date().getHours()
  const greeting = hour < 5 ? '夜深了' : hour < 11 ? '早安' : hour < 18 ? '午安' : '晚安'

  return (
    <div>
      {/* 招呼 —— 給進來的人一個落腳點，而不是直接砸一牆內容 */}
      <header className="border-b border-rule px-5 py-7 sm:px-8">
        <p className="text-sm text-ink-faint">
          {greeting}，{user?.displayName}
        </p>
        <h1 className="mt-1.5 text-[26px] leading-tight tracking-tight sm:text-3xl">
          今天想寫點什麼嗎？
        </h1>
        <Link to="/write" className="mt-4 inline-block">
          <Button variant="outline">
            <Feather size={16} />
            開始寫
          </Button>
        </Link>
      </header>

      {isLoading && (
        <>
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </>
      )}

      {!isLoading && items.length === 0 && (
        <EmptyState
          icon={<Feather size={30} strokeWidth={1.4} />}
          title="這裡還很安靜"
          description="加幾個好友，或是寫下第一篇文章。從一件今天發生的小事開始就好。"
          action={
            <Link to="/write">
              <Button>寫第一篇</Button>
            </Link>
          }
        />
      )}

      {items.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

      <div ref={sentinel} />

      {isFetchingNextPage && <PostSkeleton />}

      {!hasNextPage && items.length > 0 && (
        <p className="py-12 text-center text-[13px] text-ink-faint">
          — 到底了 —
        </p>
      )}
    </div>
  )
}
