import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Camera, Check, MailCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Wordmark } from '../components/Logo'
import { Button, Field } from '../components/ui'
import { auth } from '../lib/api'
import { letterAvatar } from '../lib/avatar'
import { ImageError, prepareAvatar } from '../lib/image'
import { useAuth } from '../store/auth'

/* ------------------------------------------------------------------ 外框 */

function Frame({
  title,
  lede,
  children,
  footer,
}: {
  title: string
  lede: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="reading-surface mx-auto w-full max-w-sm rounded-2xl border border-rule
                   px-6 py-9 shadow-2xl shadow-black/40 sm:px-8"
      >
        <div className="mb-9">
          <Wordmark size={40} />
          <h1 className="mt-7 text-[27px] leading-tight tracking-tight">{title}</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{lede}</p>
        </div>

        {children}

        {footer && <p className="mt-7 text-center text-sm text-ink-soft">{footer}</p>}
      </motion.div>
    </div>
  )
}

/* --------------------------------------------------- 第一步：帳號與信箱 */

export function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)

  const submit = useMutation({
    mutationFn: () => auth.registerStart({ username, email }),
    onSuccess: (res) => {
      setSent(true)
      // 本機開發沒接 SMTP 時後端會回連結，直接點就好
      setDevLink(res.devLink)
    },
  })

  const ready = username.trim().length >= 3 && email.includes('@')

  if (sent) {
    return (
      <Frame
        title="信寄出去了"
        lede={`我們寄了一封信到 ${email}。點開裡面的連結，設定密碼就完成註冊。`}
        footer={
          <Link to="/login" className="text-accent hover:underline">
            回到登入
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <MailCheck size={44} strokeWidth={1.3} className="text-accent" />
          <p className="text-[13px] leading-relaxed text-ink-faint">
            沒收到的話看一下垃圾信匣。連結 30 分鐘內有效。
          </p>

          {devLink && (
            <a
              href={devLink}
              className="w-full rounded-xl border border-dashed border-rule-strong
                         px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-soft
                         transition-colors hover:border-accent hover:text-accent"
            >
              本機開發：尚未設定寄信服務，點這裡直接繼續
            </a>
          )}
        </div>
      </Frame>
    )
  }

  return (
    <Frame
      title="開一個地方寫字"
      lede="先給我們帳號和信箱，收到信之後再設定密碼。"
      footer={
        <>
          已經有帳號了？
          <Link to="/login" className="ml-1 text-accent hover:underline">
            登入
          </Link>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit.mutate()
        }}
        className="flex flex-col gap-4"
      >
        <Field
          label="帳號"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          hint="英數字和底線，3 個字以上，設定後不能更改"
          placeholder="guanwen"
          autoComplete="username"
          autoFocus
        />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint="我們會寄一封驗證信到這個信箱"
          autoComplete="email"
          placeholder="you@example.com"
        />

        {submit.isError && (
          <p className="text-[13px] text-accent">{(submit.error as Error).message}</p>
        )}

        <Button full type="submit" disabled={!ready} loading={submit.isPending} className="mt-1">
          寄出驗證信
        </Button>
      </form>
    </Frame>
  )
}

/* --------------------------------------------------- 第二步：設定密碼 */

export function RegisterVerify() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const signIn = useAuth((s) => s.signIn)
  const fileRef = useRef<HTMLInputElement>(null)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [imgError, setImgError] = useState('')

  // 先問後端這張票有沒有效，無效就不顯示表單，免得填完才被拒
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['register-check', token],
    queryFn: () => auth.registerCheck(token),
    enabled: token.length > 0,
    retry: false,
  })

  const submit = useMutation({
    mutationFn: () =>
      auth.registerComplete({
        token,
        password,
        confirmPassword: confirm,
        avatarDataUrl: avatar,
      }),
    onSuccess: (session) => {
      signIn(session)
      navigate('/')
    },
  })

  const pick = async (file?: File) => {
    if (!file) return
    setImgError('')
    try {
      setAvatar(await prepareAvatar(file))
    } catch (e) {
      setImgError(e instanceof ImageError ? e.message : '圖片處理失敗')
    }
  }

  if (!token || isError) {
    return (
      <Frame
        title="連結無法使用"
        lede={
          (error as Error | undefined)?.message ??
          '這條連結可能已經過期、用過了，或是網址不完整。'
        }
        footer={
          <Link to="/register" className="text-accent hover:underline">
            重新註冊
          </Link>
        }
      >
        <Link to="/register">
          <Button full variant="outline">
            <ArrowLeft size={16} />
            回到註冊
          </Button>
        </Link>
      </Frame>
    )
  }

  if (isLoading || !data) {
    return (
      <Frame title="確認中…" lede="正在驗證你的連結。">
        <div className="h-10" />
      </Frame>
    )
  }

  const mismatch = confirm.length > 0 && password !== confirm
  const ready = password.length >= 8 && password === confirm

  return (
    <Frame
      title="設定密碼"
      lede={`信箱已驗證。幫帳號 ${data.username} 設一組密碼就完成了。`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit.mutate()
        }}
        className="flex flex-col gap-4"
      >
        {/* 大頭照順便設定，之後在個人資料也能改 */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="press group relative shrink-0 rounded-full"
          >
            <img
              src={avatar ?? letterAvatar(data.username, data.username)}
              alt=""
              className="size-16 rounded-full object-cover ring-1 ring-rule"
            />
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Camera size={18} />
            </span>
          </button>
          <p className="text-[13px] font-medium text-ink">大頭照</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </div>
        {imgError && <p className="-mt-2 text-[13px] text-accent">{imgError}</p>}

        <Field
          label="密碼"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="至少 8 個字"
          autoComplete="new-password"
          placeholder="••••••••"
          autoFocus
        />
        <Field
          label="再輸入一次"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? '兩次輸入的密碼不一致' : undefined}
          autoComplete="new-password"
          placeholder="••••••••"
        />

        {submit.isError && (
          <p className="text-[13px] text-accent">{(submit.error as Error).message}</p>
        )}

        <Button full type="submit" disabled={!ready} loading={submit.isPending} className="mt-1">
          <Check size={16} />
          完成註冊
        </Button>

        <p className="text-center text-[12px] leading-relaxed text-ink-faint">
          完成註冊即表示你同意
          <Link to="/terms" className="mx-1 underline hover:text-ink-soft">
            服務條款
          </Link>
          與
          <Link to="/privacy" className="mx-1 underline hover:text-ink-soft">
            隱私權政策
          </Link>
        </p>
      </form>
    </Frame>
  )
}
