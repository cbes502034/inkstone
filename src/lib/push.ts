/**
 * Web Push —— 瀏覽器整個關掉時也收得到通知。
 *
 * 跟 notify.ts 的 Notification API 是兩件事：
 *   Notification API 需要分頁還開著（即使在背景），瀏覽器一關就失效。
 *   Web Push 由作業系統負責喚醒 service worker，不需要任何分頁存在。
 *
 * 兩者共用同一個權限，所以使用者只會被問一次。
 * 後端也不會兩條都送 —— 人在線上就走 WebSocket，不在才推播。
 */

import { push } from './api'

/** 這個瀏覽器支不支援。iOS 要 16.4 以上，而且必須先「加入主畫面」 */
export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

/**
 * base64url 轉成 Uint8Array。
 *
 * PushManager 只吃位元組陣列，而 VAPID 公鑰是 base64url 字串。
 * base64url 用 - 和 _ 取代 + 和 /，還可能省略結尾的 =，都要補回來。
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))

  // 明確配置一塊 ArrayBuffer 再包起來。Uint8Array.from() 回傳的是
  // Uint8Array<ArrayBufferLike>，而 applicationServerKey 要的是 BufferSource，
  // 後者不接受 SharedArrayBuffer 這種可能性
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

/** 訂閱推播。權限要先拿到，這裡不自己跳權限請求。 */
export async function subscribePush(): Promise<boolean> {
  const reg = await registration()
  if (!reg) return false

  try {
    // 公鑰跟後端拿，不寫死在前端 —— 金鑰只有一個來源，
    // 後端換了金鑰前端不必重新建置
    const { publicKey } = await push.key()

    // 已經訂閱過就沿用。重複呼叫 subscribe 在某些瀏覽器會丟例外
    const existing = await reg.pushManager.getSubscription()
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        // 規格要求必須是 true —— 不允許「靜默推播」，
        // 每一次推播都必須讓使用者看得到
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }))

    const json = sub.toJSON()
    if (!json.keys?.p256dh || !json.keys?.auth) return false

    await push.subscribe({
      endpoint: sub.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    })
    return true
  } catch {
    // 推播是加分項，訂閱失敗不該影響任何既有功能
    return false
  }
}

/** 取消訂閱。瀏覽器端與後端都要清掉，只清一邊會留下送不到的殭屍訂閱。 */
export async function unsubscribePush(): Promise<void> {
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return

    const json = sub.toJSON()
    await push
      .unsubscribe({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      })
      .catch(() => {})
    await sub.unsubscribe()
  } catch {
    // 忽略：使用者可能已經在瀏覽器設定裡撤銷了權限
  }
}
