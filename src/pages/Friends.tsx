import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, MessageCircle, Search as SearchIcon, UserPlus, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Button, EmptyState, PageTitle, Skeleton } from '../components/ui'
import { chat, friends } from '../lib/api'
import { presenceText, usePresence } from '../lib/presence'
import type { UserPublic } from '../types'

type Tab = 'list' | 'requests' | 'find'

export function Friends() {
  const [tab, setTab] = useState<Tab>('list')
  const qc = useQueryClient()

  const { data: list, isLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: friends.list,
  })
  const { data: incoming } = useQuery({
    queryKey: ['friends', 'incoming'],
    queryFn: friends.incoming,
  })
  const { data: outgoing } = useQuery({
    queryKey: ['friends', 'outgoing'],
    queryFn: friends.outgoing,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['friends'] })

  const accept = useMutation({ mutationFn: friends.accept, onSuccess: refresh })
  const decline = useMutation({ mutationFn: friends.decline, onSuccess: refresh })

  const pending = incoming?.length ?? 0

  const TABS: Array<[Tab, string, number?]> = [
    ['list', '好友', list?.length],
    ['requests', '邀請', pending],
    ['find', '找人'],
  ]

  return (
    <div className="scrim min-h-dvh">
      <PageTitle title="好友" />

      {/* 分頁 */}
      <div className="no-scrollbar sticky top-[52px] z-20 flex gap-1 overflow-x-auto border-b border-rule bg-paper/90 px-3 py-2 backdrop-blur-md md:top-0">
        {TABS.map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors
              ${tab === key ? 'bg-ink text-void' : 'text-ink-soft hover:bg-paper-sunk'}`}
          >
            {label}
            {typeof count === 'number' && count > 0 && (
              <span
                className={`grid min-w-5 place-items-center rounded-full px-1 text-[11px]
                  ${tab === key ? 'bg-paper/25' : key === 'requests' ? 'bg-accent text-white' : 'bg-paper-sunk'}`}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 好友列表 */}
      {tab === 'list' && (
        <>
          {isLoading && (
            <div className="flex flex-col gap-4 p-5 sm:p-8">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-11 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          )}
          {list?.length === 0 && (
            <EmptyState
              icon={<Users size={30} strokeWidth={1.4} />}
              title="還沒有好友"
              description="去「找人」分頁搜尋看看，或是先寫幾篇文章，讓別人找到你。"
              action={<Button onClick={() => setTab('find')}>去找人</Button>}
            />
          )}
          {list?.map((u) => <FriendRow key={u.id} user={u} />)}
        </>
      )}

      {/* 邀請 */}
      {tab === 'requests' && (
        <>
          {pending === 0 && (outgoing?.length ?? 0) === 0 && (
            <EmptyState title="沒有待處理的邀請" description="有人邀請你的時候會出現在這裡。" />
          )}

          {pending > 0 && (
            <section>
              <h2 className="px-5 pb-1 pt-6 text-[13px] font-medium text-ink-faint sm:px-8">
                收到的邀請
              </h2>
              {incoming?.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 border-b border-rule px-5 py-4 sm:px-8"
                >
                  <Link to={`/u/${u.username}`}>
                    <Avatar user={u} size={44} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to={`/u/${u.username}`} className="font-medium hover:underline">
                      {u.displayName}
                    </Link>
                    <p className="truncate text-[13px] text-ink-faint">@{u.username}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => accept.mutate(u.id)}
                      aria-label="接受"
                      className="press grid size-9 place-items-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover"
                    >
                      <Check size={17} />
                    </button>
                    <button
                      onClick={() => decline.mutate(u.id)}
                      aria-label="拒絕"
                      className="press grid size-9 place-items-center rounded-full border border-rule-strong text-ink-soft transition-colors hover:bg-paper-sunk"
                    >
                      <X size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {(outgoing?.length ?? 0) > 0 && (
            <section>
              <h2 className="px-5 pb-1 pt-6 text-[13px] font-medium text-ink-faint sm:px-8">
                我送出的
              </h2>
              {outgoing?.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 border-b border-rule px-5 py-4 sm:px-8"
                >
                  <Avatar user={u} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{u.displayName}</p>
                    <p className="text-[13px] text-ink-faint">等待對方回應</p>
                  </div>
                  <Button variant="outline" onClick={() => decline.mutate(u.id)}>
                    收回
                  </Button>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {tab === 'find' && <FindPeople />}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function FriendRow({ user }: { user: UserPublic }) {
  const navigate = useNavigate()
  const state = usePresence(user.id)
  const open = useMutation({
    mutationFn: () => chat.openDirect(user.id),
    onSuccess: (conv) => navigate(`/chat/${conv.id}`),
  })

  return (
    <div className="flex items-center gap-3 border-b border-rule px-5 py-4 transition-colors hover:bg-paper-raised sm:px-8">
      <Link to={`/u/${user.username}`}>
        <Avatar user={user} size={44} showPresence />
      </Link>
      <Link to={`/u/${user.username}`} className="min-w-0 flex-1">
        <p className="font-medium">{user.displayName}</p>
        <p className="truncate text-[13px] text-ink-faint">
          <span className={state === 'online' ? 'text-online' : ''}>
            {presenceText(state, user.lastSeenAt)}
          </span>
          {user.bio && <span className="mx-1.5">·</span>}
          {user.bio}
        </p>
      </Link>
      <button
        onClick={() => open.mutate()}
        aria-label={`傳訊息給 ${user.displayName}`}
        className="press grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
      >
        <MessageCircle size={18} />
      </button>
    </div>
  )
}

function FindPeople() {
  const [q, setQ] = useState('')
  const qc = useQueryClient()

  const { data, isFetching } = useQuery({
    queryKey: ['users', 'search', q],
    queryFn: () => friends.search(q),
    enabled: q.trim().length > 0,
  })

  const invite = useMutation({
    mutationFn: friends.invite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users', 'search'] }),
  })

  return (
    <div>
      <div className="px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5 rounded-full border border-rule bg-paper-raised px-4 py-2.5 focus-within:border-accent">
          <SearchIcon size={17} className="shrink-0 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋名稱或帳號"
            autoComplete="off"
            className="min-w-0 flex-1 border-none bg-transparent p-0 text-[15px] outline-none placeholder:text-ink-faint"
          />
        </div>
      </div>

      {!q && (
        <EmptyState
          icon={<UserPlus size={30} strokeWidth={1.4} />}
          title="找找看認識的人"
          description="輸入對方的名稱或帳號。"
        />
      )}

      {q && !isFetching && data?.length === 0 && (
        <EmptyState title={`找不到「${q}」`} description="確認一下帳號有沒有打錯。" />
      )}

      {data?.map((u) => (
        <div
          key={u.id}
          className="flex items-center gap-3 border-b border-rule px-5 py-4 sm:px-8"
        >
          <Link to={`/u/${u.username}`}>
            <Avatar user={u} size={44} />
          </Link>
          <Link to={`/u/${u.username}`} className="min-w-0 flex-1">
            <p className="font-medium">{u.displayName}</p>
            <p className="truncate text-[13px] text-ink-faint">@{u.username}</p>
          </Link>

          {u.friendState === 'friends' && (
            <span className="shrink-0 text-[13px] text-ink-faint">已是好友</span>
          )}
          {u.friendState === 'outgoing' && (
            <span className="shrink-0 text-[13px] text-ink-faint">邀請已送出</span>
          )}
          {u.friendState === 'incoming' && (
            <span className="shrink-0 text-[13px] text-accent">對方邀請了你</span>
          )}
          {u.friendState === 'none' && (
            <Button
              variant="outline"
              onClick={() => invite.mutate(u.id)}
              loading={invite.isPending && invite.variables === u.id}
            >
              <UserPlus size={15} />
              加好友
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
