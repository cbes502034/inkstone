import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Chat } from './pages/Chat'
import { ChatRoom } from './pages/ChatRoom'
import { Feed } from './pages/Feed'
import { Friends } from './pages/Friends'
import { Login } from './pages/Login'
import { Register, RegisterVerify } from './pages/Register'
import { Privacy, Terms } from './pages/Legal'
import { ForgotPassword, ResetPassword } from './pages/ResetPassword'
import { Notifications } from './pages/Notifications'
import { PostDetail } from './pages/PostDetail'
import { Profile } from './pages/Profile'
import { Search } from './pages/Search'
import { UserProfile } from './pages/UserProfile'
import { Write } from './pages/Write'
import { useAuth } from './store/auth'

/** 未登入一律導到登入頁，並記住原本想去的位置 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthed = useAuth((s) => s.isAuthed)
  const location = useLocation()
  if (!isAuthed) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

export default function App() {
  const isAuthed = useAuth((s) => s.isAuthed)

  return (
    <Routes>
      <Route path="/login" element={isAuthed ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/register"
        element={isAuthed ? <Navigate to="/" replace /> : <Register />}
      />
      {/* 信件裡的連結導到這裡。已登入也要能開 —— 使用者可能在別的裝置點信 */}
      <Route path="/register/verify" element={<RegisterVerify />} />

      {/* 忘記密碼。已登入也能開 —— 使用者可能在別的裝置點信 */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* 法律頁面不需要登入就能看 —— 註冊前本來就該先讀得到 */}
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Feed />} />
        <Route path="/search" element={<Search />} />
        <Route path="/write" element={<Write />} />
        <Route path="/post/:id" element={<PostDetail />} />
        <Route path="/u/:username" element={<UserProfile />} />
        <Route path="/me" element={<Profile />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/:id" element={<ChatRoom />} />
        <Route path="/notifications" element={<Notifications />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
