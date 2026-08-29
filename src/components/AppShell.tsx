import { useQuery } from '@tanstack/react-query'
import {
  Bell,
  Compass,
  Feather,
  Home,
  MessageCircle,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  User as UserIcon,
  Users,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { auth, chat, notifications } from '../lib/api'
import { useHeartbeat } from '../lib/presence'
import { useTheme } from '../lib/theme'
import { useAuth } from '../store/auth'
import { Avatar } from './Avatar'
import { Logo, Wordmark } from './Logo'

/* ---------------------------------------------------------------- 導覽項目 */

type Badge = 'chat' | 'bell' | undefined

interface NavItem {
  to: string
  label: string
  icon: typeof Home
  end?: boolean
  badge?: Badge
}

const NAV: NavItem[] = [
  { to: '/', label: '動態', icon: Home, end: true },
  { to: '/search', label: '探索', icon: Compass },
  { to: '/chat', label: '訊息', icon: MessageCircle, badge: 'chat' },
  { to: '/friends', label: '好友', icon: Users },
  { to: '/me', label: '我', icon: UserIcon },
]

/** 側欄多一個通知；手機的通知在頂列，不佔底部的位置 */
const SIDEBAR_NAV: NavItem[] = [
  ...NAV,
  { to: '/notifications', label: '通知', icon: Bell, badge: 'bell' },
]

/** 手機底部只放四個，中間讓給「寫文章」；好友收進「我」的頁面裡 */
const MOBILE_NAV = NAV.filter((n) => n.to !== '/friends')

const COLLAPSE_KEY = 'inkstone.sidebar.collapsed'

export function AppShell() {
  const { user, patchUser } = useAuth()
  const { isDark, toggle } = useTheme()
  const location = useLocation()

  // 收合狀態記住，下次進來維持使用者的選擇
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === '1',
  )
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  // 本機存的登入資料可能是舊版格式或已過期，開啟時向伺服器要一次最新的
  const { data: fresh } = useQuery({ queryKey: ['me'], queryFn: auth.me })
  useEffect(() => {
    if (fresh) patchUser(fresh)
  }, [fresh, patchUser])

  // 維持自己的上線狀態
  useHeartbeat()

  const { data: convs } = useQuery({
    queryKey: ['conversations'],
    queryFn: chat.conversations,
  })
  const { data: notes } = useQuery({
    queryKey: ['notifications'],
    queryFn: notifications.list,
  })

  const unreadChat = convs?.reduce((n, c) => n + c.unreadCount, 0) ?? 0
  const unreadNotes = notes?.filter((n) => !n.read).length ?? 0

  // 聊天室內頁在手機上要全螢幕，藏起底部導覽避免擋到輸入框
  const hideMobileNav = /^\/chat\/.+/.test(location.pathname)

  return (
    /* 這層不能有底色 —— 蓋上去星空就沒了 */
    <div className="min-h-dvh">
      {/* 手機頂列是 fixed，內容要留出等高的空間才不會被蓋住 */}
      <div
        className={`mx-auto flex max-w-6xl ${hideMobileNav ? '' : 'pt-[52px] md:pt-0'}`}
      >
        {/* ---------------------------------------- 桌機側欄 */}
        <aside
          className={`reading-surface sticky top-0 hidden h-dvh shrink-0 flex-col justify-between
                      border-l border-rule py-6 transition-[width] duration-300 md:flex
                      ${collapsed ? 'w-[76px] px-3' : 'w-[240px] px-4 lg:w-[260px]'}`}
        >
          <div>
            <div
              className={`mb-8 flex items-center ${collapsed ? 'flex-col gap-3' : 'justify-between'}`}
            >
              <Link to="/" className={collapsed ? '' : 'ml-2'} aria-label="硯">
                {collapsed ? <Logo size={34} /> : <Wordmark size={34} />}
              </Link>
              <button
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? '展開側欄' : '收合側欄'}
                aria-expanded={!collapsed}
                className="press grid size-8 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-paper-sunk hover:text-ink"
              >
                {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </button>
            </div>

            <nav className="flex flex-col gap-0.5">
              {SIDEBAR_NAV.map(({ to, label, icon: Icon, end, badge }) => {
                const count = badge === 'chat' ? unreadChat : badge === 'bell' ? unreadNotes : 0
                return (
                  <NavLink key={to} to={to} end={end} title={collapsed ? label : undefined}>
                    {({ isActive }) => (
                      <span
                        className={`relative flex items-center rounded-xl py-2.5 text-[15px] transition-colors
                          ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'}
                          ${isActive ? 'font-medium text-ink' : 'text-ink-soft hover:bg-paper-sunk hover:text-ink'}`}
                      >
                        <span className="relative">
                          <Icon size={20} strokeWidth={isActive ? 2.2 : 1.7} />
                          {/* 收合時徽章縮成一個小點，貼在圖示右上 */}
                          {collapsed && count > 0 && (
                            <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-accent" />
                          )}
                        </span>
                        {!collapsed && label}
                        {!collapsed && count > 0 && (
                          <span className="ml-auto grid size-5 place-items-center rounded-full bg-accent text-[11px] font-medium text-white">
                            {count}
                          </span>
                        )}
                        {isActive && (
                          <motion.span
                            layoutId="nav-active"
                            className="absolute inset-0 -z-10 rounded-xl bg-paper-sunk"
                            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                          />
                        )}
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </nav>

            <Link
              to="/write"
              title={collapsed ? '寫文章' : undefined}
              className={`press mt-6 flex w-full items-center justify-center gap-2 rounded-full
                          bg-accent py-3 text-[15px] font-medium text-white
                          transition-colors hover:bg-accent-hover ${collapsed ? 'px-0' : 'px-5'}`}
            >
              <Feather size={17} />
              {!collapsed && '寫文章'}
            </Link>
          </div>

          {/* 側欄底部 —— 帳號 + 主題 */}
          <div className={`flex items-center gap-2 ${collapsed ? 'flex-col' : ''}`}>
            <Link
              to="/me"
              title={collapsed ? user?.displayName : undefined}
              className={`flex min-w-0 items-center rounded-xl p-2 transition-colors hover:bg-paper-sunk
                          ${collapsed ? '' : 'flex-1 gap-2.5'}`}
            >
              {user && <Avatar user={user} size={34} />}
              {!collapsed && (
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-medium">
                    {user?.displayName}
                  </span>
                  <span className="block truncate text-xs text-ink-faint">
                    @{user?.username}
                  </span>
                </span>
              )}
            </Link>
            <button
              onClick={toggle}
              aria-label={isDark ? '切換至淺色' : '切換至深色'}
              className="press grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </aside>

        {/* ----------------------------------------
            內容欄本身不上底色，夜空直接透過來；
            區塊感交給各頁自己的 panel。 */}
        <main className="min-w-0 flex-1">
          <Outlet />
          {!hideMobileNav && <div className="h-20 md:hidden" />}
        </main>
      </div>

      {/* ---------------------------------------- 手機頂列 */}
      <header
        className="fixed inset-x-0 top-0 z-30 flex items-center justify-between
                   border-b border-rule bg-paper/85 px-4 py-2.5 backdrop-blur-md md:hidden"
        style={{ display: hideMobileNav ? 'none' : undefined }}
      >
        <Link to="/">
          <Wordmark size={28} />
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={toggle}
            aria-label={isDark ? '切換至淺色' : '切換至深色'}
            className="press grid size-9 place-items-center rounded-full text-ink-soft"
          >
            {isDark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <Link
            to="/notifications"
            aria-label="通知"
            className="press relative grid size-9 place-items-center rounded-full text-ink-soft"
          >
            <Bell size={19} />
            {unreadNotes > 0 && (
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent ring-2 ring-paper" />
            )}
          </Link>
        </div>
      </header>

      {/* ---------------------------------------- 手機底部導覽 */}
      {!hideMobileNav && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-rule
                     bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        >
          {MOBILE_NAV.map(({ to, label, icon: Icon, end, badge }, i) => (
            <div key={to} className="contents">
              {/* 前兩個之後插入置中的「寫文章」 */}
              {i === 2 && (
                <Link
                  to="/write"
                  aria-label="寫文章"
                  className="press flex items-center justify-center py-2"
                >
                  <span className="grid size-11 place-items-center rounded-full bg-accent text-white shadow-sm">
                    <Feather size={19} />
                  </span>
                </Link>
              )}
              <NavLink
                to={to}
                end={end}
                className="flex flex-col items-center justify-center gap-0.5 py-2.5"
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <Icon
                        size={21}
                        strokeWidth={isActive ? 2.3 : 1.7}
                        className={isActive ? 'text-accent' : 'text-ink-faint'}
                      />
                      {badge === 'chat' && unreadChat > 0 && (
                        <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-accent ring-2 ring-paper" />
                      )}
                    </span>
                    <span
                      className={`text-[10px] ${isActive ? 'font-medium text-accent' : 'text-ink-faint'}`}
                    >
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            </div>
          ))}
        </nav>
      )}
    </div>
  )
}
