import { useMutation } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Wordmark } from '../components/Logo'
import { Button, Field } from '../components/ui'
import { auth } from '../lib/api'
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
        />
        <Field
          label="密碼"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {submit.isError && (
          <p className="text-[13px] text-accent">
            {(submit.error as Error).message || '登入失敗，請再試一次'}
          </p>
        )}

        <Button full type="submit" loading={submit.isPending} className="mt-1">
          登入
        </Button>

        <Link
          to="/forgot-password"
          className="text-center text-[13px] text-ink-soft transition-colors hover:text-accent"
        >
          忘記密碼了
        </Link>
      </form>
    </AuthFrame>
  )
}
