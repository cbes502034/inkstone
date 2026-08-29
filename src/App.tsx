import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Chat } from './pages/Chat'
import { ChatRoom } from './pages/ChatRoom'
import { Feed } from './pages/Feed'
import { Friends } from './pages/Friends'
import { Login, Register } from './pages/Login'
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
