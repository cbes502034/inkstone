/**
 * API 客戶端。
 *
 * 直接對應後端的 RESTful 端點。當初把這層抽出來就是為了這一刻 ——
 * 從 mock 換成真後端，頁面元件一行都不用改。
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
import { http } from './http'

export { ApiError } from './http'

// ================================================================ 身分驗證

export const auth = {
  /**
   * POST /auth/register/start —— 註冊第一步
   *
   * 只送帳號與信箱，後端寄出驗證信。這時候還不會建立帳號。
   * 回應一律相同，不論帳號是否已被使用 —— 後端刻意不透露，
   * 否則這支 API 就成了帳號探測工具。
   */
  registerStart(input: {
    username: string
    email: string
  }): Promise<{ message: string; devLink: string | null }> {
    return http.post('/auth/register/start', input)
  },

  /** GET /auth/register/check —— 點開連結時先確認票證有效 */
  registerCheck(token: string): Promise<{ username: string; email: string }> {
    return http.get('/auth/register/check', { token })
  },

  /** POST /auth/register/complete —— 設定密碼，帳號在這一刻才建立 */
  registerComplete(input: {
    token: string
    password: string
    confirmPassword: string
    avatarDataUrl?: string | null
  }): Promise<AuthSession> {
    return http.post<AuthSession>('/auth/register/complete', input)
  },

  /** POST /auth/login */
  login(input: { account: string; password: string }): Promise<AuthSession> {
    return http.post<AuthSession>('/auth/login', input)
  },

  /** POST /auth/password/forgot —— 回應一律相同，不透露信箱是否註冊過 */
  forgotPassword(email: string): Promise<{ message: string; devLink: string | null }> {
    return http.post('/auth/password/forgot', { email })
  },

  /** GET /auth/password/check */
  passwordResetCheck(token: string): Promise<{ username: string; email: string }> {
    return http.get('/auth/password/check', { token })
  },

  /** POST /auth/password/reset */
  resetPassword(input: {
    token: string
    password: string
    confirmPassword: string
  }): Promise<void> {
    return http.post<void>('/auth/password/reset', input)
  },

  /**
   * POST /auth/logout
   *
   * 兩張 token 都要送 —— 後端會把它們加進撤銷名單。
   * 只丟掉前端的副本不夠：JWT 簽出去之後只要沒過期就一直有效，
   * 被側錄或留在別台裝置的那一份仍然可用。
   */
  logout(tokens: { accessToken: string | null; refreshToken: string | null }): Promise<void> {
    return http.post<void>('/auth/logout', tokens)
  },

  /** GET /users/me —— 只有本人拿得到 email 等私密欄位 */
  me(): Promise<UserPrivate> {
    return http.get<UserPrivate>('/users/me')
  },

  /** PATCH /users/me */
  updateMe(
    patch: Partial<
      Pick<UserPrivate, 'displayName' | 'bio' | 'avatarUrl' | 'showPresence'>
    >,
  ): Promise<UserPrivate> {
    return http.patch<UserPrivate>('/users/me', patch)
  },

  /** POST /users/me/heartbeat —— 維持上線狀態 */
  heartbeat(): Promise<void> {
    return http.post<void>('/users/me/heartbeat')
  },
}

// ================================================================ 貼文

export const posts = {
  /** GET /posts?cursor= */
  feed(cursor?: string | null): Promise<Page<Post>> {
    return http.get<Page<Post>>('/posts', { cursor: cursor ?? undefined })
  },

  /** GET /users/{username}/posts */
  byAuthor(username: string): Promise<Post[]> {
    return http.get<Post[]>(`/users/${encodeURIComponent(username)}/posts`)
  },

  /** GET /posts/{id} */
  get(id: ID): Promise<Post> {
    return http.get<Post>(`/posts/${id}`)
  },

  /** POST /posts */
  create(input: { title: string; body: string }): Promise<Post> {
    return http.post<Post>('/posts', input)
  },

  /** PATCH /posts/{id} —— 後端會驗擁有者 */
  update(id: ID, input: { title: string; body: string }): Promise<Post> {
    return http.patch<Post>(`/posts/${id}`, input)
  },

  /** DELETE /posts/{id} */
  remove(id: ID): Promise<void> {
    return http.del<void>(`/posts/${id}`)
  },

  /**
   * 按讚／取消。
   *
   * 後端拆成 PUT 與 DELETE 兩支（各自冪等），比單一 toggle 可靠 ——
   * toggle 在網路重送時會把狀態翻回去，兩支則重送幾次結果都一樣。
   */
  setLike(id: ID, liked: boolean): Promise<Pick<Post, 'likeCount' | 'likedByMe'>> {
    return liked
      ? http.put<Pick<Post, 'likeCount' | 'likedByMe'>>(`/posts/${id}/like`)
      : http.del<Pick<Post, 'likeCount' | 'likedByMe'>>(`/posts/${id}/like`)
  },

  /** GET /posts/{id}/likes */
  likers(id: ID): Promise<{ items: UserPublic[]; total: number }> {
    return http.get<{ items: UserPublic[]; total: number }>(`/posts/${id}/likes`)
  },

  /** GET /search?q= */
  search(q: string): Promise<{ posts: Post[]; users: UserPublic[] }> {
    if (!q.trim()) return Promise.resolve({ posts: [], users: [] })
    return http.get<{ posts: Post[]; users: UserPublic[] }>('/search', { q })
  },
}

// ================================================================ 留言

export const comments = {
  /** GET /posts/{id}/comments */
  list(postId: ID): Promise<Comment[]> {
    return http.get<Comment[]>(`/posts/${postId}/comments`)
  },

  /** POST /posts/{id}/comments */
  create(postId: ID, body: string): Promise<Comment> {
    return http.post<Comment>(`/posts/${postId}/comments`, { body })
  },

  /** DELETE /comments/{id} */
  remove(id: ID): Promise<void> {
    return http.del<void>(`/comments/${id}`)
  },
}

// ================================================================ 好友

export const friends = {
  /** GET /friends */
  list(): Promise<UserPublic[]> {
    return http.get<UserPublic[]>('/friends')
  },

  /** GET /friends/requests?direction=incoming */
  incoming(): Promise<UserPublic[]> {
    return http.get<UserPublic[]>('/friends/requests', { direction: 'incoming' })
  },

  /** GET /friends/requests?direction=outgoing */
  outgoing(): Promise<UserPublic[]> {
    return http.get<UserPublic[]>('/friends/requests', { direction: 'outgoing' })
  },

  /** GET /users?q= */
  search(q: string): Promise<UserWithRelation[]> {
    if (!q.trim()) return Promise.resolve([])
    return http.get<UserWithRelation[]>('/users', { q })
  },

  /** GET /users/{username} */
  profile(username: string): Promise<UserWithRelation> {
    return http.get<UserWithRelation>(`/users/${encodeURIComponent(username)}`)
  },

  /** POST /friends/requests —— 雙向流程，要對方接受才成立 */
  invite(userId: ID): Promise<void> {
    return http.post<void>('/friends/requests', undefined, { toUserId: userId })
  },

  /** POST /friends/requests/{id}/accept */
  accept(userId: ID): Promise<void> {
    return http.post<void>(`/friends/requests/${userId}/accept`)
  },

  /** DELETE /friends/requests/{id} —— 拒絕或收回 */
  decline(userId: ID): Promise<void> {
    return http.del<void>(`/friends/requests/${userId}`)
  },

  /** DELETE /friends/{id} */
  remove(userId: ID): Promise<void> {
    return http.del<void>(`/friends/${userId}`)
  },

  /** POST /friends/block/{id} */
  block(userId: ID): Promise<void> {
    return http.post<void>(`/friends/block/${userId}`)
  },

  /** DELETE /friends/block/{id} */
  unblock(userId: ID): Promise<void> {
    return http.del<void>(`/friends/block/${userId}`)
  },
}

// ================================================================ 檢舉與封鎖

export const moderation = {
  /** POST /reports —— 只留紀錄不自動下架，避免檢舉被當成攻擊工具 */
  report(input: {
    targetType: 'post' | 'comment' | 'user'
    targetId: ID
    reason: string
  }): Promise<void> {
    return http.post<void>('/reports', input)
  },
}

// ================================================================ 聊天

export const chat = {
  /** GET /conversations */
  conversations(): Promise<Conversation[]> {
    return http.get<Conversation[]>('/conversations')
  },

  /** GET /conversations/{id} */
  conversation(id: ID): Promise<Conversation> {
    return http.get<Conversation>(`/conversations/${id}`)
  },

  /** POST /conversations/{id}/read —— 標記讀到現在為止，冪等 */
  markRead(conversationId: ID): Promise<void> {
    return http.post<void>(`/conversations/${conversationId}/read`)
  },

  /** GET /conversations/{id}/messages */
  messages(conversationId: ID): Promise<Message[]> {
    return http.get<Message[]>(`/conversations/${conversationId}/messages`)
  },

  /** POST /conversations/{id}/messages */
  send(conversationId: ID, body: string): Promise<Message> {
    return http.post<Message>(`/conversations/${conversationId}/messages`, { body })
  },

  /** POST /conversations —— 只能拉好友入群 */
  createGroup(name: string, memberIds: ID[]): Promise<Conversation> {
    return http.post<Conversation>('/conversations', { name, memberIds })
  },

  /** POST /conversations/{id}/members —— 只有群主可以 */
  addMembers(conversationId: ID, memberIds: ID[]): Promise<Conversation> {
    return http.post<Conversation>(`/conversations/${conversationId}/members`, {
      memberIds,
    })
  },

  /** POST /conversations/direct —— 找出或建立一對一對話 */
  openDirect(userId: ID): Promise<Conversation> {
    return http.post<Conversation>('/conversations/direct', { userId })
  },

  /** PATCH /conversations/{id} —— 只有群主可以改名 */
  renameGroup(conversationId: ID, name: string): Promise<Conversation> {
    return http.patch<Conversation>(`/conversations/${conversationId}`, { name })
  },

  /** DELETE /conversations/{id}/members/{userId} —— 只有群主可以踢人 */
  removeMember(conversationId: ID, userId: ID): Promise<void> {
    return http.del<void>(`/conversations/${conversationId}/members/${userId}`)
  },

  /** DELETE /conversations/{id}/members/me */
  leaveGroup(conversationId: ID): Promise<void> {
    return http.del<void>(`/conversations/${conversationId}/members/me`)
  },
}

// ================================================================ 通知

export const notifications = {
  /** GET /notifications */
  list(): Promise<AppNotification[]> {
    return http.get<AppNotification[]>('/notifications')
  },

  /** POST /notifications/read */
  markAllRead(): Promise<void> {
    return http.post<void>('/notifications/read')
  },
}

// ================================================================ AI 寫作助手

interface ComposeResponse {
  id: string
  role: 'assistant'
  kind: 'draft' | 'refusal'
  body: string
  draft: { title: string; body: string } | null
  createdAt: string
  sessionId: string
}

export const ai = {
  /** POST /ai/compose —— 對話暫存在後端的 Redis，設 TTL 不落地資料庫 */
  async compose(prompt: string, sessionId?: string | null): Promise<AiTurn> {
    const res = await http.post<ComposeResponse>('/ai/compose', {
      prompt,
      sessionId: sessionId ?? undefined,
    })
    return {
      id: res.id,
      role: 'assistant',
      kind: res.kind,
      body: res.body,
      draft: res.draft ?? undefined,
      createdAt: res.createdAt,
      sessionId: res.sessionId,
    }
  },

  /** DELETE /ai/sessions/{id} —— 採用草稿或關閉面板時清掉暫存 */
  endSession(sessionId: string): Promise<void> {
    return http.del<void>(`/ai/sessions/${sessionId}`)
  },
}

/* ------------------------------------------------------------------ 推播 */

interface PushSubscriptionPayload {
  endpoint: string
  p256dh: string
  auth: string
}

export const push = {
  /** GET /push/key —— 訂閱要用的 VAPID 公鑰 */
  key(): Promise<{ publicKey: string }> {
    return http.get<{ publicKey: string }>('/push/key')
  },

  /** POST /push/subscribe */
  subscribe(sub: PushSubscriptionPayload): Promise<void> {
    return http.post<void>('/push/subscribe', sub)
  },

  /**
   * POST /push/unsubscribe
   *
   * 不是 DELETE —— 要帶 endpoint 進來（一段很長的網址），
   * 而 DELETE 的請求主體在部分代理與客戶端會被剝掉。
   */
  unsubscribe(sub: PushSubscriptionPayload): Promise<void> {
    return http.post<void>('/push/unsubscribe', sub)
  },
}
