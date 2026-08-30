# 需要你處理的事項（含逐步教學）

我做不了或不該替你做的部分。按重要性排序，每一項都有完整步驟。

---

## ① 重設 Supabase 資料庫密碼 ⚠️ 必做

### 為什麼

兩組密碼已經外洩 —— 出現在我們的對話紀錄，其中一組還進了 Render 的部署日誌。
拿到那組密碼的人可以直接連你的資料庫，讀寫所有使用者資料。

### 步驟

**第 1 步：產生新密碼**

1. 開 <https://supabase.com/dashboard>
2. 點進 `inkstone` 專案
3. 左側選單最下方 **Settings**（齒輪圖示）
4. 點 **Database**
5. 找到 **Database password** 區塊 → 點 **Reset database password**
6. 有兩個選擇：
   - **Generate a password**：Supabase 自動產生（含特殊字元）
   - 自己輸入：**建議這個**，用 32 位純英數字

   > 為什麼建議純英數：密碼含 `@ % ( ) +` 這些字元時，
   > 貼到各種設定介面容易出錯。程式雖然能處理，但少一個踩坑點比較好。
   >
   > 產生方式：可以用瀏覽器 F12 開 Console 貼這行
   > ```js
   > Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b=>'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%56]).join('')
   > ```

7. **先把新密碼複製起來貼在記事本** —— 這個視窗關掉就看不到了
8. 按 **Reset password**

**第 2 步：取得新的連線字串**

1. 回到專案首頁，點上方的 **Connect** 按鈕
2. 上方有幾個分頁，**點「Session pooler」**
   > ⚠️ 不要用 Direct connection —— 它只有 IPv6，Render 免費方案連不上
3. 複製整串（會長這樣）：
   ```
   postgresql://postgres.ckxbuybygctpwgbdjfxk:[YOUR-PASSWORD]@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres
   ```
4. 把 `[YOUR-PASSWORD]` 換成第 1 步的新密碼（含中括號一起換掉）

**第 3 步：更新 Render**

1. 開 <https://dashboard.render.com>
2. 點 **inkstone-api**
3. 左側選單 **Environment**
4. 找到 `DATABASE_URL` → 按上方的 **Edit**
5. 把值欄位**全選清空**，貼上新字串
6. 按下方 **Save, rebuild, and deploy**

**第 4 步：確認成功**

等約 2 分鐘後開這個網址：

<https://inkstone-api-kbhs.onrender.com/health>

看到 `"database": "postgres"` 就成功了。

---

## ② 設定服務保溫（減少冷啟動）建議做

### 為什麼

Render 免費方案閒置 15 分鐘就休眠，下一位訪客要等 **30~50 秒**才看到畫面。
真實使用者不會等這麼久，多半直接關掉。

定時打一下 API 就能讓它保持清醒。

### 步驟

1. 開 <https://uptimerobot.com> → **Register for FREE**
2. 用信箱註冊，收信驗證
3. 登入後點 **+ New monitor**
4. 這樣填：

   | 欄位 | 填什麼 |
   |---|---|
   | Monitor Type | **HTTP(s)** |
   | Friendly Name | `inkstone-api` |
   | URL | `https://inkstone-api-kbhs.onrender.com/health` |
   | Monitoring Interval | **5 minutes** |

5. 下方 **Create Monitor**

**確認：** 幾分鐘後回到 UptimeRobot 首頁，該筆會顯示綠色的 **Up**。

> 這只能減少冷啟動的機率，不能根治 —— Render 有每月 750 小時的免費額度，
> 一直保溫會用得比較快。要根治得升級付費方案（約 $7/月）。

---

## ③ 測試信件會不會進垃圾信匣 建議做

### 為什麼

現在的寄件信箱是 `cbes502034@gmail.com`，但實際是透過 Brevo 的伺服器寄出的。
收件方的信箱可能認為「寄件地址與寄送伺服器不符」而判定為垃圾郵件。

Gmail 寄給 Gmail 通常沒問題，但別的信箱不一定。

### 步驟

1. 用 Outlook / Yahoo / 或朋友的信箱，到
   <https://inkstone-web.onrender.com/register> 註冊
2. 檢查信件進了收件匣還是垃圾信匣

**如果進了垃圾信匣：**

短期沒有好解法 —— 根治要設定 DKIM／SPF，那需要**自有網域**。
如果之後買了網域（一年約 300~500 元），到 Brevo 的
**Senders, Domains & IPs → Domains** 照指示設定 DNS 就能解決。

---

## ④ Hugging Face Token — 讓 AI 接真模型 選填

### 現況

AI 寫作助手目前走本機樣板：流程完整、防護機制都在運作，
但產出是固定結構的文字，不是真的模型生成。

### 步驟

1. 開 <https://huggingface.co> → 註冊（免費）
2. 右上角頭像 → **Settings**
3. 左側 **Access Tokens**
4. **+ Create new token**
5. 這樣填：
   - Token type：**Read**
   - Name：`inkstone`
6. **Create token** → **複製那串**（`hf_` 開頭，關掉就看不到了）
7. Render → **inkstone-api** → **Environment** → **Edit**
8. 最下方 **+ Add Environment Variable**
   - Key：`HF_TOKEN`
   - Value：貼上剛才的 token
9. **Save, rebuild, and deploy**

**確認：** <https://inkstone-api-kbhs.onrender.com/health>
的 `ai` 欄位會從 `local` 變成 `huggingface`。

---

## ⑤ Upstash Redis 選填，目前不需要

只有在 Render 開**多台 instance** 時才需要。現在單一台，
AI 對話暫存放程序記憶體完全夠用。

之後真的需要時：<https://upstash.com> 註冊 → 建立 Redis →
複製 `rediss://` 開頭的網址 → 填進 Render 的 `REDIS_URL`。

---

## ⑥ 法律頁面請專業看過 選填

我寫的[服務條款](https://inkstone-web.onrender.com/terms)與
[隱私權政策](https://inkstone-web.onrender.com/privacy)涵蓋個資法第 8 條
要求的告知事項，但**我不是律師**。

正式對外營運前建議請專業看過，尤其之後如果：
- 加入金流
- 有未成年使用者
- 開始做行銷郵件

---

## 怎麼確認設定有沒有生效

打這一支，不用翻日誌：

<https://inkstone-api-kbhs.onrender.com/health>

```json
{
  "status": "ok",
  "env": "prod",
  "email": "brevo",       // none = 寄不出信
  "database": "postgres", // sqlite = 設定有問題
  "redis": false,         // 目前不需要
  "ai": "local"           // 填了 HF_TOKEN 會變 huggingface
}
```

---

## 我已經處理好的（不用你動）

- 資料庫連線、migration、Supabase pooler 設定
- 寄信通道（Brevo HTTPS API）
- 前後端部署、環境變數、路由設定
- WebSocket 即時推送（通知、訊息、上線狀態）
- 所有程式碼層面的安全防護

---

## 常見問題

**Q：改了環境變數之後要做什麼？**
A：按 **Save, rebuild, and deploy** 之後 Render 會自動重新部署，
等 2~3 分鐘就好。不用手動重啟。

**Q：部署失敗怎麼看原因？**
A：Render → inkstone-api → **Events** 分頁，
會顯示 `Deploy failed` 與簡短原因。要看細節點進該次 deploy 的 **Logs**。

**Q：怎麼知道現在線上跑的是哪一版？**
A：Render → inkstone-api 首頁，服務名稱下方會顯示 commit 的短碼。
