import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Check, LogOut, Mail, PencilLine, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { PostCard } from '../components/PostCard'
import { Tooltip } from '../components/Tooltip'
import { Button, EmptyState, FadeIn, PostSkeleton } from '../components/ui'
import { auth, posts } from '../lib/api'
import { ImageError, prepareAvatar } from '../lib/image'
import { absoluteDate } from '../lib/time'
import { useAuth } from '../store/auth'

export function Profile() {
  const { user, patchUser, signOut } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [imgError, setImgError] = useState('')

  const { data: myPosts, isLoading } = useQuery({
    queryKey: ['posts', 'mine', user?.id],
    queryFn: () => posts.byAuthor(user!.id),
    enabled: Boolean(user),
  })

  const saveProfile = useMutation({
    mutationFn: () => auth.updateMe({ displayName, bio }),
    onSuccess: (u) => {
      patchUser(u)
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  const saveAvatar = useMutation({
    mutationFn: (dataUrl: string) => auth.updateMe({ avatarUrl: dataUrl }),
    onSuccess: (u) => {
      patchUser(u)
      qc.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  const togglePresence = useMutation({
    mutationFn: (next: boolean) => auth.updateMe({ showPresence: next }),
    onSuccess: (u) => patchUser(u),
  })

  const pickAvatar = async (file?: File) => {
    if (!file) return
    setImgError('')
    try {
      saveAvatar.mutate(await prepareAvatar(file))
    } catch (e) {
      setImgError(e instanceof ImageError ? e.message : '圖片處理失敗，換一張試試')
    }
  }

  if (!user) return null

  return (
    <div className="scrim min-h-dvh">
      <FadeIn className="border-b border-rule px-5 py-8 sm:px-8">
        {/* 頭像 —— 點擊即可更換 */}
        <div className="flex items-start gap-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="press group relative shrink-0 rounded-full"
            aria-label="更換大頭照"
          >
            <Avatar user={user} size={78} />
            <span
              className="absolute inset-0 grid place-items-center rounded-full bg-ink/45 text-white
                         opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Camera size={20} />
            </span>
            {saveAvatar.isPending && (
              <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/45">
                <span className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => pickAvatar(e.target.files?.[0])}
          />

          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-rule bg-paper-raised px-3 py-1.5 text-xl outline-none focus:border-accent"
                style={{ fontFamily: 'var(--font-serif)' }}
              />
            ) : (
              <h1 className="text-2xl tracking-tight">{user.displayName}</h1>
            )}
            <p className="mt-0.5 text-sm text-ink-faint">@{user.username}</p>
          </div>

          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="press grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
              aria-label="編輯個人資料"
            >
              <PencilLine size={17} />
            </button>
          )}
        </div>

        {imgError && <p className="mt-3 text-[13px] text-accent">{imgError}</p>}

        {/* 簡介 */}
        <div className="mt-5">
          {editing ? (
            <>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={160}
                placeholder="介紹一下自己"
                className="w-full resize-none rounded-xl border border-rule bg-paper-raised px-3.5 py-2.5 text-[15px] outline-none focus:border-accent"
              />
              <div className="mt-3 flex items-center gap-2">
                <Button onClick={() => saveProfile.mutate()} loading={saveProfile.isPending}>
                  <Check size={16} />
                  儲存
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(false)
                    setDisplayName(user.displayName)
                    setBio(user.bio)
                  }}
                >
                  取消
                </Button>
                <span className="ml-auto text-xs text-ink-faint">{bio.length}/160</span>
              </div>
            </>
          ) : (
            <p className="text-[15px] leading-relaxed text-ink-soft">
              {user.bio || <span className="text-ink-faint">還沒有自我介紹。</span>}
            </p>
          )}
        </div>

        {/* 註冊資料 —— 只有本人看得到 */}
        {!editing && (
          <div className="mt-6 rounded-xl border border-rule bg-paper-sunk px-4 py-3.5">
            <p className="mb-2.5 flex items-center gap-1.5 text-[13px] font-medium text-ink">
              帳號資料
              <Tooltip text="這一區只有你自己看得到，其他人進到你的頁面不會看到這些欄位。" />
            </p>
            <dl className="flex flex-col gap-2 text-[13px]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <Mail size={14} className="shrink-0 text-ink-faint" />
                <dd className="min-w-0 break-all text-ink-soft">{user.email}</dd>
                {user.emailVerified ? (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-online-wash px-2 py-0.5 text-[11px] text-online">
                    已驗證
                  </span>
                ) : (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-paper-sunk px-2 py-0.5 text-[11px] text-ink-faint">
                    未驗證
                  </span>
                )}
              </div>
              <div className="text-ink-soft">
                加入於 {absoluteDate(user.createdAt)}
              </div>
            </dl>
          </div>
        )}

        {/* 上線狀態的隱私開關 —— 不是每個人都想被看見自己在線上 */}
        {!editing && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-rule px-4 py-3.5">
            <span
              className={`size-2.5 shrink-0 rounded-full ${
                user.showPresence ? 'bg-online' : 'bg-ink-faint'
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                顯示上線狀態
                <Tooltip text="關掉之後別人一律看到你是離線，也看不到你最後上線的時間。" />
              </p>
            </div>
            <button
              role="switch"
              aria-checked={user.showPresence}
              aria-label="顯示上線狀態"
              disabled={togglePresence.isPending}
              onClick={() => togglePresence.mutate(!user.showPresence)}
              className={`press relative h-6 w-11 shrink-0 rounded-full transition-colors
                ${user.showPresence ? 'bg-online' : 'bg-rule-strong'}`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all
                  ${user.showPresence ? 'left-[22px]' : 'left-0.5'}`}
              />
            </button>
          </div>
        )}

        {/* 快捷 */}
        {!editing && (
          <div className="mt-5 flex items-center gap-2">
            <Link to="/friends" className="md:hidden">
              <Button variant="outline">
                <Users size={15} />
                好友
              </Button>
            </Link>
            <Button
              variant="ghost"
              onClick={() => {
                signOut()
                navigate('/login')
              }}
              className="ml-auto"
            >
              <LogOut size={15} />
              登出
            </Button>
          </div>
        )}
      </FadeIn>

      {/* 我的文章 */}
      <h2 className="px-5 pb-1 pt-6 text-[13px] font-medium text-ink-faint sm:px-8">
        我的文章 {myPosts && `· ${myPosts.length} 篇`}
      </h2>

      <div className="flex flex-col gap-3 p-3 pt-1 sm:gap-4 sm:p-4 sm:pt-1">
        {isLoading && <PostSkeleton />}
        {myPosts?.length === 0 && (
          <EmptyState
            title="還沒有發表文章"
            description="寫下第一篇吧，不用寫得很好，寫出來就好。"
            action={
              <Link to="/write">
                <Button>開始寫</Button>
              </Link>
            }
          />
        )}
        {myPosts?.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
    </div>
  )
}
