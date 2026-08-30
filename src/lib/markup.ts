/**
 * Friends World — 自訂文章語法
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

/**
 * 產生列表用的摘要 —— 保留語法。
 *
 * 跟 excerpt() 的差別是回傳 token 而不是字串。
 * excerpt() 會把符號剝光，那是給搜尋索引與 SEO description 用的；
 * 動態牆的卡片要的是「跟寫出來一樣的樣子」，粗體要粗、標籤要是標籤，
 * 用純文字版本的話使用者會覺得排版在列表裡被吃掉了。
 */
export function excerptTokens(source: string, max = 120): Token[][] {
  const out: Token[][] = []
  let used = 0

  for (const line of tokenize(source)) {
    // 空行只是段落間隔。摘要最多三行，再插一個空行進去等於少掉三分之一，
    // 所以段落之間只換行、不留空行
    if (line.length === 0 || (line.length === 1 && !line[0].value.trim())) continue

    const kept: Token[] = []
    for (const token of line) {
      // 壓掉行內的連續空白，但不動換行 —— 換行由「分行」本身保留
      const value = token.type === 'text' ? token.value.replace(/[^\S\n]+/g, ' ') : token.value
      if (!value) continue
      if (kept.length === 0 && !value.trim()) continue // 每行開頭不留空白

      const room = max - used
      if (room <= 0) {
        if (kept.length) out.push(kept)
        return finish(out, true)
      }

      if (value.length <= room) {
        kept.push({ ...token, value })
        used += value.length
        continue
      }

      // 放不下了。標籤不切一半 —— 半個標籤看起來像壞掉，不像被截斷
      if (token.type !== 'tag') kept.push({ ...token, value: value.slice(0, room) })
      if (kept.length) out.push(kept)
      return finish(out, true)
    }

    if (kept.length) out.push(kept)
  }

  return finish(out, false)
}

/** 收尾：去掉結尾空白，被截斷的話補上刪節號（刪節號本身不套用任何樣式） */
function finish(lines: Token[][], truncated: boolean): Token[][] {
  const out = lines.map((l) => [...l])
  const last = out[out.length - 1]
  if (last) {
    const tail = last[last.length - 1]
    if (tail && tail.type === 'text') {
      const trimmed = tail.value.trimEnd()
      if (trimmed) last[last.length - 1] = { ...tail, value: trimmed }
      else last.pop()
    }
    if (truncated) last.push({ type: 'text', value: '…' })
    if (last.length === 0) out.pop()
  }
  return out
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
