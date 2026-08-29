import { useEffect, useState } from 'react'

/**
 * 深淺色主題。
 *
 * 抽出來共用，因為星空背景與滑鼠光暈都要跟著主題換色 ——
 * 夜空模式是滿天星，晨曦模式星光淡去只剩微光。
 */

export type ThemeChoice = 'light' | 'dark' | 'system'

const KEY = 'inkstone.theme'
const listeners = new Set<() => void>()

/** 夜空是這個站的樣子，所以預設就是深色，不跟隨系統 */
function readChoice(): ThemeChoice {
  return (localStorage.getItem(KEY) as ThemeChoice) || 'dark'
}

export function resolveIsDark(choice: ThemeChoice = readChoice()): boolean {
  return choice !== 'light'
}

function apply(choice: ThemeChoice) {
  document.documentElement.setAttribute(
    'data-theme',
    choice === 'light' ? 'light' : 'dark',
  )
  localStorage.setItem(KEY, choice)
  for (const fn of listeners) fn()
}

// 開站就套用，避免第一幀閃到錯誤配色
if (typeof document !== 'undefined') apply(readChoice())

export function useTheme() {
  const [isDark, setIsDark] = useState(resolveIsDark)

  useEffect(() => {
    const sync = () => setIsDark(resolveIsDark())
    listeners.add(sync)
    return () => {
      listeners.delete(sync)
    }
  }, [])

  return {
    isDark,
    toggle: () => apply(resolveIsDark() ? 'light' : 'dark'),
  }
}
