# Friends World

一個寫字的地方 —— 部落格 + 社群，內建受限範圍的 AI 寫作助手。

前後端都已完成並上線。

- 前端 <https://inkstone-web.onrender.com>
- 後端 <https://inkstone-api-kbhs.onrender.com/docs>（互動式 API 文件）

> **想看懂原始碼？** 從 [`docs/00-讀碼指南.md`](docs/00-讀碼指南.md) 開始。
> 那份文件把整個專案拆成十二課，依相依順序排列 —— 由地基往上讀，
> 每打開一個檔案，它用到的東西你都已經認識了。

---

## 跑起來

**前端**

```bash
npm install
npm run dev
```

開發站台在 <http://localhost:5173>。

**後端**

```bash
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

預設用 SQLite，**不需要先申請任何帳號**。互動文件在 <http://localhost:8000/docs>。

驗證主要流程：

```bash
cd backend && .venv/Scripts/python.exe smoke_test.py
```

---

## 專案結構

```
├── src/                  前端（React 19 + Vite + TypeScript + Tailwind v4）
│   ├── lib/              與畫面無關的邏輯
│   │   ├── http.ts       fetch 包裝：自動帶 token、401 自動續期
│   │   ├── api.ts        每支函式對應一個 REST 端點
│   │   ├── realtime.ts   WebSocket：通知、訊息、上線狀態
│   │   ├── markup.ts     自訂文章語法的 tokenizer（與後端同一套規則）
│   │   ├── push.ts       Web Push 訂閱
│   │   └── …
│   ├── components/       共用元件（含 StarField 星空背景）
│   ├── pages/            各頁面
│   ├── store/auth.ts     登入狀態
│   └── types.ts          領域模型，與後端 schemas 一一對應
│
├── backend/app/          後端（FastAPI + SQLAlchemy async + PostgreSQL）
│   ├── main.py           建立 app、CORS、統一錯誤格式
│   ├── api/v1/
│   │   ├── router.py     各資源的 APIRouter 集中掛載
│   │   └── endpoints/    一個資源一個檔案，只處理 HTTP
│   ├── services/         商業邏輯。端點薄、邏輯集中在這層
│   ├── models/           SQLAlchemy ORM
│   ├── schemas/          Pydantic DTO，形狀對應前端 types.ts
│   ├── core/             設定、JWT 與 argon2id、共用依賴
│   ├── db/               engine、session、Base
│   └── utils/markup.py   自訂語法解析（與前端同一套規則）
│
└── docs/                 讀碼指南（依相依順序編排的課程）
```

加一個資源只需要：`endpoints/` 新增檔案 → 在 `router.py` 掛上去。
`main.py` 永遠不用動。

---

## 功能

| | |
|---|---|
| 帳號 | 兩段式註冊（信箱驗證後才建立帳號）、忘記密碼、改密碼會讓所有裝置登出 |
| 文章 | 發布／編輯／刪除、自訂語法、標籤、封面、按讚、看誰按讚、留言 |
| 社群 | 加好友、搜尋使用者、封鎖、檢舉、個人頁 |
| 訊息 | 一對一與群組聊天、群主可改名與增刪成員、已讀位置、輸入中提示 |
| 即時 | WebSocket 推送通知與訊息、上線狀態、通知音效 |
| 離線 | Web Push —— 瀏覽器整個關掉也收得到 |
| AI | 寫作助手，兩層內容過濾，對話暫存 Redis 不落地 |
| 外觀 | 日／夜雙主題的動態星空、蝴蝶、光芒、雲朵游標軌跡 |

---

## 自訂文章語法

刻意不沿用標準 Markdown（在 Markdown 裡反引號是行內程式碼、井字號是標題，
語意與這裡相反），所以自己寫了 tokenizer。

| 寫法 | 結果 |
|---|---|
| `` `文字` `` | 粗體 |
| `#標籤` | 可點擊的標籤，點下去跳到搜尋頁並自動帶入文字 |

未配對的反引號、單獨的 `#` 都會原樣顯示，不會吃掉使用者的字。
渲染走 React 節點而非 `innerHTML`，使用者貼進來的 HTML 只會被當純文字，天然防 XSS。

---

## AI 寫作助手

範圍限制不是只靠一句 system prompt —— 那擋不住誘導。實作是兩層：

1. **輸入端分類**：送進生成模型前先判斷是否搗亂／離題，是的話直接回善意提醒，
   不消耗生成資源
2. **輸出端複查**：生成完再檢查一次，不過關就重來

對話暫存在 Redis 並設 TTL，不落地資料庫。使用者按「就是這個」→ 內容進編輯器、
暫存清空、面板關閉。模型走 Hugging Face 的推論路由。

---

## 設計上的幾個決定

**權限一律在後端驗。** 前端隱藏編輯鈕只是體驗，擋不住直接打 API。
每支寫入端點都會檢查 `owner_id == 登入者`；聊天則是先確認呼叫者是對話成員，
不是成員一律回 404 而非 403 —— 403 等於告訴對方「這個對話存在」。

**帳號列舉的防範。** 註冊撞名與登入失敗都回統一訊息，
不透露「這個帳號存在但密碼錯」。

**時間一律 UTC-aware。** SQLite 沒有原生時區，存進去的 tzinfo 會掉。
自訂的 `UtcDateTime` 型別在讀寫兩端補上 UTC，兩種資料庫行為一致。

**分頁用游標不用 offset。** 使用者在捲動時若有人發新文章，
offset 會讓同一篇重複出現。

**改密碼用整數世代作廢 token，不用時間界線。** JWT 的 `iat` 只精確到秒，
時間界線會在「剛改完密碼就登入」時把新 token 一起誤殺。
詳見 [`docs/01-資料層.md`](docs/01-資料層.md)。

**視覺是內容的一部分。** 星空、蝴蝶、光芒不因系統的「減少動態效果」而關閉 ——
那個設定原本會讓整個畫面靜止，使用者只會以為網站壞了。
要照顧前庭敏感的訪客，正確做法是站內自己的開關，讓人自己選。

---

## 外觀

日夜雙主題。夜間是深藍紫的星空，有會呼吸的星星、隨機生成的星座、
流星與蝴蝶；日間是有雲的藍天，太陽的光暈射出光芒，偶爾閃過鏡頭光斑。
兩者都在 `src/components/StarField.tsx` 裡，用 Canvas 2D 畫。

Mobile-first：社群流量多半在手機，先把手機版做好再往上放大。

---

## 部署

Render（前端靜態站 + 後端 Web Service）、Supabase（PostgreSQL）、
Upstash（Redis）、Brevo（寄信）。設定在 [`render.yaml`](render.yaml)，
踩過的坑與逐步教學在 [`DEPLOY.md`](DEPLOY.md)。

還需要你手動處理的事項在 [`TODO-FOR-YOU.md`](TODO-FOR-YOU.md)。
