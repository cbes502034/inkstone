/**
 * 通知提示聲。
 *
 * 用 Web Audio 合成，不放音檔 —— 不必多下載一個檔案，也沒有授權問題，
 * 而且可以調到剛好符合這個站的調性：一個柔和的兩音上行，不是刺耳的「叮」。
 *
 * 幾個克制的地方：
 *   - 使用者可以關掉，選擇記在本機
 *   - 只有在「人正在看的就是這件事本身」時才不響
 *   - 連續事件會合併，一次湧入十則通知不會變成連珠炮
 *   - AudioContext 只在使用者第一次互動後才建立，
 *     瀏覽器本來就會擋掉沒有互動就自動播放的音訊
 *
 * 關於第二點，原本的條件是「分頁有焦點就不響」，那是錯的：
 * 人正在讀動態牆時來了一則訊息，他完全不會知道 —— 而那正是最需要
 * 提示的時候。真正該安靜的情況只有一種：他看的畫面就是那則訊息本身，
 * 訊息已經出現在他眼前了，再出聲只是重複。
 */

const MUTE_KEY = 'inkstone.sound.muted'
const MIN_GAP_MS = 1500

let ctx: AudioContext | null = null
// 兩種聲音各自計時。共用一個的話，通知與訊息同時到達只會聽到一聲，
// 而那兩件事該分別讓人知道
let lastNotification = 0
let lastMessage = 0

/** 使用者此刻看的畫面是不是就是這件事本身 */
function looking(at: string): boolean {
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return false
  return window.location.pathname === at
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // 無痕模式可能寫不了，靜音設定丟失不是嚴重問題
  }
}

function getContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as never as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
    return ctx
  } catch {
    return null
  }
}

/** 單顆音：正弦波加上快速衰減的包絡，聽起來像木頭敲擊而不是電子嗶聲 */
function tone(audio: AudioContext, freq: number, startAt: number, duration: number, peak: number) {
  const osc = audio.createOscillator()
  const gain = audio.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, startAt)

  // 起音要有一點時間，直接跳到最大音量會產生喀噠聲
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(peak, startAt + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(startAt)
  osc.stop(startAt + duration + 0.05)
}

/**
 * 播放通知提示聲。
 *
 * @param force 略過所有判斷。設定裡的試聽按鈕用。
 */
export function playNotification(force = false): void {
  if (isMuted()) return

  // 只有人已經停在通知頁上時才安靜 —— 新的那則就在他眼前
  if (!force && looking('/notifications')) return

  const now = Date.now()
  if (!force && now - lastNotification < MIN_GAP_MS) return
  lastNotification = now

  const audio = getContext()
  if (!audio) return

  // 分頁切回來時 context 可能是 suspended，要先喚醒
  if (audio.state === 'suspended') void audio.resume()

  const t = audio.currentTime
  // 兩音上行（E5 → A5），比單音更容易被辨識成「有新東西」而非系統警告
  tone(audio, 659.25, t, 0.18, 0.14)
  tone(audio, 880.0, t + 0.09, 0.28, 0.11)
}

/**
 * 訊息用比較低、比較短的聲音，跟通知區分開來。
 *
 * @param conversationId 這則訊息屬於哪個對話。人正開著那個對話就不出聲。
 */
export function playMessage(conversationId?: string, force = false): void {
  if (isMuted()) return
  if (!force && conversationId && looking(`/chat/${conversationId}`)) return

  const now = Date.now()
  if (!force && now - lastMessage < MIN_GAP_MS) return
  lastMessage = now

  const audio = getContext()
  if (!audio) return
  if (audio.state === 'suspended') void audio.resume()

  const t = audio.currentTime
  tone(audio, 523.25, t, 0.14, 0.11)
}
