/**
 * API 客戶端。
 *
 * 目前接的是本機 mock，但每一支函式都對應一個真實的 RESTful 端點
 * （註解裡的 HTTP 動詞 + 路徑就是後端要實作的規格）。
 * 後端完成後，只要把這個檔案的內部實作換成 fetch，頁面一行都不用改。
 */

import type {
  AiTurn,
  AppNotification,
  AuthSession,
  Comment,
  Conversation,
  ID,
  Message,
  Page,
  Post,
  UserPrivate,
  UserPublic,
  UserWithRelation,
} from '../types'
import { extractTags } from './markup'
import {
  COMMENTS,
  CONVERSATIONS,
  ME,
  MESSAGES,
  NOTIFICATIONS,
  POSTS,
  RELATIONS,
  USERS,
  userById,
} from './mock/seed'

/** 模擬網路延遲，讓 loading / 骨架屏 的行為跟真實情況一致 */
const delay = (ms = 260) => new Promise((r) => setTimeout(r, ms))

const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/** 依刊登日期新到舊 —— 編輯不改變 createdAt，所以排序不會因為編輯而跳動 */
const byNewest = (a: Post, b: Post) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

const PAGE_SIZE = 4

// ================================================================ 身分驗證
// JWT：access token 短效，refresh token 換新的 access token。

export const auth = {
  /** POST /api/v1/auth/register  （multipart，可夾帶頭像） */
  async register(input: {
    username: string
    displayName: string
    email: string
    password: string
    avatarDataUrl?: string | null
  }): Promise<AuthSession> {
    await delay(700)
    if (USERS.some((u) => u.username === input.username)) {
      throw new ApiError(409, '這個帳號已經有人用了')
    }
    const now = new Date().toISOString()
    const user: UserPrivate = {
      id: uid('u'),
      username: input.username,
      displayName: input.displayName,
      avatarUrl: input.avatarDataUrl ?? null,
      bio: '',
      email: input.email,
      emailVerified: false,
      createdAt: now,
      presence: 'online',
      lastSeenAt: now,
      showPresence: true,
    }
    return { accessToken: uid('at'), refreshToken: uid('rt'), user }
  },

  /** POST /api/v1/auth/login */
  async login(_input: { account: string; password: string }): Promise<AuthSession> {
    await delay(600)
    return { accessToken: uid('at'), refreshToken: uid('rt'), user: clone(ME) }
  },

  /** POST /api/v1/auth/logout */
  async logout(): Promise<void> {
    await delay(150)
  },

  /** GET /api/v1/users/me —— 只有本人拿得到 email 等私密欄位 */
  async me(): Promise<UserPrivate> {
    await delay(200)
    return clone(ME)
  },

  /** PATCH /api/v1/users/me */
  async updateMe(
    patch: Partial<
      Pick<UserPrivate, 'displayName' | 'bio' | 'avatarUrl' | 'showPresence'>
    >,
  ) {
    await delay(500)
    Object.assign(ME, patch)
    return clone(ME)
  },
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// ================================================================ 貼文

export const posts = {
  /** GET /api/v1/posts?cursor=&limit= —— 動態牆，刊登日期新到舊 */
  async feed(cursor?: string | null): Promise<Page<Post>> {
    await delay()
    const sorted = [...POSTS].sort(byNewest)
    const start = cursor ? sorted.findIndex((p) => p.id === cursor) + 1 : 0
    const items = sorted.slice(start, start + PAGE_SIZE)
    const next = start + PAGE_SIZE < sorted.length ? items[items.length - 1]?.id : null
    return { items: clone(items), nextCursor: next ?? null }
  },

  /** GET /api/v1/users/{id}/posts */
  async byAuthor(authorId: ID): Promise<Post[]> {
    await delay()
    return clone(POSTS.filter((p) => p.author.id === authorId).sort(byNewest))
  },

  /** GET /api/v1/posts/{id} */
  async get(id: ID): Promise<Post> {
    await delay(200)
    const post = POSTS.find((p) => p.id === id)
    if (!post) throw new ApiError(404, '找不到這篇文章')
    return clone(post)
  },

  /** POST /api/v1/posts */
  async create(input: { title: string; body: string }): Promise<Post> {
    await delay(650)
    const now = new Date().toISOString()
    const post: Post = {
      id: uid('p'),
      author: clone(ME) as UserPublic,
      title: input.title.trim(),
      body: input.body,
      tags: extractTags(input.body),
      coverUrl: null,
      createdAt: now,
      updatedAt: now,
      edited: false,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      isMine: true,
    }
    POSTS.unshift(post)
    return clone(post)
  },

  /**
   * PATCH /api/v1/posts/{id}
   * 後端必須驗證 owner_id === 目前登入者；只靠前端隱藏編輯鈕擋不住直接打 API。
   *
   * createdAt 保持不變（排序不跳動、對讀者透明），只更新 updatedAt 並標記 edited。
   */
  async update(id: ID, input: { title: string; body: string }): Promise<Post> {
    await delay(650)
    const post = POSTS.find((p) => p.id === id)
    if (!post) throw new ApiError(404, '找不到這篇文章')
    if (!post.isMine) throw new ApiError(403, '你只能編輯自己的文章')
    post.title = input.title.trim()
    post.body = input.body
    post.tags = extractTags(input.body)
    post.updatedAt = new Date().toISOString()
    post.edited = true
    return clone(post)
  },

  /** DELETE /api/v1/posts/{id} */
  async remove(id: ID): Promise<void> {
    await delay(400)
    const i = POSTS.findIndex((p) => p.id === id)
    if (i >= 0 && POSTS[i].isMine) POSTS.splice(i, 1)
  },

  /** PUT / DELETE /api/v1/posts/{id}/like —— 可取消，冪等 */
  async toggleLike(id: ID): Promise<Pick<Post, 'likeCount' | 'likedByMe'>> {
    await delay(180)
    const post = POSTS.find((p) => p.id === id)!
    post.likedByMe = !post.likedByMe
    post.likeCount += post.likedByMe ? 1 : -1
    return { likeCount: post.likeCount, likedByMe: post.likedByMe }
  },

  /** GET /api/v1/search?q= —— 標題、內文、標籤、作者一起搜 */
  async search(q: string): Promise<{ posts: Post[]; users: UserPublic[] }> {
    await delay(320)
    const needle = q.trim().toLowerCase()
    if (!needle) return { posts: [], users: [] }
    const matched = POSTS.filter((p) => {
      const hay = `${p.title} ${p.body} ${p.author.displayName}`.toLowerCase()
      return hay.includes(needle)
    }).sort(byNewest)
    const users = USERS.filter(
      (u) =>
        u.id !== ME.id &&
        `${u.displayName} ${u.username}`.toLowerCase().includes(needle),
    )
    return { posts: clone(matched), users: clone(users) }
  },
}

// ================================================================ 留言

export const comments = {
  /** GET /api/v1/posts/{id}/comments */
  async list(postId: ID): Promise<Comment[]> {
    await delay(240)
    const items = COMMENTS.filter((c) => c.postId === postId).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    return clone(items)
  },

  /** POST /api/v1/posts/{id}/comments */
  async create(postId: ID, body: string): Promise<Comment> {
    await delay(420)
    const c: Comment = {
      id: uid('c'),
      postId,
      author: clone(ME) as UserPublic,
      body: body.trim(),
      createdAt: new Date().toISOString(),
      isMine: true,
    }
    COMMENTS.push(c)
    const post = POSTS.find((p) => p.id === postId)
    if (post) post.commentCount += 1
    return clone(c)
  },

  /** DELETE /api/v1/comments/{id} */
  async remove(id: ID): Promise<void> {
    await delay(300)
    const i = COMMENTS.findIndex((c) => c.id === id)
    if (i >= 0 && COMMENTS[i].isMine) {
      const post = POSTS.find((p) => p.id === COMMENTS[i].postId)
      if (post) post.commentCount -= 1
      COMMENTS.splice(i, 1)
    }
  },
}

// ================================================================ 好友

export const friends = {
  /** GET /api/v1/friends */
  async list(): Promise<UserPublic[]> {
    await delay()
    return clone(USERS.filter((u) => RELATIONS[u.id] === 'friends'))
  },

  /** GET /api/v1/friends/requests —— 收到的邀請 */
  async incoming(): Promise<UserPublic[]> {
    await delay(200)
    return clone(USERS.filter((u) => RELATIONS[u.id] === 'incoming'))
  },

  /** GET /api/v1/friends/requests?direction=outgoing */
  async outgoing(): Promise<UserPublic[]> {
    await delay(200)
    return clone(USERS.filter((u) => RELATIONS[u.id] === 'outgoing'))
  },

  /** GET /api/v1/users?q= —— 搜尋使用者 */
  async search(q: string): Promise<UserWithRelation[]> {
    await delay(300)
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return USERS.filter(
      (u) =>
        u.id !== ME.id &&
        `${u.displayName} ${u.username}`.toLowerCase().includes(needle),
    ).map((u) => withRelation(u))
  },

  /** GET /api/v1/users/{username} */
  async profile(username: string): Promise<UserWithRelation> {
    await delay(260)
    const u = USERS.find((x) => x.username === username)
    if (!u) throw new ApiError(404, '找不到這個人')
    return withRelation(u)
  },

  /**
   * POST /api/v1/friends/requests  { toUserId }
   * 雙向流程：送出邀請 → 對方接受才成立，不能單方面把人加成好友。
   */
  async invite(userId: ID): Promise<void> {
    await delay(380)
    RELATIONS[userId] = 'outgoing'
  },

  /** POST /api/v1/friends/requests/{id}/accept */
  async accept(userId: ID): Promise<void> {
    await delay(380)
    RELATIONS[userId] = 'friends'
  },

  /** DELETE /api/v1/friends/requests/{id} —— 拒絕或收回邀請 */
  async decline(userId: ID): Promise<void> {
    await delay(320)
    RELATIONS[userId] = 'none'
  },

  /** DELETE /api/v1/friends/{id} */
  async remove(userId: ID): Promise<void> {
    await delay(320)
    RELATIONS[userId] = 'none'
  },
}

function withRelation(u: UserPublic): UserWithRelation {
  return {
    ...clone(u),
    friendState: RELATIONS[u.id] ?? 'none',
    friendCount: Object.values(RELATIONS).filter((r) => r === 'friends').length,
    postCount: POSTS.filter((p) => p.author.id === u.id).length,
  }
}

// ================================================================ 聊天
// 真實版本走 WebSocket（Supabase Realtime）推送，REST 只負責取歷史訊息。

export const chat = {
  /** GET /api/v1/conversations */
  async conversations(): Promise<Conversation[]> {
    await delay(240)
    const sorted = [...CONVERSATIONS].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    return clone(sorted)
  },

  /** GET /api/v1/conversations/{id} */
  async conversation(id: ID): Promise<Conversation> {
    await delay(180)
    const c = CONVERSATIONS.find((x) => x.id === id)
    if (!c) throw new ApiError(404, '找不到這個對話')
    c.unreadCount = 0
    return clone(c)
  },

  /** GET /api/v1/conversations/{id}/messages */
  async messages(conversationId: ID): Promise<Message[]> {
    await delay(220)
    return clone(MESSAGES.filter((m) => m.conversationId === conversationId))
  },

  /** POST /api/v1/conversations/{id}/messages */
  async send(conversationId: ID, body: string): Promise<Message> {
    await delay(160)
    const m: Message = {
      id: uid('m'),
      conversationId,
      sender: clone(ME) as UserPublic,
      body: body.trim(),
      createdAt: new Date().toISOString(),
      isMine: true,
    }
    MESSAGES.push(m)
    const conv = CONVERSATIONS.find((c) => c.id === conversationId)
    if (conv) {
      conv.lastMessage = m
      conv.updatedAt = m.createdAt
    }
    return clone(m)
  },

  /** POST /api/v1/conversations  { kind:'group', name, memberIds } */
  async createGroup(name: string, memberIds: ID[]): Promise<Conversation> {
    await delay(520)
    const conv: Conversation = {
      id: uid('cv'),
      kind: 'group',
      name: name.trim(),
      avatarUrl: null,
      members: [ME as UserPublic, ...memberIds.map(userById)],
      ownerId: ME.id,
      lastMessage: null,
      unreadCount: 0,
      updatedAt: new Date().toISOString(),
    }
    CONVERSATIONS.unshift(conv)
    return clone(conv)
  },

  /** POST /api/v1/conversations/{id}/members —— 只有群主可以拉人 */
  async addMembers(conversationId: ID, memberIds: ID[]): Promise<Conversation> {
    await delay(400)
    const conv = CONVERSATIONS.find((c) => c.id === conversationId)!
    if (conv.ownerId !== ME.id) throw new ApiError(403, '只有群主可以邀請成員')
    for (const id of memberIds) {
      if (!conv.members.some((m) => m.id === id)) conv.members.push(userById(id))
    }
    return clone(conv)
  },

  /** POST /api/v1/conversations/direct  { userId } —— 找出或建立一對一對話 */
  async openDirect(userId: ID): Promise<Conversation> {
    await delay(300)
    const found = CONVERSATIONS.find(
      (c) => c.kind === 'direct' && c.members.some((m) => m.id === userId),
    )
    if (found) return clone(found)
    const other = userById(userId)
    const conv: Conversation = {
      id: uid('cv'),
      kind: 'direct',
      name: other.displayName,
      avatarUrl: other.avatarUrl,
      members: [ME as UserPublic, other],
      ownerId: null,
      lastMessage: null,
      unreadCount: 0,
      updatedAt: new Date().toISOString(),
    }
    CONVERSATIONS.unshift(conv)
    return clone(conv)
  },
}

// ================================================================ 通知

export const notifications = {
  /** GET /api/v1/notifications */
  async list(): Promise<AppNotification[]> {
    await delay(220)
    return clone(NOTIFICATIONS)
  },

  /** POST /api/v1/notifications/read */
  async markAllRead(): Promise<void> {
    await delay(180)
    NOTIFICATIONS.forEach((n) => (n.read = true))
  },
}

// ================================================================ AI 寫作助手
//
// 真實版本：POST /api/v1/ai/compose，後端串 Hugging Face 推論服務。
// 防護是兩層 —— 送進生成模型前先分類過濾，生成後再複查一次，
// 光靠 system prompt 擋不住誘導。這裡先用規則模擬那個行為。

const OFF_TOPIC = [
  /怎麼(駭|入侵|盜)/,
  /(信用卡|身分證|密碼)號?碼/,
  /幫我(寫|做)(作業|考卷|報告)/,
  /(股票|樂透|明牌).*(推薦|報)/,
  /你是什麼模型|你的 ?prompt|忽略(上面|先前|之前)/i,
]

const NONSENSE = /^[\s\p{P}]*(.)\1{5,}[\s\p{P}]*$/u

export const ai = {
  /** POST /api/v1/ai/compose —— 對話暫存在 Redis，設 TTL，不落地資料庫 */
  async compose(prompt: string, _history: AiTurn[]): Promise<AiTurn> {
    await delay(900)
    const text = prompt.trim()

    // 第一層：輸入端分類。判定為搗亂/離題就不進生成模型，直接善意提醒。
    if (text.length < 4 || NONSENSE.test(text)) {
      return refusal('看起來還沒想好要寫什麼。跟我說個主題或心情就好，例如「想寫一篇關於通勤路上看到的事」。')
    }
    if (OFF_TOPIC.some((re) => re.test(text))) {
      return refusal(
        '這個我幫不上忙 —— 我只負責陪你寫這裡的文章。要不要換個想寫的題目？隨便一件今天發生的小事都可以。',
      )
    }

    // 正常路徑：產出草稿
    const title = suggestTitle(text)
    const body = suggestBody(text)
    return {
      id: uid('ai'),
      role: 'assistant',
      kind: 'draft',
      body: '照你說的方向寫了一版，你看看順不順：',
      draft: { title, body },
      createdAt: new Date().toISOString(),
    }
  },
}

function refusal(body: string): AiTurn {
  return {
    id: uid('ai'),
    role: 'assistant',
    kind: 'refusal',
    body,
    createdAt: new Date().toISOString(),
  }
}

function suggestTitle(prompt: string): string {
  const core = prompt
    .replace(/^(幫我|請幫我|請|我想|想)?\s*(寫|生成|來|記錄|整理|聊聊|說說)\s*(一)?(篇|下|個)?\s*(關於)?/, '')
    .replace(/^的/, '')
    .trim()
  return core.length > 24 ? core.slice(0, 22) + '…' : core || '無題'
}

/** 標籤要短才像標籤 —— 取前幾個字，去掉標點 */
function suggestTag(prompt: string): string {
  const clean = suggestTitle(prompt).replace(/[\s\p{P}…]/gu, '')
  return clean.slice(0, 6) || '隨筆'
}

function suggestBody(prompt: string): string {
  const topic = suggestTitle(prompt)
  return `最近一直在想${topic}這件事。

一開始只是個很小的念頭，沒放在心上。但它就這樣待著，時不時冒出來提醒我一下，久了就變成一件\`非得寫下來不可\`的事。

我想先把事情本身講清楚，再講它為什麼讓我在意。

（這裡接著寫你的觀察或經過。可以從一個具體的場景開始 —— 那天幾點、你在哪裡、看到什麼，讀起來會比抽象的心得更有畫面。）

寫到這裡才發現，其實真正想說的不是${topic}本身，而是它讓我看見的那一點東西。

#${suggestTag(prompt)}`
}
