/**
 * 系統通知。
 *
 * 提示聲只在當下響一次，人若不在電腦前就錯過了。
 * 系統通知會留在通知中心，回來就看得到。
 *
 * 這裡用的是 Notification API，只在分頁還開著（即使在背景）時有效。
 * 完全關閉瀏覽器也能收到需要 Web Push + Service Worker + VAPID 金鑰，
 * 那是另一個層級的工程，目前不做。
 *
 * 權限請求的時機很重要：一進站就跳權限要求，多數人會直接拒絕，
 * 而拒絕之後就再也問不到了。所以只在使用者主動開啟通知聲時才問 ——
 * 那個動作代表他確實想收到提醒。
 */

export type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

export function notificationState(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as PermissionState
}

/** 回傳是否取得授權。已拒絕過就不再打擾，直接回 false。 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false

  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/**
 * 顯示一則系統通知。
 *
 * 分頁在前景且有焦點時不顯示 —— 人就在看畫面，
 * 畫面上已經有即時更新了，再彈一個視窗只是干擾。
 */
export function showNotification(
  title: string,
  body: string,
  href?: string,
): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible' && document.hasFocus()) return

  try {
    const n = new Notification(title, {
      body,
      icon: '/inkstone.svg',
      // 同一類通知用相同 tag 會互相取代，
      // 一次來十則留言不會堆出十個通知
      tag: 'inkstone',
      silent: true, // 聲音由我們自己控制，避免系統音與提示聲重疊
    })

    n.onclick = () => {
      window.focus()
      if (href) window.location.href = href
      n.close()
    }
  } catch {
    // 有些瀏覽器在特定情境會丟例外（例如 iOS Safari），忽略即可
  }
}
