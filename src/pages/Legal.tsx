import { ArrowLeft } from 'lucide-react'
import { motion } from 'motion/react'
import { Link, useNavigate } from 'react-router-dom'
import { Wordmark } from '../components/Logo'

/**
 * 服務條款與隱私權政策。
 *
 * 內容涵蓋個資法第 8 條要求的告知事項：蒐集目的、個資類別、利用期間與範圍、
 * 當事人可行使的權利、不提供的影響。
 *
 * 這是務實的範本，不是法律意見。正式營運前應請法律專業看過，
 * 尤其是有金流、未成年使用者或跨境資料傳輸的情況。
 */

const UPDATED = '2026 年 8 月 30 日'
const CONTACT = 'cbes502034@gmail.com'

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="min-h-dvh">
      <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8 sm:py-12">
        <button
          onClick={() => navigate(-1)}
          className="press mb-8 flex items-center gap-1.5 rounded-full border border-rule
                     bg-paper-raised px-3 py-1.5 text-sm text-ink-soft backdrop-blur-md
                     transition-colors hover:text-ink"
        >
          <ArrowLeft size={16} />
          返回
        </button>

        <motion.article
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="panel px-6 py-9 sm:px-10 sm:py-12"
        >
          <Wordmark size={34} />
          <h1 className="mt-7 text-[28px] leading-tight tracking-tight sm:text-[32px]">
            {title}
          </h1>
          <p className="mt-2 text-[13px] text-ink-faint">最後更新：{UPDATED}</p>

          <div className="mt-9 flex flex-col gap-7 text-[15px] leading-[1.9] text-ink-soft">
            {children}
          </div>

          <div className="mt-10 border-t border-rule pt-6 text-[13px] text-ink-faint">
            有任何問題，來信{' '}
            <a href={`mailto:${CONTACT}`} className="text-accent hover:underline">
              {CONTACT}
            </a>
          </div>
        </motion.article>
      </div>
    </div>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-2 text-[19px] text-ink">{children}</h2>
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------- 服務條款 */

export function Terms() {
  return (
    <Page title="服務條款">
      <p>
        歡迎使用「Friends World」。註冊帳號或使用本服務，即表示你同意以下條款。
        如果不同意，請不要使用本服務。
      </p>

      <section className="flex flex-col gap-3">
        <H>一、帳號</H>
        <List
          items={[
            '註冊時必須提供真實可用的電子信箱，我們會寄送驗證信確認。',
            '帳號名稱一經建立即無法變更，因為其他使用者可能已用它連結到你。',
            '你有責任保管自己的密碼。透過你的帳號進行的行為，視為你本人所為。',
            '發現帳號遭盜用時，請立即更改密碼並來信告知。',
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <H>二、你發表的內容</H>
        <List
          items={[
            '你發表的文章、留言、圖片，著作權仍然屬於你。',
            '為了讓服務能夠運作（顯示、備份、傳送給其他使用者），你授權我們在必要範圍內使用這些內容。這個授權在你刪除內容後即終止。',
            '請不要張貼你沒有權利散布的內容。',
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <H>三、不可以做的事</H>
        <p>以下行為會導致內容被移除，情節嚴重者帳號會被停用：</p>
        <List
          items={[
            '騷擾、威脅、霸凌他人，或散布仇恨言論。',
            '張貼違法內容，或侵害他人著作權、隱私、名譽的內容。',
            '未經同意公開他人的個人資料。',
            '大量發送廣告或垃圾訊息。',
            '嘗試入侵、干擾服務運作，或以自動化方式大量存取。',
            '冒充他人或組織。',
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <H>四、檢舉與處理</H>
        <p>
          你可以檢舉不當的文章、留言或使用者。我們會以人工判斷，
          不會因為檢舉數量多就自動下架 —— 那會讓檢舉變成攻擊他人的工具。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <H>五、AI 寫作助手</H>
        <List
          items={[
            'AI 產生的內容僅供參考，發表前請自己確認。你對自己發表的內容負責，即使那是 AI 協助產生的。',
            'AI 對話內容暫存於伺服器記憶體並設有效期，不會寫入資料庫，也不會用於訓練模型。',
            'AI 只協助撰寫本平台的文章，不回答其他問題。',
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <H>六、服務的變更與中斷</H>
        <List
          items={[
            '本服務目前以免費方案運行，可能因維護、升級或不可抗力而暫停。',
            '我們會盡力維持服務穩定，但不保證不中斷或無錯誤。',
            '若決定終止服務，會在合理期間前公告，讓你有時間備份自己的內容。',
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <H>七、帳號終止</H>
        <p>
          你隨時可以停止使用並要求刪除帳號。我們也可能在你嚴重違反本條款時停用帳號，
          停用前會盡可能事先通知，除非情況緊急。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <H>八、條款修改</H>
        <p>
          條款修改時會更新本頁的日期。重大變更會另行通知。
          修改後繼續使用服務，視為接受新的條款。
        </p>
      </section>
    </Page>
  )
}

/* --------------------------------------------------------- 隱私權政策 */

export function Privacy() {
  return (
    <Page title="隱私權政策">
      <p>
        這份說明告訴你我們蒐集哪些個人資料、為什麼蒐集、怎麼使用，
        以及你可以行使哪些權利。
      </p>

      <section className="flex flex-col gap-3">
        <H>一、我們蒐集什麼</H>
        <List
          items={[
            '註冊資料：電子信箱、帳號名稱、密碼（以 argon2id 雜湊儲存，我們無法還原成明文）。',
            '個人檔案：顯示名稱、自我介紹、大頭照。這些是你自願提供的，可隨時修改或清空。',
            '你產生的內容：文章、留言、按讚紀錄、好友關係、聊天訊息。',
            '使用紀錄：最後上線時間，用於顯示上線狀態；你可以在個人資料頁關閉這項顯示。',
            '技術紀錄：伺服器會記錄 IP 位址與錯誤訊息，用於排除故障與防範濫用。',
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <H>二、為什麼蒐集</H>
        <List
          items={[
            '提供服務本身：讓你登入、發表文章、與好友聊天。',
            '驗證身分：確認信箱真實存在，避免大量假帳號。',
            '安全維護：偵測濫用行為、處理檢舉、防範攻擊。',
          ]}
        />
        <p>
          我們<strong className="text-ink">不會</strong>把你的個人資料販售或提供給第三方作行銷用途。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <H>三、誰看得到什麼</H>
        <List
          items={[
            '公開：顯示名稱、帳號、大頭照、自我介紹、你發表的文章與留言。',
            '只有你看得到：電子信箱、密碼、帳號建立時間等註冊資料。其他使用者進到你的頁面不會看到這些欄位。',
            '只有對話成員看得到：聊天訊息。非成員即使知道對話網址也讀不到。',
            '可自行控制：上線狀態。關閉後別人一律看到你是離線，也看不到最後上線時間。',
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <H>四、我們使用的第三方服務</H>
        <List
          items={[
            '資料庫與檔案儲存：Supabase（資料存放於新加坡地區）。',
            '應用程式主機：Render。',
            '寄信服務：Brevo，僅用於寄送驗證信與密碼重設信。',
          ]}
        />
        <p>
          這些服務商會依其自身的隱私政策處理資料。使用本服務即表示你了解資料會傳輸至境外伺服器。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <H>五、保存多久</H>
        <List
          items={[
            '帳號存在期間，我們保存你的資料以提供服務。',
            '未完成驗證的註冊資料在 30 分鐘後自動刪除。',
            '密碼重設票證在 15 分鐘後失效並刪除。',
            'AI 對話暫存有時效，不寫入資料庫。',
            '刪除帳號後，我們會刪除你的個人資料。已被他人引用的公開內容可能仍存在於對話脈絡中。',
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <H>六、你的權利</H>
        <p>依個人資料保護法，你可以要求：</p>
        <List
          items={[
            '查詢或請求閱覽你的個人資料。',
            '請求製給複製本。',
            '請求補充或更正。',
            '請求停止蒐集、處理或利用。',
            '請求刪除。',
          ]}
        />
        <p>
          個人檔案的修改可以直接在個人資料頁完成。其他請求請來信，
          我們會在合理期間內處理。
        </p>
        <p>
          <strong className="text-ink">不提供資料的影響：</strong>
          電子信箱是註冊的必要資料，沒有它無法建立帳號、也無法在忘記密碼時協助你。
          其他欄位（大頭照、自我介紹）都是選填，不填不影響使用。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <H>七、資料安全</H>
        <List
          items={[
            '密碼以 argon2id 雜湊儲存，即使資料庫外洩也無法直接得到明文密碼。',
            '所有連線經過 HTTPS 加密。',
            '大頭照上傳時會重新編碼，移除照片中可能夾帶的 GPS 位置等資訊。',
            '我們會盡合理努力保護資料，但沒有任何系統能保證絕對安全。',
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <H>八、未成年人</H>
        <p>
          未滿十八歲者，應在法定代理人閱讀、了解並同意本政策後，才得以使用本服務。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <H>九、政策修改</H>
        <p>
          本政策修改時會更新本頁日期，重大變更會另行通知。
        </p>
      </section>

      <p className="text-[13px] text-ink-faint">
        另可參閱
        <Link to="/terms" className="mx-1 text-accent hover:underline">
          服務條款
        </Link>
      </p>
    </Page>
  )
}
