import { useEffect } from 'react'

/**
 * 分頁標題顯示未讀數。
 *
 * 使用者切到別的分頁時，提示聲是唯一的線索，但聲音一過就沒了。
 * 標題上的數字會一直留著，回來時一眼就知道有沒有東西。
 */
const BASE_TITLE = 'Friends World'

export function useUnreadTitle(count: number): void {
  useEffect(() => {
    document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${BASE_TITLE}` : BASE_TITLE
    return () => {
      document.title = BASE_TITLE
    }
  }, [count])
}
