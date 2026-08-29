# 硯 Inkstone

一個寫字的地方 —— 部落格 + 社群，內建受限範圍的 AI 寫作助手。

目前進度：**前端完成（接 mock 資料）**，後端尚未開始。

---

## 開發

```bash
npm install
npm run dev
```

開發站台在 <http://localhost:5173>。登入頁帳密隨便填即可進入（目前走 mock）。

---

## 這個專案長什麼樣子

```
src/
├── lib/
│   ├── api.ts        # API 客戶端。每支函式都對應一個 REST 端點，
│   │                 # 註解裡的 HTTP 動詞 + 路徑就是後端要實作的規格
│   ├── markup.ts     # 自訂文章語法的 tokenizer（前後端共用同一套規則）
│   ├── presence.ts   # 上線狀態頻道，之後換成 WebSocket
│   ├── image.ts      # 頭像上傳前的裁切壓縮
│   └── mock/seed.ts  # 展示用假資料
├── components/       # 共用元件
├── pages/            # 各頁面
├── store/auth.ts     # 登入狀態
└── types.ts          # 領域模型，與 API 回應形狀一一對應
```

`lib/api.ts` 是前後端的接縫。後端做好之後只要把裡面的實作換成 `fetch`，
頁面一行都不用改。

---

## 自訂文章語法

刻意不沿用標準 Markdown（在 Markdown 裡反引號是行內程式碼、井字號是標題，
語意與這裡相反），所以自己寫了 tokenizer。

| 寫法 | 結果 |
|---|---|
| `` `文字` `` | 粗體 |
| `#標籤` | 印泥色的可點擊標籤，點下去跳到搜尋頁並自動帶入文字 |

未配對的反引號、單獨的 `#` 都會原樣顯示，不會吃掉使用者的字。
渲染走 React 節點而非 `innerHTML`，使用者貼進來的 HTML 只會被當純文字，天然防 XSS。

---

## AI 寫作助手

範圍限制不是只靠一句 system prompt —— 那擋不住誘導。實作是兩層：

1. **輸入端分類**：送進生成模型前先判斷是否搗亂／離題，是的話直接回善意提醒，不消耗生成資源
2. **輸出端複查**：生成完再檢查一次，不過關就重來

對話暫存在 Redis 並設 TTL，不落地資料庫。使用者按「就是這個」→ 內容進編輯器、
暫存清空、面板關閉。

模型全部走 Hugging Face（見下方待辦）。

---

## 設計

紙（背景）／墨（文字）／印泥（主色）三色構成，走編輯排版路線，
刻意避開漸層、玻璃霧面與藍紫色系。深色模式用暖調炭黑而非藍黑，維持紙墨的溫度。

Mobile-first：社群流量多半在手機，先把手機版做好再往上放大。

---

## 待辦（後端）

- [ ] FastAPI + PostgreSQL（Supabase），schema 與 migration
- [ ] JWT 驗證：access token 存記憶體、refresh token 存 httpOnly cookie
      （目前 mock 階段暫存 localStorage，接後端時必須改掉）
- [ ] 每個修改類端點都要驗 `owner_id == 登入者` —— 前端隱藏按鈕擋不住直接打 API
- [ ] WebSocket：聊天、通知、上線狀態
- [ ] Hugging Face 推論服務 + 兩層內容過濾
- [ ] 檢舉／封鎖機制、服務條款與隱私權政策
- [ ] 速率限制（防洗讚、洗留言）
"# inkstone" 
