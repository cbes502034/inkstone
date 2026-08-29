import { motion } from 'motion/react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Tooltip } from './Tooltip'

/* ------------------------------------------------------------------ 按鈕 */

type Variant = 'accent' | 'outline' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  full?: boolean
}

const VARIANTS: Record<Variant, string> = {
  accent: 'bg-accent text-white hover:bg-accent-hover disabled:bg-ink-faint',
  outline:
    'border border-rule-strong text-ink hover:bg-paper-sunk disabled:text-ink-faint',
  ghost: 'text-ink-soft hover:bg-paper-sunk hover:text-ink',
}

export function Button({
  variant = 'accent',
  loading,
  full,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`press inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5
                  text-sm font-medium transition-colors disabled:cursor-not-allowed
                  ${VARIANTS[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {loading && (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ 輸入 */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
}

export function Field({ label, hint, error, id, className = '', ...rest }: FieldProps) {
  const inputId = id ?? `f_${label}`
  return (
    <div className="block">
      {/* 說明收進標籤旁的提示氣泡，版面上只留欄位本身；錯誤訊息一定要看得到，維持在下方 */}
      <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink-soft">
        <label htmlFor={inputId}>{label}</label>
        {hint && <Tooltip text={hint} />}
      </span>
      <input
        id={inputId}
        {...rest}
        className={`w-full rounded-xl border bg-surface-solid px-3.5 py-2.5 text-[15px]
                    outline-none transition-colors placeholder:text-ink-faint
                    focus:border-accent
                    ${error ? 'border-accent' : 'border-rule'} ${className}`}
      />
      {error && <span className="mt-1.5 block text-xs text-accent">{error}</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ 骨架 */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

/** 貼文卡片的骨架 —— 形狀貼近實際內容，比轉圈圈的等待感低 */
export function PostSkeleton() {
  return (
    <div className="panel px-5 py-6 sm:px-7 sm:py-7">
      <div className="mb-4 flex items-center gap-2.5">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="mb-3 h-6 w-4/5" />
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}

/* ------------------------------------------------------------ 空狀態 */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center px-8 py-20 text-center"
    >
      {icon && <div className="mb-5 text-ink-faint">{icon}</div>}
      <h3 className="mb-2 text-lg text-ink">{title}</h3>
      <p className="max-w-xs text-sm leading-relaxed text-ink-soft">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  )
}

/* ------------------------------------------------------------ 頁面標頭 */

export function PageTitle({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <header className="flex items-end justify-between gap-4 border-b border-rule px-5 py-6 sm:px-8">
      <div>
        <h1 className="text-2xl tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

/* ------------------------------------------------------------ 淡入包裝 */

export function FadeIn({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
