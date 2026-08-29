import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthSession, UserPrivate } from '../types'

/**
 * 登入狀態。
 *
 * 目前 token 存 localStorage。這是已知的取捨 ——
 * 正式上線前 refresh token 應該改放 httpOnly cookie（前端讀不到，防 XSS 竊取），
 * access token 只留在記憶體。改動只影響這個檔案與 http.ts，頁面不受影響。
 */

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: UserPrivate | null
  isAuthed: boolean

  signIn: (session: AuthSession) => void
  signOut: () => void
  setTokens: (accessToken: string, refreshToken: string) => void
  patchUser: (patch: Partial<UserPrivate>) => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthed: false,

      signIn: (session) =>
        set({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          user: session.user,
          isAuthed: true,
        }),

      signOut: () =>
        set({ accessToken: null, refreshToken: null, user: null, isAuthed: false }),

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

      patchUser: (patch) =>
        set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
    }),
    { name: 'inkstone.auth' },
  ),
)
