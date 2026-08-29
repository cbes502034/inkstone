import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Plus, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar, AvatarStack } from '../components/Avatar'
import { Button, EmptyState, PageTitle, Skeleton } from '../components/ui'
import { chat, friends } from '../lib/api'
import { relativeTime } from '../lib/time'
import { useAuth } from '../store/auth'

export function Chat() {
  const [creating, setCreating] = useState(false)
  const { user } = useAuth()

  const { data: convs, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: chat.conversations,
  })

  return (
    <div className="scrim min-h-dvh">
      <PageTitle
        title="訊息"
        right={
          <button
            onClick={() => setCreating(true)}
            className="press flex items-center gap-1.5 rounded-full border border-rule-strong px-3.5 py-2 text-[13px] transition-colors hover:border-accent hover:text-accent"
          >
            <Plus size={15} />
            建群組
          </button>
        }
      />

      {isLoading && (
        <div className="flex flex-col gap-5 p-5 sm:p-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1">
                <Skeleton className="mb-2 h-4 w-28" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
          ))}
        </div>
      )}

      {convs?.length === 0 && (
        <EmptyState
          icon={<MessageCircle size={30} strokeWidth={1.4} />}
          title="還沒有對話"
          description="找個朋友聊聊吧。"
          action={
            <Link to="/friends">
              <Button>看好友</Button>
            </Link>
          }
        />
      )}

      {convs?.map((c) => {
        // 要濾掉的是「我自己」。
        // 原本寫成濾掉最後發言者，當對方是最後發言的人時，留下的就變成我，
        // 一對一對話就會顯示自己的頭像。
        const others = c.members.filter((m) => m.id !== user?.id)
        return (
          <Link
            key={c.id}
            to={`/chat/${c.id}`}
            className="flex items-center gap-3 border-b border-rule px-5 py-4 transition-colors hover:bg-paper-raised sm:px-8"
          >
            {c.kind === 'group' ? (
              <AvatarStack users={c.members} size={48} />
            ) : (
              <Avatar user={others[0] ?? c.members[0]} size={48} showPresence />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="truncate font-medium">{c.name}</p>
                {c.kind === 'group' && (
                  <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-ink-faint">
                    <Users size={11} />
                    {c.members.length}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-[12px] text-ink-faint">
                  {c.lastMessage ? relativeTime(c.lastMessage.createdAt) : ''}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <p
                  className={`min-w-0 flex-1 truncate text-[13px] ${
                    c.unreadCount > 0 ? 'font-medium text-ink' : 'text-ink-faint'
                  }`}
                >
                  {c.lastMessage
                    ? `${c.kind === 'group' && !c.lastMessage.isMine ? c.lastMessage.sender.displayName + '：' : ''}${c.lastMessage.body}`
                    : '還沒有訊息'}
                </p>
                {c.unreadCount > 0 && (
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-medium text-white">
                    {c.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </Link>
        )
      })}

      {creating && <NewGroup onClose={() => setCreating(false)} />}
    </div>
  )
}

/* ------------------------------------------------------------ 建立群組 */

function NewGroup({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()

  const { data: list } = useQuery({ queryKey: ['friends'], queryFn: friends.list })

  const create = useMutation({
    mutationFn: () => chat.createGroup(name, picked),
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      navigate(`/chat/${conv.id}`)
    },
  })

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 backdrop-blur-[2px] sm:items-center">
      <div className="flex max-h-[85dvh] w-full flex-col rounded-t-2xl border border-rule bg-paper-raised sm:max-w-md sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-rule px-5 py-4">
          <h2 className="text-[17px]">建立群組</h2>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="press grid size-9 place-items-center rounded-full text-ink-soft hover:bg-paper-sunk"
          >
            <X size={18} />
          </button>
        </header>

        <div className="border-b border-rule px-5 py-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="群組名稱"
            className="w-full rounded-xl border border-rule bg-paper px-3.5 py-2.5 text-[15px] outline-none focus:border-accent"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {list?.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-ink-faint">
              還沒有好友可以邀請。
            </p>
          )}
          {list?.map((u) => {
            const on = picked.includes(u.id)
            return (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-paper-sunk"
              >
                <Avatar user={u} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{u.displayName}</span>
                  <span className="block truncate text-[12px] text-ink-faint">
                    @{u.username}
                  </span>
                </span>
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-full border transition-colors
                    ${on ? 'border-accent bg-accent text-white' : 'border-rule-strong'}`}
                >
                  {on && <span className="size-2 rounded-full bg-white" />}
                </span>
              </button>
            )
          })}
        </div>

        <footer className="border-t border-rule p-4">
          <Button
            full
            disabled={!name.trim() || picked.length === 0}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            建立（{picked.length + (user ? 1 : 0)} 人）
          </Button>
        </footer>
      </div>
    </div>
  )
}
