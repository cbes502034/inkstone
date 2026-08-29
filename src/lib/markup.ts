/**
 * 硯 — 自訂文章語法
 *
 *   `整段文字`   → 粗體
 *   #標籤        → 可點擊的搜尋標籤（印泥色），點擊跳轉搜尋頁並帶入文字
 *
 * 刻意不沿用標準 Markdown：在 Markdown 裡反引號是行內程式碼、井字號是標題，
 * 語意與這裡完全相反，所以套用現成 parser 會出錯，必須自己斷詞。
 *
 * 這份 tokenizer 前後端共用一套規則 —— 後端存檔時用 extractTags() 取出標籤入庫，
 * 前端用 tokenize() 渲染，兩邊結果保證一致。
 */

export type Token =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'tag'; value: string } // value 不含 #

/** 標籤允許的字元：各國文字、數字、底線（中文、日文、英文皆可） */
const TAG_CHAR = /[\p{L}\p{N}_]/u

/**
 * 將單行原始碼切成 token。
 * 未配對的反引號、單獨的 # 都會原樣輸出，不會吃掉使用者的字。
 */
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = []
  let buffer = ''

  const flush = () => {
    if (buffer) {
      tokens.push({ type: 'text', value: buffer })
      buffer = ''
    }
  }

  let i = 0
  while (i < line.length) {
    const char = line[i]

    // ---- 反引號：往後找配對 ----
    if (char === '`') {
      const close = line.indexOf('`', i + 1)
      if (close > i + 1) {
        flush()
        tokens.push({ type: 'bold', value: line.slice(i + 1, close) })
        i = close + 1
        continue
      }
      // 沒有配對（或是空的 ``）→ 當普通字元
      buffer += char
      i += 1
      continue
    }

    // ---- 井字號：往後吃到非標籤字元為止 ----
    if (char === '#') {
      let j = i + 1
      while (j < line.length && TAG_CHAR.test(line[j])) j += 1
      if (j > i + 1) {
        flush()
        tokens.push({ type: 'tag', value: line.slice(i + 1, j) })
        i = j
        continue
      }
      // 單獨一個 # → 當普通字元
      buffer += char
      i += 1
      continue
    }

    buffer += char
    i += 1
  }

  flush()
  return tokens
}

/** 依換行切段，每段各自斷詞。空行用來分段。 */
export function tokenize(source: string): Token[][] {
  return source.split('\n').map(tokenizeLine)
}

/** 取出文章中所有標籤，去重且保留出現順序 —— 後端存檔時同樣呼叫這支 */
export function extractTags(source: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of tokenize(source)) {
    for (const token of line) {
      if (token.type === 'tag' && !seen.has(token.value)) {
        seen.add(token.value)
        out.push(token.value)
      }
    }
  }
  return out
}

/** 去除所有語法符號，取純文字 —— 用於摘要、搜尋索引、SEO description */
export function toPlainText(source: string): string {
  return tokenize(source)
    .map((line) => line.map((t) => t.value).join(''))
    .join('\n')
    .trim()
}

/** 產生列表用的摘要 */
export function excerpt(source: string, max = 90): string {
  const plain = toPlainText(source).replace(/\s+/g, ' ')
  return plain.length > max ? plain.slice(0, max).trimEnd() + '…' : plain
}

/** 粗估閱讀時間（中文以字計，約每分鐘 350 字） */
export function readingMinutes(source: string): number {
  return Math.max(1, Math.round(toPlainText(source).length / 350))
}
