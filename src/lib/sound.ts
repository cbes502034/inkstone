/**
 * 通知提示聲。
 *
 * 用 Web Audio 合成，不放音檔 —— 不必多下載一個檔案，也沒有授權問題，
 * 而且可以調到剛好符合這個站的調性：一個柔和的兩音上行，不是刺耳的「叮」。
 *
 * 幾個克制的地方：
 *   - 使用者可以關掉，選擇記在本機
 *   - 分頁在前景而且視窗有焦點時不響 —— 人就在看畫面了，再出聲是打擾
 *   - 連續事件會合併，一次湧入十則通知不會變成連珠炮
 *   - AudioContext 只在使用者第一次互動後才建立，
 *     瀏覽器本來就會擋掉沒有互動就自動播放的音訊
 */

const MUTE_KEY = 'inkstone.sound.muted'
const MIN_GAP_MS = 1500

let ctx: AudioContext | null = null
let lastPlayed = 0

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
 * 播放提示聲。
 *
 * @param force 忽略「視窗有焦點就不響」的判斷。測試按鈕用。
 */
export function playNotification(force = false): void {
  if (isMuted()) return

  // 人正在看畫面就不用出聲提醒
  if (!force && document.visibilityState === 'visible' && document.hasFocus()) return

  const now = Date.now()
  if (!force && now - lastPlayed < MIN_GAP_MS) return
  lastPlayed = now

  const audio = getContext()
  if (!audio) return

  // 分頁切回來時 context 可能是 suspended，要先喚醒
  if (audio.state === 'suspended') void audio.resume()

  const t = audio.currentTime
  // 兩音上行（E5 → A5），比單音更容易被辨識成「有新東西」而非系統警告
  tone(audio, 659.25, t, 0.18, 0.14)
  tone(audio, 880.0, t + 0.09, 0.28, 0.11)
}

/** 訊息用比較低、比較短的聲音，跟通知區分開來 */
export function playMessage(force = false): void {
  if (isMuted()) return
  if (!force && document.visibilityState === 'visible' && document.hasFocus()) return

  const now = Date.now()
  if (!force && now - lastPlayed < MIN_GAP_MS) return
  lastPlayed = now

  const audio = getContext()
  if (!audio) return
  if (audio.state === 'suspended') void audio.resume()

  const t = audio.currentTime
  tone(audio, 523.25, t, 0.14, 0.11)
}
