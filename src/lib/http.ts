/**
 * HTTP 客戶端。
 *
 * 所有對後端的請求都經過這裡，集中處理三件事：
 *   1. 帶上 access token
 *   2. 遇到 401 自動用 refresh token 換一張新的再重試一次
 *   3. 把後端統一的錯誤格式轉成 ApiError
 *
 * 自動續期只重試一次 —— 換完還是 401 就是真的失效了，
 * 再重試只會變成無窮迴圈。
 */

import { useAuth } from '../store/auth'

const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'
).replace(/\/$/, '')

export class ApiError extends Error {
  // 不用參數屬性語法 —— 專案開了 erasableSyntaxOnly，
  // 那個語法需要編譯期產生程式碼，不是單純抹掉型別就能執行
  status: number
  code: string
  details: unknown[]

  constructor(status: number, message: string, code = '', details: unknown[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  /** 內部用：標記這是重試，避免無限續期 */
  _retried?: boolean
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(BASE_URL + path, window.location.origin)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

async function parseError(res: Response): Promise<ApiError> {
  let message = '發生未知的錯誤'
  let code = ''
  let details: unknown[] = []
  try {
    const data = await res.json()
    if (data?.error) {
      message = data.error.message ?? message
      code = data.error.code ?? ''
      details = data.error.details ?? []
    }
  } catch {
    // 後端掛掉時回的可能不是 JSON，維持預設訊息
  }
  return new ApiError(res.status, message, code, details)
}

/** 同時有多個請求撞到 401 時，共用同一次續期，不要各自打一遍 */
let refreshing: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
  const { refreshToken, signOut, setTokens } = useAuth.getState()
  if (!refreshToken) return false

  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(buildUrl('/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!res.ok) {
          signOut()
          return false
        }
        const data = await res.json()
        setTokens(data.accessToken, data.refreshToken)
        return true
      } catch {
        return false
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, _retried } = options
  const { accessToken } = useAuth.getState()

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 401 && !_retried && useAuth.getState().refreshToken) {
    if (await refreshTokens()) {
      return request<T>(path, { ...options, _retried: true })
    }
  }

  if (!res.ok) throw await parseError(res)

  // 204 沒有內容，硬解析 JSON 會炸掉
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const http = {
  get: <T>(path: string, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'POST', body, query }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'DELETE', query }),
}
