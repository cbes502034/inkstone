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

## ② 服務保溫 ✅ 已經幫你做好了

Render 免費方案閒置約 15 分鐘會休眠，下一個訪客要等它整個開機 ——
看到的是一個轉很久的空白畫面。

倉庫裡加了 `.github/workflows/keep-warm.yml`，用 GitHub Actions
每 10 分鐘打一次 `/health`。公開倉庫的排程工作免費且無限，
不必註冊任何外部服務。

**只在台灣時間 08:00–01:00 保溫**，不是整天。免費方案每月有 750 個
執行小時，全天候保溫要 730 小時，額度剛好卡在邊緣、任何一次多開就會
超出。這樣約用 520 小時，留下餘裕，而凌晨本來也沒什麼訪客。

順帶得到一個最低限度的監控：服務真的掛掉時，這個工作會在 GitHub 上
變成紅色，你會收到通知。

> 如果之後把倉庫改成私有，這個排程會開始消耗 Actions 分鐘數
> （每月免費 2000 分鐘，而這個排程一個月要跑約 3000 次）。
> 屆時請改用 UptimeRobot 或 cron-job.org 這類外部服務。

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

## ⑤ Upstash Redis ✅ 你已經設定好了

`REDIS_URL` 已經填上，`/health` 回報 `"redis": true`。

它現在有兩個用途，第二個很重要：

1. AI 對話暫存
2. **登出後讓 token 立刻失效**

第 2 點值得解釋一下。JWT 的設計是「簽出去就算數」—— 伺服器不會逐一記住
發過哪些 token，只驗簽章與到期時間。好處是快，壞處是**沒辦法收回**：
使用者按了登出，如果只是前端把 token 丟掉，那張 token 在過期前仍然有效。
在公用電腦上登出、或 token 被側錄，都還是能被繼續使用。

所以登出時我們把那張 token 的編號寫進 Redis 的撤銷名單，每次請求都查一下。
名單的存活時間對齊 token 的到期時間，過期的自動消失，不會愈長愈大。

> 如果 Redis 哪天掛了：程式選擇**放行**而不是擋下。
> 擋下的話全站使用者會同時被登出，那是比較嚴重的事故。

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
