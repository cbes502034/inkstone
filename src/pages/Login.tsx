import { useMutation } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Wordmark } from '../components/Logo'
import { Button, Field } from '../components/ui'
import { auth } from '../lib/api'
import { letterAvatar } from '../lib/avatar'
import { ImageError, prepareAvatar } from '../lib/image'
import { useAuth } from '../store/auth'

/* ------------------------------------------------------------------ 外框 */

function AuthFrame({
  title,
  lede,
  children,
  footer,
}: {
  title: string
  lede: string
  children: React.ReactNode
  footer: React.ReactNode
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
          <p className="mt-1.5 text-[15px] text-ink-soft">{lede}</p>
        </div>

        {children}

        <p className="mt-7 text-center text-sm text-ink-soft">{footer}</p>
      </motion.div>
    </div>
  )
}

/* ---------------------------------------------------------------- 登入 */

export function Login() {
  const navigate = useNavigate()
  const signIn = useAuth((s) => s.signIn)
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')

  const submit = useMutation({
    mutationFn: () => auth.login({ account, password }),
    onSuccess: (session) => {
      signIn(session)
      navigate('/')
    },
  })

  return (
    <AuthFrame
      title="歡迎回來"
      lede="繼續寫你沒寫完的那篇。"
      footer={
        <>
          還沒有帳號？
          <Link to="/register" className="ml-1 text-accent hover:underline">
            註冊一個
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
          label="帳號或 Email"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          autoComplete="username"
          placeholder="guanwen"
        />
        <Field
          label="密碼"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="••••••••"
        />

        {submit.isError && (
          <p className="text-[13px] text-accent">
            {(submit.error as Error).message || '登入失敗，請再試一次'}
          </p>
        )}

        <Button full type="submit" loading={submit.isPending} className="mt-1">
          登入
        </Button>
      </form>
    </AuthFrame>
  )
}

/* ---------------------------------------------------------------- 註冊 */

export function Register() {
  const navigate = useNavigate()
  const signIn = useAuth((s) => s.signIn)
  const fileRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [imgError, setImgError] = useState('')

  const submit = useMutation({
    mutationFn: () =>
      auth.register({ username, displayName, email, password, avatarDataUrl: avatar }),
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

  const preview = avatar ?? letterAvatar('new', displayName || '？')
  const ready = displayName.trim() && username.trim() && email.trim() && password.length >= 8

  return (
    <AuthFrame
      title="開一個地方寫字"
      lede="不用寫得很好，寫出來就好。"
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
        {/* 大頭照 —— 註冊時就能設定，之後在個人資料頁也能改 */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="press group relative shrink-0 rounded-full"
          >
            <img
              src={preview}
              alt=""
              className="size-16 rounded-full object-cover ring-1 ring-rule"
            />
            <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Camera size={18} />
            </span>
          </button>
          <div className="text-[13px] text-ink-soft">
            <p className="font-medium text-ink">大頭照</p>
            <p className="mt-0.5 text-ink-faint">選一張，或之後再說。</p>
          </div>
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
          label="顯示名稱"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="別人會看到的名字"
        />
        <Field
          label="帳號"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          hint="英數字和底線，設定後不能更改"
          placeholder="guanwen"
          autoComplete="username"
        />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
        />
        <Field
          label="密碼"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="至少 8 個字"
          autoComplete="new-password"
          placeholder="••••••••"
        />

        {submit.isError && (
          <p className="text-[13px] text-accent">{(submit.error as Error).message}</p>
        )}

        <Button full type="submit" disabled={!ready} loading={submit.isPending} className="mt-1">
          建立帳號
        </Button>

        <p className="text-center text-[12px] leading-relaxed text-ink-faint">
          建立帳號即表示你同意
          <a href="#" className="mx-1 underline hover:text-ink-soft">服務條款</a>
          與
          <a href="#" className="mx-1 underline hover:text-ink-soft">隱私權政策</a>
        </p>
      </form>
    </AuthFrame>
  )
}
