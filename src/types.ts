/**
 * 領域模型 — 與後端 RESTful API 的回應形狀一一對應。
 * 後端接上之後，這份型別不需要更動。
 */

export type ID = string

/**
 * 上線狀態。
 *
 * online 由 WebSocket 連線維持（心跳），斷線後有一小段寬限期才轉 offline，
 * 避免使用者切個分頁、過個隧道就被標成離線。
 * away 是有連線但一段時間沒動作。
 */
export type Presence = 'online' | 'away' | 'offline'

/** 對外公開的使用者樣貌 — 任何人都看得到 */
export interface UserPublic {
  id: ID
  username: string // 帳號，唯一，用於 @提及 與搜尋
  displayName: string // 顯示名稱
  avatarUrl: string | null
  bio: string
  createdAt: string // ISO 8601
  presence: Presence
  /** 最後一次上線時間；對方關閉「顯示上線狀態」時後端不回傳這欄 */
  lastSeenAt: string | null
}

/** 只有本人看得到的欄位，登入後由 /users/me 回傳 */
export interface UserPrivate extends UserPublic {
  email: string
  emailVerified: boolean
  /**
   * 隱私設定：關掉之後別人只會看到「離線」，也看不到最後上線時間。
   * 這是社群產品該給的退出選項 —— 不是每個人都想被看見自己在線上。
   */
  showPresence: boolean
}

/** A 看 B 時，B 相對於 A 的關係狀態 */
export type FriendState =
  | 'none' // 無關係
  | 'outgoing' // 我送出邀請，等對方回應
  | 'incoming' // 對方邀請我，等我回應
  | 'friends' // 已是好友
  | 'self' // 是我自己
  | 'blocked' // 我封鎖了對方

export interface UserWithRelation extends UserPublic {
  friendState: FriendState
  friendCount: number
  postCount: number
}

export interface FriendRequest {
  id: ID
  from: UserPublic
  to: UserPublic
  createdAt: string
}

/** 貼文 */
export interface Post {
  id: ID
  author: UserPublic
  title: string
  body: string // 原始碼，含自訂語法
  tags: string[] // 由 #標籤 解析而來
  coverUrl: string | null
  createdAt: string // 首次發布，永久不變
  updatedAt: string // 最後編輯；與 createdAt 不同代表編輯過
  edited: boolean
  likeCount: number
  commentCount: number
  likedByMe: boolean
  /** 是否為登入者本人的貼文 — 只有 true 才顯示編輯選項 */
  isMine: boolean
}

export interface Comment {
  id: ID
  postId: ID
  author: UserPublic
  body: string
  createdAt: string
  isMine: boolean
}

/** 聊天 */
export type ConversationKind = 'direct' | 'group'

export interface Conversation {
  id: ID
  kind: ConversationKind
  /** 群組才有名稱；一對一顯示對方的 displayName */
  name: string
  avatarUrl: string | null
  members: UserPublic[]
  /** 群組建立者，可改群名/踢人/解散 */
  ownerId: ID | null
  lastMessage: Message | null
  unreadCount: number
  updatedAt: string
}

export interface Message {
  id: ID
  conversationId: ID
  sender: UserPublic
  body: string
  createdAt: string
  isMine: boolean
}

/** 通知 */
export type NotificationKind =
  | 'friend_request'
  | 'friend_accepted'
  | 'post_liked'
  | 'post_commented'
  | 'group_invited'

export interface AppNotification {
  id: ID
  kind: NotificationKind
  actor: UserPublic
  /** 相關資源連結，例如 /post/xxx */
  href: string
  preview: string
  read: boolean
  createdAt: string
}

/** AI 寫作助手 */
export type AiRole = 'user' | 'assistant'

export type AiReplyKind =
  | 'draft' // 正常產出草稿
  | 'refusal' // 偵測到搗亂／離題，善意提醒
  | 'clarify' // 需要更多資訊

export interface AiTurn {
  id: ID
  role: AiRole
  body: string
  kind?: AiReplyKind
  /** 產出的草稿，使用者按「就是這個」時帶回編輯器 */
  draft?: { title: string; body: string }
  createdAt: string
}

/** 分頁 — 游標式，配合無限捲動 */
export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  user: UserPrivate
}
