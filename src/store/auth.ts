import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthSession, UserPrivate } from '../types'

/**
 * 登入狀態。
 *
 * JWT 存放策略：正式環境 refresh token 應該放在 httpOnly cookie（前端讀不到，
 * 防 XSS 竊取），access token 只留在記憶體。這裡 mock 階段先簡化存 localStorage，
 * 接後端時要一併改掉 —— 已列入後端待辦。
 */

interface AuthState {
  accessToken: string | null
  user: UserPrivate | null
  isAuthed: boolean
  signIn: (session: AuthSession) => void
  signOut: () => void
  patchUser: (patch: Partial<UserPrivate>) => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      isAuthed: false,

      signIn: (session) =>
        set({
          accessToken: session.accessToken,
          user: session.user,
          isAuthed: true,
        }),

      signOut: () => set({ accessToken: null, user: null, isAuthed: false }),

      patchUser: (patch) =>
        set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
    }),
    { name: 'inkstone.auth' },
  ),
)
