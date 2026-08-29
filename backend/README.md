# 硯 Inkstone — 後端

FastAPI + SQLAlchemy(async) + PostgreSQL。

## 跑起來

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
cp .env.example .env
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

預設用 SQLite，**不需要先申請任何帳號**。互動文件在 <http://localhost:8000/docs>。

驗證主要流程：

```bash
.venv/Scripts/python.exe smoke_test.py
```

## 結構

```
app/
├── main.py              # 建立 app、CORS、統一錯誤格式
├── api/v1/
│   ├── router.py        # 各資源的 APIRouter 集中掛載
│   └── endpoints/       # 一個資源一個檔案，只處理 HTTP
├── services/            # 商業邏輯。端點薄、邏輯集中在這層
├── models/              # SQLAlchemy ORM
├── schemas/             # Pydantic DTO，形狀對應前端 types.ts
├── core/
│   ├── config.py        # 設定，全部來自環境變數
│   ├── security.py      # JWT 與 argon2id
│   └── deps.py          # get_current_user 等共用依賴
├── db/                  # engine、session、Base
└── utils/markup.py      # 自訂語法解析（與前端同一套規則）
```

加一個資源只需要：`endpoints/` 新增檔案 → 在 `router.py` 掛上去。`main.py` 永遠不用動。

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

**AI 對話存 Redis 並設 TTL，不落地資料庫。** 對應產品上「聊完就忘」的設計，
也少留一份使用者內容。

## 換到正式環境

```bash
ENV=prod
DATABASE_URL=postgresql+asyncpg://postgres:<password>@<host>:5432/postgres
JWT_SECRET=<python -c "import secrets;print(secrets.token_urlsafe(48))">
CORS_ORIGINS=https://<你的前端網址>
REDIS_URL=rediss://default:<password>@<host>:6379
HF_TOKEN=hf_xxx
```

資料表用 migration 建立，不靠啟動時自動建表：

```bash
.venv/Scripts/python.exe -m alembic upgrade head
```

## 還沒做

- [ ] WebSocket：聊天、通知、上線狀態即時推送（目前靠輪詢與心跳）
- [ ] 登出後 token 立即失效（需要 Redis 撤銷名單）
- [ ] Email 驗證信與忘記密碼
- [ ] 頭像改存物件儲存，目前是 data URL 存在欄位裡
- [ ] 全文檢索（現在的 LIKE 走不到索引，資料量大會慢）
- [ ] 檢舉的後台處理介面
