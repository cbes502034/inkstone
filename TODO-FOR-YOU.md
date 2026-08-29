# 需要你處理的事項

我做不了或不該替你做的部分，集中在這裡。按重要性排序。

---

## 一、必須做（上線前）

### 1. 重設 Supabase 資料庫密碼

**為什麼：** 兩組密碼已經外洩 —— 出現在我們的對話紀錄，其中一組還進了 Render 的部署日誌。

**怎麼做：**
1. Supabase → Settings → Database → **Reset database password**
2. 產生新密碼時**只用英文字母和數字**（長度 32 位就很安全）
3. Connect → **Session pooler** → 複製完整字串
4. Render → `inkstone-api` → Environment → 更新 `DATABASE_URL`

> 密碼含 `@ % ( ) + =` 這類字元程式都能處理，但純英數可以避開所有貼上與轉義的問題。

---

## 二、建議做（影響體驗）

### 2. 設定服務保溫，減少冷啟動

**問題：** Render 免費方案閒置 15 分鐘就休眠，下一位訪客要等 **30~50 秒**才看到畫面。真實使用者不會等。

**怎麼做（免費）：**
1. 註冊 <https://uptimerobot.com>
2. 新增 Monitor：
   - Type: **HTTP(s)**
   - URL: `https://inkstone-api-kbhs.onrender.com/health`
   - Interval: **5 分鐘**
3. 前端是靜態站不會休眠，不用設

> 這只能減少機率，無法根治。根治要升級 Render 付費方案（約 $7/月）。

### 3. 檢查驗證信有沒有進垃圾信匣

用 Gmail 以外的信箱（Outlook、Yahoo）各註冊一次，確認信件不會被歸類為垃圾郵件。

如果會，要在 Brevo 設定 DKIM／SPF —— 但那需要自有網域，目前沒有的話只能先接受。

---

## 三、選填（解鎖更多功能）

### 4. Hugging Face Token — 讓 AI 接真模型

**現況：** AI 寫作助手走本機樣板，流程完整但產出是固定結構的文字。

**怎麼做：**
1. <https://huggingface.co/settings/tokens> → New token → 選 **Read** 權限
2. Render → `inkstone-api` → Environment → 新增 `HF_TOKEN`

填好之後 `/health` 的 `ai` 欄位會從 `local` 變成 `huggingface`。

### 5. Upstash Redis — 多台機器時才需要

**現況：** AI 對話暫存放在程序記憶體，單一 instance 完全夠用。

只有在 Render 開多台 instance 時才需要，現在不用管。

<https://upstash.com> 註冊後把 `rediss://` 開頭的網址填進 `REDIS_URL`。

### 6. 法律頁面請人看過

我寫了[服務條款](https://inkstone-web.onrender.com/terms)與[隱私權政策](https://inkstone-web.onrender.com/privacy)，
內容涵蓋個資法第 8 條要求的告知事項。

**但我不是律師。** 正式對外營運前建議請專業看過，尤其之後如果加入金流、
或有未成年使用者的情況。

---

## 四、我已經處理好的（不用你動）

- 資料庫連線、migration、Supabase pooler 設定
- 寄信通道（Brevo HTTPS API）
- 前後端部署與環境變數
- WebSocket 即時推送
- 所有程式碼層面的設定與防護

---

## 怎麼確認設定生效

打這一支就知道，不用翻日誌：

```
https://inkstone-api-kbhs.onrender.com/health
```

回應長這樣：

```json
{
  "status": "ok",
  "env": "prod",
  "email": "brevo",       // none 代表寄不出信
  "database": "postgres", // sqlite 代表設定有問題
  "redis": false,         // 目前不需要
  "ai": "local"           // 填了 HF_TOKEN 會變 huggingface
}
```
