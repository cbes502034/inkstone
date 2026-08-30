import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CornerDownLeft, Settings2, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar, AvatarStack } from '../components/Avatar'
import { GroupPanel } from '../components/GroupPanel'
import { Skeleton } from '../components/ui'
import { chat } from '../lib/api'
import { presenceText } from '../lib/presence'
import { sendRealtime } from '../lib/realtime'
import { useTypingIndicator, useTypingSender } from '../lib/typing'
import { clockTime, dayLabel } from '../lib/time'
import { useAuth } from '../store/auth'
import type { Message } from '../types'

export function ChatRoom() {
  const { id = '' } = useParams()
  const { user: me } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [groupOpen, setGroupOpen] = useState(false)

  const typingNames = useTypingIndicator(id)
  const notifyTyping = useTypingSender(id, sendRealtime)
  const bottom = useRef<HTMLDivElement>(null)

  const { data: conv } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => chat.conversation(id),
  })

  const { data: messages, isLoading } = useQuery({
    queryKey: ['messages', id],
    queryFn: () => chat.messages(id),
  })

  const send = useMutation({
    mutationFn: (body: string) => chat.send(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', id] })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    send.mutate(text)
  }

  // 濾掉自己，留下的才是對方
  const others = conv?.members.filter((m) => m.id !== me?.id) ?? []

  // 狀態跟著成員資料從後端來
  const peerPresence = others[0]?.presence ?? 'offline'
  const onlineInGroup = others.filter((m) => m.presence === 'online').length

  return (
    <div className="flex h-dvh flex-col">
      {/* 標頭 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-rule bg-paper px-3 py-2.5">
        <button
          onClick={() => navigate('/chat')}
          aria-label="返回"
          className="press grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
        >
          <ArrowLeft size={18} />
        </button>

        {conv &&
          (conv.kind === 'group' ? (
            <AvatarStack users={conv.members} size={36} />
          ) : (
            <Avatar user={others[0] ?? conv.members[0]} size={36} showPresence />
          ))}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{conv?.name ?? ''}</p>

          {conv?.kind === 'group' ? (
            <p className="flex items-center gap-1 text-[12px] text-ink-faint">
              <Users size={11} />
              {conv.members.length} 人
              {onlineInGroup > 0 && (
                <span className="text-online">· {onlineInGroup} 人在線</span>
              )}
              {conv.ownerId === me?.id && <span>· 你是群主</span>}
            </p>
          ) : (
            conv && (
              <p
                className={`text-[12px] ${
                  peerPresence === 'online' ? 'text-online' : 'text-ink-faint'
                }`}
              >
                {presenceText(peerPresence, others[0]?.lastSeenAt ?? null)}
              </p>
            )
          )}
        </div>

        {conv?.kind === 'group' && (
          <button
            onClick={() => setGroupOpen(true)}
            aria-label="群組設定"
            className="press grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
          >
            <Settings2 size={18} />
          </button>
        )}
      </header>

      {/* 訊息 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {isLoading && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-44 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-32 rounded-2xl" />
            <Skeleton className="h-14 w-56 rounded-2xl" />
          </div>
        )}

        <div className="flex flex-col gap-1">
          {messages?.map((m, i) => (
            <Bubble
              key={m.id}
              message={m}
              prev={messages[i - 1]}
              showSender={conv?.kind === 'group'}
            />
          ))}
        </div>
        {typingNames.length > 0 && (
          <div className="mt-3 flex items-center gap-2 px-1">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="size-1.5 rounded-full bg-ink-faint"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16 }}
                />
              ))}
            </span>
            <span className="text-[12px] text-ink-faint">
              {typingNames.length === 1
                ? `${typingNames[0]} 正在輸入`
                : `${typingNames.length} 個人正在輸入`}
            </span>
          </div>
        )}

        <div ref={bottom} />
      </div>

      {/* 輸入 */}
      <div className="shrink-0 border-t border-rule bg-paper p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2 rounded-2xl border border-rule bg-paper-raised px-3.5 py-2.5 focus-within:border-accent">
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              // 內部有節流，每個按鍵都叫沒關係
              if (e.target.value) notifyTyping()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder="輸入訊息…"
            className="max-h-28 min-h-6 flex-1 resize-none border-none bg-transparent p-0 text-[15px] outline-none placeholder:text-ink-faint"
          />
          <button
            onClick={submit}
            disabled={!draft.trim()}
            aria-label="送出"
            className="press grid size-8 shrink-0 place-items-center rounded-full bg-accent text-white transition-colors disabled:bg-rule-strong"
          >
            <CornerDownLeft size={15} />
          </button>
        </div>
      </div>

      {conv?.kind === 'group' && me && (
        <GroupPanel
          conversation={conv}
          meId={me.id}
          open={groupOpen}
          onClose={() => setGroupOpen(false)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Bubble({
  message,
  prev,
  showSender,
}: {
  message: Message
  prev?: Message
  showSender: boolean
}) {
  const newDay =
    !prev ||
    new Date(prev.createdAt).toDateString() !== new Date(message.createdAt).toDateString()

  // 同一個人連續發言就不重複顯示名字與頭像，畫面比較乾淨
  const grouped = prev?.sender.id === message.sender.id && !newDay

  return (
    <>
      {newDay && (
        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-rule" />
          <span className="text-[11px] text-ink-faint">{dayLabel(message.createdAt)}</span>
          <span className="h-px flex-1 bg-rule" />
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={`flex items-end gap-2 ${message.isMine ? 'flex-row-reverse' : ''} ${
          grouped ? 'mt-0.5' : 'mt-3'
        }`}
      >
        <span className="w-7 shrink-0">
          {!message.isMine && !grouped && <Avatar user={message.sender} size={28} />}
        </span>

        <div className={`max-w-[75%] ${message.isMine ? 'items-end' : ''}`}>
          {showSender && !message.isMine && !grouped && (
            <p className="mb-1 px-1 text-[11px] text-ink-faint">
              {message.sender.displayName}
            </p>
          )}
          <div
            className={`rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed
              ${
                message.isMine
                  ? 'rounded-br-md bg-accent text-white'
                  : 'rounded-bl-md bg-paper-sunk text-ink'
              }`}
          >
            {message.body}
          </div>
        </div>

        <span className="mb-0.5 shrink-0 text-[10px] text-ink-faint">
          {clockTime(message.createdAt)}
        </span>
      </motion.div>
    </>
  )
}
