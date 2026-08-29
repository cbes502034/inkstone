# 部署到 Render（免費方案）

## 先說結論：部署失敗最常見的三個原因

### 1. Supabase 直連位址在 Render 免費方案連不上

Supabase 的直連 `db.<ref>.supabase.co` 現在是 **IPv6-only**，
而 Render 免費方案沒有 IPv4 以外的對外連線。用直連一定失敗。

**要用 connection pooler。** 到 Supabase → 專案 → **Connect** →
選 **Session pooler**，字串長這樣：

```
postgresql://postgres.<專案ref>:<密碼>@aws-0-<區域>.pooler.supabase.com:5432/postgres
```

注意使用者名稱是 `postgres.<專案ref>`，不是單純的 `postgres`。

> 程式已經會自動把 `postgresql://` 補成 `postgresql+asyncpg://`，
> 你直接貼 Supabase 給的字串就好，不用手動改。

### 2. 建置階段跑 migration

原本把 `alembic upgrade head` 放在 `buildCommand`，
但建置環境的環境變數不保證已就緒，而且建置階段本來就不該連生產資料庫。
現在已移到 `startCommand`。

### 3. Transaction pooler 的 prepared statement 問題

如果用 6543 埠（Transaction 模式），asyncpg 的 prepared statement 快取會失效，
出現 `prepared statement _asyncpg_xx does not exist`。
程式已自動偵測並關掉快取，不需要手動處理。

---

## 步驟

### 一、Supabase

1. 建立專案（免費，不用信用卡）
2. **Connect** → **Session pooler** → 複製連線字串
3. 把 `[YOUR-PASSWORD]` 換成你的資料庫密碼

密碼只填進 Render 後台，不要寫進任何檔案。

### 二、Render 後端

Render → New → **Blueprint** → 選這個 repo，它會讀 `render.yaml`。

接著在 `inkstone-api` 的 **Environment** 填入：

| 變數 | 值 |
|---|---|
| `DATABASE_URL` | 上一步的 pooler 連線字串 |
| `CORS_ORIGINS` | 前端網址，例如 `https://inkstone-web.onrender.com` |
| `REDIS_URL` | 先留空也能跑（退回程序內記憶體） |
| `HF_TOKEN` | 先留空也能跑（AI 走本機樣板） |

`JWT_SECRET` 由 Render 自動產生，不用填。

### 三、Render 前端

在 `inkstone-web` 的 **Environment** 填入：

| 變數 | 值 |
|---|---|
| `VITE_API_BASE_URL` | 後端網址 + `/api/v1`，例如 `https://inkstone-api.onrender.com/api/v1` |

前後端網址互相引用，所以第一次部署會有雞生蛋問題：
先部署完拿到網址，再回頭把兩邊的變數補上，重新部署一次。

### 四、確認

```
https://<後端網址>/health
```

回 `{"status":"ok","env":"prod"}` 就成功了。

---

## 免費方案的限制（上線前要知道）

**後端會休眠。** 閒置 15 分鐘後停止，下一個請求要等 30~50 秒喚醒。
真實使用者不會等這麼久。可行的緩解：

- 用 UptimeRobot（免費）每 10 分鐘打一次 `/health` 保溫
- 前端在冷啟動期間顯示合理的等待狀態，而不是空白畫面
- 流量穩定後升級成付費方案（$7/月起），這是唯一的根治方式

**其他上限：** Supabase 免費方案 500MB 資料庫、1GB 檔案儲存；
Render 免費方案每月 750 小時。以 MVP 驗證來說足夠。

---

## 部署失敗時怎麼查

Render 的 **Logs** 分成 Build 與 Deploy 兩段，要看清楚是哪一段失敗：

- **Build 失敗** → 通常是 `requirements.txt` 或 Python 版本問題
- **Deploy/Start 失敗** → 通常是資料庫連不上（見上方第 1 點），
  或 `alembic upgrade head` 出錯
- **服務起來但 API 回 500** → 看 Logs 裡的例外堆疊
- **前端能開但打 API 失敗** → 多半是 `CORS_ORIGINS` 沒填對，
  或 `VITE_API_BASE_URL` 少了 `/api/v1`
