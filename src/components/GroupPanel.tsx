import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, LogOut, Pencil, UserMinus, UserPlus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chat, friends } from '../lib/api'
import type { Conversation } from '../types'
import { Avatar } from './Avatar'
import { Button } from './ui'

/**
 * 群組管理。
 *
 * 群主可以改名稱、邀請好友、移除成員；一般成員只看得到名單與退出。
 * 權限判斷在後端，這裡只決定顯不顯示按鈕。
 */
export function GroupPanel({
  conversation,
  meId,
  open,
  onClose,
}: {
  conversation: Conversation
  meId: string
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const isOwner = conversation.ownerId === meId

  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(conversation.name)
  const [adding, setAdding] = useState(false)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['conversation', conversation.id] })
    qc.invalidateQueries({ queryKey: ['conversations'] })
  }

  const rename = useMutation({
    mutationFn: () => chat.renameGroup(conversation.id, name),
    onSuccess: () => {
      setEditingName(false)
      refresh()
    },
  })

  const kick = useMutation({
    mutationFn: (userId: string) => chat.removeMember(conversation.id, userId),
    onSuccess: refresh,
  })

  const leave = useMutation({
    mutationFn: () => chat.leaveGroup(conversation.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      navigate('/chat')
    },
  })

  // 還沒在群裡的好友才列出來可以邀請
  const { data: myFriends } = useQuery({
    queryKey: ['friends'],
    queryFn: friends.list,
    enabled: adding,
  })
  const memberIds = new Set(conversation.members.map((m) => m.id))
  const invitable = (myFriends ?? []).filter((f) => !memberIds.has(f.id))

  const invite = useMutation({
    mutationFn: (userId: string) => chat.addMembers(conversation.id, [userId]),
    onSuccess: refresh,
  })

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
            aria-label="群組設定"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col
                       rounded-t-2xl border border-rule bg-paper-raised backdrop-blur-xl
                       sm:inset-0 sm:m-auto sm:h-fit sm:max-w-md sm:rounded-2xl"
          >
            <header className="flex items-center gap-2 border-b border-rule px-5 py-4">
              <h2 className="text-[16px]">群組設定</h2>
              <button
                onClick={onClose}
                aria-label="關閉"
                className="press ml-auto grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
              >
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* 名稱 */}
              <div className="border-b border-rule px-5 py-4">
                <p className="mb-2 text-[13px] font-medium text-ink">名稱</p>
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={80}
                      autoFocus
                      className="min-w-0 flex-1 rounded-xl border border-rule bg-paper px-3.5 py-2
                                 text-[15px] outline-none focus:border-accent"
                    />
                    <Button
                      onClick={() => rename.mutate()}
                      loading={rename.isPending}
                      disabled={!name.trim()}
                    >
                      <Check size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditingName(false)
                        setName(conversation.name)
                      }}
                    >
                      取消
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15px]">
                      {conversation.name}
                    </span>
                    {isOwner && (
                      <button
                        onClick={() => setEditingName(true)}
                        aria-label="改名稱"
                        className="press grid size-8 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 成員 */}
              <div className="px-5 py-4">
                <div className="mb-3 flex items-center">
                  <p className="text-[13px] font-medium text-ink">
                    成員 · {conversation.members.length}
                  </p>
                  {isOwner && !adding && (
                    <button
                      onClick={() => setAdding(true)}
                      className="press ml-auto flex items-center gap-1.5 rounded-full border border-rule-strong px-3 py-1.5 text-[12px] text-ink-soft transition-colors hover:border-accent hover:text-accent"
                    >
                      <UserPlus size={13} />
                      邀請
                    </button>
                  )}
                </div>

                <div className="flex flex-col">
                  {conversation.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 py-2">
                      <Avatar user={m} size={36} showPresence />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px]">
                          {m.displayName}
                        </span>
                        <span className="block truncate text-[12px] text-ink-faint">
                          @{m.username}
                          {m.id === conversation.ownerId && (
                            <span className="ml-1.5 text-accent">群主</span>
                          )}
                        </span>
                      </span>
                      {isOwner && m.id !== meId && (
                        <button
                          onClick={() => {
                            if (confirm(`把 ${m.displayName} 移出群組？`)) {
                              kick.mutate(m.id)
                            }
                          }}
                          aria-label={`移除 ${m.displayName}`}
                          className="press grid size-8 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-accent-wash hover:text-accent"
                        >
                          <UserMinus size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* 邀請好友 */}
                {adding && (
                  <div className="mt-4 rounded-xl border border-rule bg-paper-sunk p-3">
                    <div className="mb-2 flex items-center">
                      <p className="text-[13px] font-medium text-ink">邀請好友</p>
                      <button
                        onClick={() => setAdding(false)}
                        className="press ml-auto text-[12px] text-ink-faint hover:text-ink"
                      >
                        收起
                      </button>
                    </div>
                    {invitable.length === 0 ? (
                      <p className="py-3 text-center text-[13px] text-ink-faint">
                        好友都已經在群組裡了。
                      </p>
                    ) : (
                      invitable.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => invite.mutate(f.id)}
                          disabled={invite.isPending}
                          className="press flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-paper"
                        >
                          <Avatar user={f} size={32} />
                          <span className="min-w-0 flex-1 truncate text-[14px]">
                            {f.displayName}
                          </span>
                          <UserPlus size={15} className="shrink-0 text-ink-faint" />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <footer className="border-t border-rule p-4">
              <Button
                full
                variant="outline"
                loading={leave.isPending}
                onClick={() => {
                  const extra = isOwner
                    ? '\n\n你是群主，離開後群主會轉給其他成員。'
                    : ''
                  if (confirm(`退出「${conversation.name}」？${extra}`)) {
                    leave.mutate()
                  }
                }}
              >
                <LogOut size={16} />
                退出群組
              </Button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
