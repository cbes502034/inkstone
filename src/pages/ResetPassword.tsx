import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, MailCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Wordmark } from '../components/Logo'
import { Button, Field } from '../components/ui'
import { auth } from '../lib/api'

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

/* ------------------------------------------------- 第一步：輸入信箱 */

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)

  const submit = useMutation({
    mutationFn: () => auth.forgotPassword(email),
    onSuccess: (res) => {
      setSent(true)
      setDevLink(res.devLink)
    },
  })

  if (sent) {
    return (
      <Frame
        title="信寄出去了"
        lede="如果這個信箱有註冊過，重設連結已經寄出。點開信裡的連結設定新密碼。"
        footer={
          <Link to="/login" className="text-accent hover:underline">
            回到登入
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <MailCheck size={44} strokeWidth={1.3} className="text-accent" />
          <p className="text-[13px] leading-relaxed text-ink-faint">
            沒收到的話看一下垃圾信匣。連結 15 分鐘內有效。
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
      title="忘記密碼了"
      lede="輸入註冊時用的信箱，我們寄一條重設連結給你。"
      footer={
        <Link to="/login" className="text-accent hover:underline">
          想起來了，回到登入
        </Link>
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
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          autoFocus
        />

        {submit.isError && (
          <p className="text-[13px] text-accent">{(submit.error as Error).message}</p>
        )}

        <Button
          full
          type="submit"
          disabled={!email.includes('@')}
          loading={submit.isPending}
          className="mt-1"
        >
          寄出重設連結
        </Button>
      </form>
    </Frame>
  )
}

/* ------------------------------------------------- 第二步：設定新密碼 */

export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reset-check', token],
    queryFn: () => auth.passwordResetCheck(token),
    enabled: token.length > 0,
    retry: false,
  })

  const submit = useMutation({
    mutationFn: () =>
      auth.resetPassword({ token, password, confirmPassword: confirm }),
    onSuccess: () => setDone(true),
  })

  if (!token || isError) {
    return (
      <Frame
        title="連結無法使用"
        lede={
          (error as Error | undefined)?.message ??
          '這條連結可能已經過期、用過了，或是網址不完整。'
        }
      >
        <Link to="/forgot-password">
          <Button full variant="outline">
            <ArrowLeft size={16} />
            重新申請
          </Button>
        </Link>
      </Frame>
    )
  }

  if (done) {
    return (
      <Frame title="密碼換好了" lede="用新密碼登入就可以了。">
        <Button full onClick={() => navigate('/login')}>
          去登入
        </Button>
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
    <Frame title="設定新密碼" lede={`幫帳號 ${data.username} 設一組新的密碼。`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit.mutate()
        }}
        className="flex flex-col gap-4"
      >
        <Field
          label="新密碼"
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
          更新密碼
        </Button>
      </form>
    </Frame>
  )
}
