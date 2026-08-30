import { useNavigate } from 'react-router-dom'
import { excerptTokens, tokenize, type Token } from '../lib/markup'

/**
 * 渲染自訂語法。
 *
 *   `文字`  → 粗體
 *   #標籤   → 星藍色，可點擊；點下去跳到搜尋頁並把文字帶進搜尋框
 *
 * 不用 dangerouslySetInnerHTML —— 全部轉成 React 節點，
 * 使用者貼進來的 <script> 只會被當成純文字顯示，天然防 XSS。
 *
 * 內文頁與動態牆卡片共用下面同一支 renderTokens()，
 * 兩邊的粗體與標籤永遠長得一樣，不會日後各改各的而走鐘。
 */

function useRenderTokens() {
  const navigate = useNavigate()

  return function renderTokens(tokens: Token[], keyPrefix: string) {
    return tokens.map((t, i) => {
      const key = `${keyPrefix}-${i}`

      if (t.type === 'bold') {
        return <strong key={key}>{t.value}</strong>
      }

      if (t.type === 'tag') {
        return (
          <button
            key={key}
            type="button"
            onClick={(e) => {
              // 卡片本身是可點的（開啟文章），標籤要攔下來自己處理
              e.stopPropagation()
              navigate(`/search?q=${encodeURIComponent(t.value)}`)
            }}
            // overflow-wrap:anywhere —— 沒有空格的長標籤（多半是英文）會整塊
            // 撐出容器。中文可以任意斷行所以看不出來，英文才會炸開。
            // 這裡不能用 break-words：那個值刻意不影響 min-content 寬度，
            // 所以 inline-block 收縮時仍然以整個單字為準，等於沒效果
            className="inline [overflow-wrap:anywhere] align-baseline text-accent underline
                       decoration-accent/30 underline-offset-2 transition-colors
                       hover:decoration-accent"
          >
            #{t.value}
          </button>
        )
      }

      return <span key={key}>{t.value}</span>
    })
  }
}

export function PostBody({ source }: { source: string }) {
  const renderTokens = useRenderTokens()
  const lines = tokenize(source)

  return (
    <div className="prose-ink">
      {lines.map((tokens, li) => {
        // 空行 → 段落間距
        if (tokens.length === 0 || (tokens.length === 1 && !tokens[0].value.trim())) {
          return <div key={li} className="h-4" />
        }
        return <p key={li}>{renderTokens(tokens, String(li))}</p>
      })}
    </div>
  )
}

/**
 * 卡片上的摘要。跟 PostBody 的差別只有「截斷」與「不分段」——
 * 樣式走同一支渲染，所以列表看到的就是文章實際的樣子。
 */
export function PostExcerpt({
  source,
  max = 120,
  className = '',
}: {
  source: string
  max?: number
  className?: string
}) {
  const renderTokens = useRenderTokens()
  return <p className={className}>{renderTokens(excerptTokens(source, max), 'x')}</p>
}
