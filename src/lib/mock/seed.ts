import type {
  AppNotification,
  Comment,
  Conversation,
  FriendState,
  Message,
  Post,
  Presence,
  UserPrivate,
  UserPublic,
} from '../../types'

/** 相對於「現在」的時間，讓畫面上的「3 小時前」永遠合理 */
const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString()

// ---------------------------------------------------------------- 使用者

export const ME: UserPrivate = {
  id: 'u_me',
  username: 'guanwen',
  displayName: '邱冠文',
  avatarUrl: null,
  bio: '寫程式，也寫字。最近在把玩語言模型，想弄懂它到底怎麼「想」的。',
  email: 'cbes502034@gmail.com',
  emailVerified: true,
  createdAt: ago(60 * 24 * 214),
  presence: 'online',
  lastSeenAt: new Date().toISOString(),
  showPresence: true,
}

const mkUser = (
  id: string,
  username: string,
  displayName: string,
  bio: string,
  days: number,
  presence: Presence,
  seenMinsAgo: number,
): UserPublic => ({
  id,
  username,
  displayName,
  avatarUrl: null,
  bio,
  createdAt: ago(60 * 24 * days),
  presence,
  lastSeenAt: presence === 'online' ? new Date().toISOString() : ago(seenMinsAgo),
})

export const USERS: UserPublic[] = [
  { ...ME },
  mkUser('u_lin', 'linyuhan', '林宇涵', '做菜、爬山、偶爾寫點東西。台南人。', 180, 'online', 0),
  mkUser('u_chen', 'chenweiting', '陳威廷', '後端工程師。討厭寫文件但還是會寫。', 320, 'online', 0),
  mkUser('u_huang', 'ahuang', '黃思瑜', '插畫接案中。喜歡逛舊書店。', 95, 'away', 14),
  mkUser('u_tsai', 'tsai_dev', '蔡明宏', '資料工程。咖啡因驅動。', 410, 'offline', 190),
  mkUser('u_wu', 'wuchiaoyu', '吳巧妤', '大學生，念中文系。正在學日文。', 60, 'offline', 640),
  mkUser('u_hsu', 'hsu_photo', '許紹謙', '攝影。底片還沒死。', 250, 'online', 0),
  mkUser('u_yeh', 'yehmeiling', '葉美玲', '國小老師。假日種菜。', 140, 'offline', 2900),
]

export const userById = (id: string) => USERS.find((u) => u.id === id)!

/** 好友關係狀態表 —— key 是對方 id */
export const RELATIONS: Record<string, FriendState> = {
  u_me: 'self',
  u_lin: 'friends',
  u_chen: 'friends',
  u_huang: 'friends',
  u_tsai: 'friends',
  u_wu: 'incoming', // 對方邀請我，待我回應
  u_hsu: 'outgoing', // 我邀請對方，等回應
  u_yeh: 'none',
}

// ---------------------------------------------------------------- 貼文

interface Seed {
  id: string
  authorId: string
  title: string
  body: string
  mins: number
  editedMins?: number
  likes: number
  liked?: boolean
}

const POST_SEEDS: Seed[] = [
  {
    id: 'p_1',
    authorId: 'u_me',
    title: '我終於搞懂 Attention 在幹嘛了',
    body: `看了三個月的論文，一直到昨天才真的通。

以前我把 attention 想成某種黑魔法，看到 Q、K、V 三個矩陣就開始眼神死。後來看到一個比喻整個打通：\`Query 是「我要找什麼」，Key 是「我對什麼樣的問題有反應」，Value 才是真正會傳出去的內容本體\`。

用查字典想就懂了。你心裡有個想查的詞（Query），字典每一頁都有個詞頭（Key），你拿你要查的去跟每一頁詞頭比對，比對出來的分數決定你要看哪一頁的內容（Value）。差別只在於，機器不是只挑一頁，而是把所有頁面按分數加權平均起來。

這也是為什麼它能平行運算。RNN 得等前一個算完才能算下一個，attention 是\`所有位置一次算完\`，這才是它真正打敗 RNN 的地方，不是準確度，是速度。

#深度學習 #Transformer #筆記`,
    mins: 42,
    likes: 28,
    liked: true,
  },
  {
    id: 'p_2',
    authorId: 'u_lin',
    title: '外婆的滷肉，我終於復刻成功',
    body: `試了大概第七次吧。

前面幾次都敗在一個地方 —— 我一直用醬油膏。外婆家那鍋的顏色是偏琥珀的，不是黑的。後來問我媽才知道，\`她從來沒放過醬油膏，是用冰糖先炒糖色\`。

糖色這步驟很折磨人。火太小炒不出來，火太大瞬間就苦掉，中間那個窗口大概只有二十秒。我前三次全部苦掉，整鍋倒掉。

第七次終於對了。起鍋那個味道一飄出來我就知道成了，跟小時候放學回家推開門聞到的一模一樣。

站在瓦斯爐前面有點想哭，好像把一個已經不在的人找回來一點點。

#料理 #家常菜 #台南`,
    mins: 195,
    likes: 156,
  },
  {
    id: 'p_3',
    authorId: 'u_chen',
    title: '關於「這個功能很簡單，明天就能做完吧？」',
    body: `每次聽到這句話，我心裡都會出現一張很長的清單。

以「加一個按鈕讓使用者刪除留言」為例，實際要處理的是：

誰有權限刪？本人可以，那管理員呢？被刪的留言底下如果有回覆怎麼辦？是真的刪掉還是標記為已刪除？如果真的刪掉，那通知裡面已經發出去的連結點進去要看到什麼？如果標記為已刪除，資料庫要不要清？多久清一次？刪除要不要可以反悔？

\`按鈕本身確實五分鐘就寫完了，剩下的三天都在處理「然後呢」\`。

我不是在抱怨。我只是想說，工程師講「這要三天」的時候，通常不是在偷懶，是他已經在腦袋裡跑過上面那一整串了。

#軟體工程 #工作`,
    mins: 380,
    likes: 203,
    liked: true,
  },
  {
    id: 'p_4',
    authorId: 'u_huang',
    title: '在舊書店找到一本 1978 年的植物圖鑑',
    body: `牯嶺街，一百五十塊。

書況其實不太好，封面有水漬，內頁泛黃到接近焦糖色。但裡面的手繪圖真的美到不行 —— 那個年代還沒有電腦繪圖，每一張都是實實在在畫出來的，葉脈一條一條。

最讓我停下來的是扉頁有前一個主人的字跡，寫著「贈 淑芬 民國六十九年春」。

\`一本書在被我買到之前，已經先當過一次禮物了\`。

我在想那個淑芬後來去了哪裡，這本書又是怎麼流回書店的。可能她搬家了，可能她不在了，可能只是單純覺得用不到。

總之現在它在我桌上。我會好好用它。

#舊書 #插畫 #牯嶺街`,
    mins: 640,
    likes: 89,
  },
  {
    id: 'p_5',
    authorId: 'u_tsai',
    title: '我把家裡的電費做成儀表板之後，冷氣費少了三成',
    body: `起因是我一直覺得台電帳單是黑箱。

兩個月才一張，來的時候錢已經花掉了，你根本不知道是哪天用掉的。所以我裝了一個電流感測器夾在總開關上，資料丟進資料庫，每分鐘一筆。

跑了兩個禮拜之後看圖表，發現一件我完全沒想到的事 —— \`真正的吃電怪獸不是冷氣開的時候，是冷氣「快要達到設定溫度」的那段時間\`，壓縮機會瘋狂啟停，那個曲線很醜。

後來我把設定溫度從 24 調到 26，再加一台循環扇。體感其實差不多，但曲線平順很多，電費直接掉三成。

資料這東西就是這樣。你以為你知道，看了圖才發現你不知道。

#資料視覺化 #自架 #生活`,
    mins: 1120,
    likes: 312,
  },
  {
    id: 'p_6',
    authorId: 'u_wu',
    title: '日文學到 N4 才發現，我一直在用中文的腦袋背日文',
    body: `這件事困擾我很久。

我單字背超快，因為漢字看得懂嘛。但一到聽力就整個崩掉，別人講一句話我要在腦袋裡先翻成中文，翻完對方已經講到下一句了。

上禮拜老師講了一句話點醒我：\`你不是在學日文，你是在學「日文翻中文」\`。

她要我做一個練習 —— 看到「水」的時候不要想「水」，直接想那個透明的、會流動的東西。中間那層中文要拿掉。

超級難。但練了一個禮拜，真的有一點感覺了。

#日文 #學習 #N4`,
    mins: 1580,
    likes: 67,
  },
  {
    id: 'p_7',
    authorId: 'u_me',
    title: '寫給三年前那個決定重考的自己',
    body: `那年你二十五歲，在工廠排班，晚上回租屋處打開筆電看程式教學看到睡著。

你那時候最怕的不是考不上，是\`怕別人覺得你這個年紀還在幹這種事很好笑\`。

我想跟你說，沒有人在笑。真的。你以為全世界都在看你，其實大家都在忙自己的事。

還有一件事 —— 你會發現工廠那四年不是浪費掉的。你在產線上養成的那種「先想清楚再動手」的習慣，後來變成你寫程式最大的優勢。你的同學很多都比你會寫，但很少人像你一樣，動手前會先把整件事情在腦袋裡跑一遍。

慢一點沒關係。#自我對話`,
    mins: 2400,
    editedMins: 1800,
    likes: 428,
    liked: true,
  },
  {
    id: 'p_8',
    authorId: 'u_hsu',
    title: '底片沒有死，只是變貴了',
    body: `十年前一捲 Kodak Gold 一百二，現在四百五。

常有人問我為什麼還在拍。數位又快又免費，還可以連拍三十張挑一張。

我的答案是：\`就是因為不能連拍三十張\`。

一捲三十六張，一張成本十幾塊。你按下去之前會想。會等光。會為了一張照片站在原地十分鐘。那個「想」的過程，才是我要的東西。

數位讓我變得很隨便。底片逼我認真。

#攝影 #底片`,
    mins: 3200,
    likes: 178,
  },
]

export const POSTS: Post[] = POST_SEEDS.map((s) => {
  const author = userById(s.authorId)
  const createdAt = ago(s.mins)
  const updatedAt = s.editedMins ? ago(s.editedMins) : createdAt
  return {
    id: s.id,
    author,
    title: s.title,
    body: s.body,
    tags: [],
    coverUrl: null,
    createdAt,
    updatedAt,
    edited: Boolean(s.editedMins),
    likeCount: s.likes,
    commentCount: 0,
    likedByMe: Boolean(s.liked),
    isMine: s.authorId === ME.id,
  }
})

// ---------------------------------------------------------------- 留言

const COMMENT_SEEDS: Array<[string, string, string, number]> = [
  ['p_1', 'u_chen', '這個查字典的比喻超好懂，我要拿去跟我同事解釋。', 30],
  ['p_1', 'u_tsai', '補充一下，多頭注意力就是同時查好幾本不同的字典 😂', 22],
  ['p_1', 'u_wu', '看不懂但覺得很厲害（認真', 12],
  ['p_2', 'u_yeh', '糖色真的是魔王關，我也失敗過無數次。火轉小一點會好一些。', 150],
  ['p_2', 'u_me', '看到最後一段鼻酸。', 120],
  ['p_2', 'u_huang', '好想吃 😭', 88],
  ['p_3', 'u_me', '「按鈕本身五分鐘寫完，剩下三天在處理然後呢」— 這句我要印出來貼在牆上。', 300],
  ['p_3', 'u_tsai', '尤其是「已經發出去的通知點進去要看到什麼」這個，超多人會漏掉。', 280],
  ['p_4', 'u_wu', '牯嶺街我上次去也挖到寶，那邊真的很危險（對錢包）', 500],
  ['p_5', 'u_chen', '想問感測器是用哪一款？我也想弄一套。', 900],
  ['p_5', 'u_me', '這個「以為自己知道，看了圖才發現不知道」講得真好。', 850],
  ['p_7', 'u_lin', '謝謝你寫這篇。我今年二十九，正在猶豫要不要轉行。', 2000],
  ['p_7', 'u_huang', '慢一點沒關係 ❤️', 1900],
  ['p_8', 'u_huang', '底片的顆粒感真的是數位模擬不來的。', 3000],
]

export const COMMENTS: Comment[] = COMMENT_SEEDS.map(([postId, authorId, body, mins], i) => ({
  id: `c_${i + 1}`,
  postId,
  author: userById(authorId),
  body,
  createdAt: ago(mins),
  isMine: authorId === ME.id,
}))

// 回填每篇的留言數
for (const post of POSTS) {
  post.commentCount = COMMENTS.filter((c) => c.postId === post.id).length
}

// ---------------------------------------------------------------- 聊天

export const MESSAGES: Message[] = []

const mkMsg = (convId: string, senderId: string, body: string, mins: number): Message => {
  const m: Message = {
    id: `m_${MESSAGES.length + 1}`,
    conversationId: convId,
    sender: userById(senderId),
    body,
    createdAt: ago(mins),
    isMine: senderId === ME.id,
  }
  MESSAGES.push(m)
  return m
}

mkMsg('cv_lin', 'u_lin', '欸你那篇 attention 我看完了', 90)
mkMsg('cv_lin', 'u_me', '哈哈有看懂嗎', 88)
mkMsg('cv_lin', 'u_lin', '大概六成吧 後面矩陣那段我跳過了', 87)
mkMsg('cv_lin', 'u_lin', '不過查字典那個比喻真的很好', 86)
mkMsg('cv_lin', 'u_me', '那就夠了 我寫的時候就是想讓沒背景的人也能看懂', 84)
mkMsg('cv_lin', 'u_lin', '對了 下禮拜六有空嗎 想約爬山', 15)

mkMsg('cv_chen', 'u_chen', '那個 API 我改好了 你 pull 一下', 240)
mkMsg('cv_chen', 'u_me', '收到 我晚點看', 238)
mkMsg('cv_chen', 'u_chen', '順便問一下 你們前端是用 cursor 分頁還是 offset？', 200)
mkMsg('cv_chen', 'u_me', 'cursor 無限捲動用 offset 會有重複資料的問題', 198)
mkMsg('cv_chen', 'u_chen', '好 那我這邊改成回傳 nextCursor', 195)

mkMsg('cv_group', 'u_tsai', '這週五的聚會地點決定了嗎', 320)
mkMsg('cv_group', 'u_huang', '我投中山站那間', 315)
mkMsg('cv_group', 'u_chen', '+1 那間有插座', 310)
mkMsg('cv_group', 'u_me', '好 那就那間 我來訂位', 305)
mkMsg('cv_group', 'u_tsai', '感謝 🙏', 300)
mkMsg('cv_group', 'u_huang', '訂幾點？', 45)

const lastOf = (convId: string) =>
  [...MESSAGES].filter((m) => m.conversationId === convId).pop() ?? null

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'cv_lin',
    kind: 'direct',
    name: '林宇涵',
    avatarUrl: null,
    members: [ME, userById('u_lin')],
    ownerId: null,
    lastMessage: lastOf('cv_lin'),
    unreadCount: 1,
    updatedAt: ago(15),
  },
  {
    id: 'cv_group',
    kind: 'group',
    name: '週五那攤',
    avatarUrl: null,
    members: [ME, userById('u_tsai'), userById('u_huang'), userById('u_chen')],
    ownerId: ME.id,
    lastMessage: lastOf('cv_group'),
    unreadCount: 1,
    updatedAt: ago(45),
  },
  {
    id: 'cv_chen',
    kind: 'direct',
    name: '陳威廷',
    avatarUrl: null,
    members: [ME, userById('u_chen')],
    ownerId: null,
    lastMessage: lastOf('cv_chen'),
    unreadCount: 0,
    updatedAt: ago(195),
  },
]

// ---------------------------------------------------------------- 通知

export const NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n_1',
    kind: 'friend_request',
    actor: userById('u_wu'),
    href: '/friends',
    preview: '想加你為好友',
    read: false,
    createdAt: ago(25),
  },
  {
    id: 'n_2',
    kind: 'post_commented',
    actor: userById('u_chen'),
    href: '/post/p_1',
    preview: '這個查字典的比喻超好懂，我要拿去跟我同事解釋。',
    read: false,
    createdAt: ago(30),
  },
  {
    id: 'n_3',
    kind: 'post_liked',
    actor: userById('u_tsai'),
    href: '/post/p_1',
    preview: '喜歡你的〈我終於搞懂 Attention 在幹嘛了〉',
    read: true,
    createdAt: ago(35),
  },
  {
    id: 'n_4',
    kind: 'post_commented',
    actor: userById('u_lin'),
    href: '/post/p_7',
    preview: '謝謝你寫這篇。我今年二十九，正在猶豫要不要轉行。',
    read: true,
    createdAt: ago(2000),
  },
]
