/*
 * 硯 —— 推播用的 service worker。
 *
 * 它存在的唯一理由是：瀏覽器整個關掉時，網頁的 JavaScript 早就不在了，
 * 但 service worker 仍然能被作業系統喚醒來顯示通知。
 *
 * 刻意不做離線快取。快取一份舊的前端會帶來「使用者看到的是上一版」
 * 這類極難重現的問題，而這個應用本來就需要連線才有內容。
 */

self.addEventListener('install', () => {
  // 不等舊的 service worker 結束，直接接手。
  // 否則使用者要把所有分頁關光，新版才會生效
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // 推播內容壞掉也要顯示點什麼，不然使用者只會看到瀏覽器的預設訊息
  }

  const actor = data.actor?.displayName ?? '有人'
  const title =
    {
      like: `${actor} 喜歡你的文章`,
      comment: `${actor} 留言了`,
      friend_request: `${actor} 想加你好友`,
      friend_accept: `${actor} 接受了你的好友邀請`,
      message: `${actor} 傳了訊息`,
    }[data.kind] ?? '硯 有新通知'

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.preview || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // 同一則通知重複送達時覆蓋而不是疊加
      tag: data.id ?? 'inkstone',
      data: { href: data.href ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const href = event.notification.data?.href ?? '/'

  // 已經開著的分頁就切過去，不要每次都開新視窗 ——
  // 點了五則通知結果開出五個分頁，是很糟的體驗
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(href)
          return client.focus()
        }
      }
      return self.clients.openWindow(href)
    }),
  )
})
