import { useNavigate } from 'react-router-dom'
import { tokenize } from '../lib/markup'

/**
 * 渲染自訂語法。
 *
 *   `文字`  → 粗體
 *   #標籤   → 印泥色，可點擊；點下去跳到搜尋頁並把文字帶進搜尋框
 *
 * 不用 dangerouslySetInnerHTML —— 全部轉成 React 節點，
 * 使用者貼進來的 <script> 只會被當成純文字顯示，天然防 XSS。
 */

export function PostBody({ source }: { source: string }) {
  const navigate = useNavigate()
  const lines = tokenize(source)

  return (
    <div className="prose-ink">
      {lines.map((tokens, li) => {
        // 空行 → 段落間距
        if (tokens.length === 0 || (tokens.length === 1 && !tokens[0].value.trim())) {
          return <div key={li} className="h-4" />
        }
        return (
          <p key={li}>
            {tokens.map((t, ti) => {
              if (t.type === 'bold') {
                return <strong key={ti}>{t.value}</strong>
              }
              if (t.type === 'tag') {
                return (
                  <button
                    key={ti}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/search?q=${encodeURIComponent(t.value)}`)
                    }}
                    className="text-accent underline decoration-accent/30 underline-offset-2
                               transition-colors hover:decoration-accent"
                  >
                    #{t.value}
                  </button>
                )
              }
              return <span key={ti}>{t.value}</span>
            })}
          </p>
        )
      })}
    </div>
  )
}
