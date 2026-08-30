import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Wordmark } from './Logo'
import { Button } from './ui'

/**
 * 錯誤邊界。
 *
 * React 的預設行為是：任何元件在渲染時丟出例外，整棵樹就被卸載 ——
 * 使用者看到的是全白的畫面，沒有任何訊息，也不知道能做什麼。
 *
 * 這裡接住它，至少讓人知道發生了什麼、還能怎麼離開這個狀態。
 *
 * 必須是 class 元件 —— componentDidCatch 沒有對應的 hook。
 */

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 目前只記到主控台。之後接了錯誤追蹤服務，這裡是送出的地方。
    console.error('未攔截的元件錯誤', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
        <div className="panel w-full max-w-sm px-6 py-9 text-center sm:px-8">
          <div className="flex justify-center">
            <Wordmark size={36} />
          </div>

          <h1 className="mt-7 text-[22px] leading-snug tracking-tight">
            這個畫面出了點問題
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
            不是你的操作造成的。重新整理通常就能繼續，
            如果一直出現，麻煩讓我們知道。
          </p>

          <div className="mt-7 flex flex-col gap-2">
            <Button full onClick={() => window.location.reload()}>
              重新整理
            </Button>
            <Button
              full
              variant="ghost"
              onClick={() => {
                window.location.href = '/'
              }}
            >
              回到動態牆
            </Button>
          </div>

          {/* 開發時把訊息露出來，正式環境不顯示 ——
              技術細節對使用者沒有幫助，還可能洩漏內部結構 */}
          {import.meta.env.DEV && (
            <pre className="mt-6 overflow-x-auto rounded-lg bg-paper-sunk p-3 text-left text-[11px] leading-relaxed text-ink-faint">
              {error.message}
            </pre>
          )}
        </div>
      </div>
    )
  }
}
