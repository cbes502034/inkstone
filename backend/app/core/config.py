from functools import lru_cache
from typing import Literal
from urllib.parse import quote, unquote

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _encode_credentials(url: str) -> str:
    """
    把連線字串裡的帳號與密碼做百分比編碼。

    切法刻意選「最後一個 @」而不是第一個 —— 密碼本身就可能含 @，
    用第一個會在密碼中間切開。主機名不會有 @，所以最後一個必定是分隔符。

    已經編碼過的字串先解碼再編碼，避免重複編碼把 %40 變成 %2540。
    """
    if "://" not in url:
        return url

    scheme, _, rest = url.partition("://")
    if "@" not in rest:
        return url  # 沒有帳密的連線字串

    credentials, _, host_part = rest.rpartition("@")
    user, sep, password = credentials.partition(":")

    safe_user = quote(unquote(user), safe="")
    if not sep:
        return f"{scheme}://{safe_user}@{host_part}"

    safe_password = quote(unquote(password), safe="")
    return f"{scheme}://{safe_user}:{safe_password}@{host_part}"


class Settings(BaseSettings):
    """
    全站設定。

    一律從環境變數讀取，程式碼裡不出現任何金鑰。
    本機開發放 .env（已在 .gitignore），正式環境由 Render 的環境變數注入。
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- 基本 ---
    ENV: Literal["dev", "prod"] = "dev"
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "硯 Inkstone"

    # --- 資料庫 ---
    # 預設用 SQLite，clone 下來不用申請任何帳號就能跑起來。
    # 正式環境把 DATABASE_URL 換成 Supabase 的 postgresql+asyncpg://... 即可，
    # ORM 層沒有用到任何資料庫專屬語法，換過去不需要改程式。
    DATABASE_URL: str = "sqlite+aiosqlite:///./inkstone.db"

    # --- JWT ---
    # 正式環境一定要覆寫。這裡給預設值只是為了本機能直接跑，
    # 啟動時若在 prod 仍是預設值會直接拒絕啟動（見下方驗證）。
    JWT_SECRET: str = "dev-only-insecure-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    # access 一小時、refresh 一個月。
    #
    # access 敢放到一小時，是因為登出時會把它寫進撤銷名單、立刻失效 ——
    # 短 TTL 的傳統理由是「token 發出去就收不回來」，那個前提在這裡不成立。
    #
    # refresh 一個月換來的是使用者不必反覆登入。代價是被偷走的那張
    # 可以用滿一個月 —— 我們沒有做輪替加重放偵測（那會讓多分頁互相踢掉）。
    # 補償的是「改密碼讓所有既有 session 失效」：帳號被盜時改密碼
    # 真的能把對方趕出去，不必等 token 自然過期。
    ACCESS_TOKEN_TTL_MINUTES: int = 60
    REFRESH_TOKEN_TTL_DAYS: int = 30

    # --- CORS ---
    # 前端來源。多個用逗號分隔。
    CORS_ORIGINS: str = "http://localhost:5173"

    # --- Redis（AI 對話暫存）---
    # 沒設定就退回程序內記憶體，本機開發不必先開 Upstash 帳號。
    REDIS_URL: str | None = None
    AI_SESSION_TTL_SECONDS: int = 60 * 60  # 一小時沒動作就清掉

    # --- 推播通知（選填）---
    # 不設定的話程式會自己產生一組並存進資料庫，不需要任何手動步驟。
    # 想自己掌管金鑰的人才需要填這兩個。
    VAPID_PUBLIC_KEY: str | None = None
    VAPID_PRIVATE_KEY: str | None = None
    # 推播服務要求能聯絡到服務擁有者，出問題時才有辦法通知
    VAPID_SUBJECT: str = "mailto:noreply@inkstone.app"

    # --- 物件儲存（選填）---
    # 沒設定就把圖片位元組留在資料庫，功能完全一樣，只是佔用資料庫容量。
    # Supabase 免費方案的資料庫是 500 MB，而 Storage 另外給 1 GB ——
    # 把圖片挪出去等於把可用空間放大一倍以上，而且資料庫備份也會小很多。
    SUPABASE_URL: str | None = None
    SUPABASE_SERVICE_KEY: str | None = None
    SUPABASE_BUCKET: str = "media"

    # --- Hugging Face ---
    HF_TOKEN: str | None = None
    # 貼進雲端平台的環境變數欄位時很容易夾帶尾端換行或空白。
    # 那會讓 Authorization 標頭變成不合法的值，對方直接回 401，
    # 而 token 本身看起來完全正常 —— 這種問題肉眼查不出來。
    # 這個 id 必須出現在 https://router.huggingface.co/v1/models 的清單裡。
    # 模型倉庫頁面顯示「有供應商在跑」不代表 router 認得它 —— 兩份資料不同步，
    # 而 router 不認得時只回一個 400，看起來像請求格式錯誤，很容易查錯方向。
    # 選 Instruct 版而不是會輸出推理過程的版本：草稿要照「第一行標題、
    # 空行、內文」的格式回來，夾帶思考段落會把解析打亂。
    HF_TEXT_MODEL: str = "Qwen/Qwen3-4B-Instruct-2507"
    HF_MODERATION_MODEL: str = "textdetox/xlmr-large-toxicity-classifier"
    HF_TIMEOUT_SECONDS: float = 60.0

    # --- 信箱驗證 ---
    # 前端網址，用來組出信裡的驗證連結
    FRONTEND_URL: str = "http://localhost:5173"
    VERIFICATION_TTL_MINUTES: int = 30
    # 同一個信箱重寄驗證信的最短間隔，防止拿註冊功能轟炸別人的信箱
    VERIFICATION_RESEND_COOLDOWN_SECONDS: int = 60
    # 重設密碼的票證權限更高（可接管既有帳號），有效期設得比註冊短
    RESET_TTL_MINUTES: int = 15
    RESET_RESEND_COOLDOWN_SECONDS: int = 60

    # --- 寄信 ---
    # 正式環境用 HTTPS API，不要用 SMTP：Render、Heroku 這類平台
    # 封鎖對外的 SMTP 連接埠（25/465/587），錯誤訊息還會偽裝成網路問題。
    BREVO_API_KEY: str = ""
    RESEND_API_KEY: str = ""

    # SMTP 保留給本機或不封鎖連接埠的環境
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    MAIL_FROM: str = "no-reply@inkstone.app"
    MAIL_FROM_NAME: str = "硯 Inkstone"

    # --- 上傳限制 ---
    MAX_AVATAR_BYTES: int = 12 * 1024 * 1024
    AVATAR_SIZE_PX: int = 512

    # --- 速率限制 ---
    RATE_LIMIT_WRITE_PER_MINUTE: int = 20
    RATE_LIMIT_AI_PER_HOUR: int = 30

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def database_url(self) -> str:
        """
        正規化連線字串。

        做兩件事：
        1. 補上驅動：供應商給的是 `postgresql://...`，SQLAlchemy 的 async
           engine 需要 `postgresql+asyncpg://...`
        2. 對帳號密碼做百分比編碼

        第 2 點是實際踩過的坑。資料庫密碼常含 @ ( ) + = / : # 這類字元，
        它們在 URL 裡有語法意義 —— 密碼裡的 @ 會被當成「帳密與主機的分隔符」，
        整個字串就被切錯位，錯誤訊息還會把一小段密碼吐進日誌。

        在這裡統一處理，使用者直接貼供應商給的原始字串就能用。
        """
        url = self.DATABASE_URL.strip()

        if url.startswith("postgres://"):  # 有些平台仍給舊式前綴
            url = "postgresql://" + url[len("postgres://") :]
        if url.startswith("postgresql://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://") :]

        return _encode_credentials(url)

    @property
    def smtp_configured(self) -> bool:
        return bool(self.SMTP_HOST and self.SMTP_USER and self.SMTP_PASSWORD)

    @property
    def email_provider(self) -> str:
        """
        依設定挑選寄信通道。

        HTTPS API 優先於 SMTP —— 雲端平台大多封鎖 SMTP 連接埠，
        而 443 埠不會被擋。
        """
        if self.BREVO_API_KEY:
            return "brevo"
        if self.RESEND_API_KEY:
            return "resend"
        if self.smtp_configured:
            return "smtp"
        return "none"

    @property
    def storage_provider(self) -> str:
        """
        圖片位元組放哪裡。

        兩者的對外行為一致 —— 呼叫端拿到的都是一個網址，
        差別只在位元組實際落在資料庫還是物件儲存。
        """
        if self.SUPABASE_URL and self.SUPABASE_SERVICE_KEY:
            return "supabase"
        return "database"

    @property
    def is_pgbouncer(self) -> bool:
        """
        是否連到連線池（Supabase 的 pooler）。

        Transaction 模式的 PgBouncer 不支援 prepared statement，
        asyncpg 預設會用它，不關掉會出現
        「prepared statement does not exist」這種難查的錯誤。
        """
        url = self.database_url
        return "pooler.supabase.com" in url or ":6543" in url

    @field_validator(
        "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY",
        mode="before",
    )
    @classmethod
    def _trim_pasted(cls, v):
        """
        去掉貼上時夾帶的空白與換行。

        網址結尾的斜線也一併去掉，避免組出 https://host//storage 這種雙斜線。
        金鑰用的是 base64url，不含斜線，所以這個處理對它們無害。
        """
        if isinstance(v, str):
            v = v.strip().rstrip("/")
            return v or None
        return v

    @field_validator("HF_TOKEN", "HF_TEXT_MODEL", mode="before")
    @classmethod
    def _trim_hf(cls, v, info):
        """
        去掉貼上時夾帶的空白與換行。

        空字串的處理要分開：HF_TOKEN 可以是 None（代表沒設定，走本機樣板），
        但 HF_TEXT_MODEL 宣告成 str，回 None 會讓程式啟動就失敗，
        所以那一個留給欄位預設值去補。
        """
        if not isinstance(v, str):
            return v
        v = v.strip()
        if v:
            return v
        return None if info.field_name == "HF_TOKEN" else "Qwen/Qwen3-4B-Instruct-2507"

    @field_validator("JWT_SECRET")
    @classmethod
    def _reject_default_secret_in_prod(cls, v: str, info) -> str:
        # 正式環境用預設密鑰等於沒有驗證，任何人都能自己簽 token
        env = (info.data or {}).get("ENV")
        if env == "prod" and v == "dev-only-insecure-secret-change-me":
            raise ValueError("正式環境必須設定 JWT_SECRET")
        return v

    def describe_database_url(self) -> str:
        """
        描述連線字串的「形狀」，不洩漏內容。

        連線字串出問題時，SQLAlchemy 的錯誤訊息會把一小段密碼吐進日誌，
        既不安全又難判讀。這支只回報結構，足以判斷問題出在哪。
        """
        raw = self.DATABASE_URL
        scheme = raw.split("://")[0] if "://" in raw else "(沒有 :// )"
        host = ""
        if "://" in raw and "@" in raw:
            host = raw.rpartition("@")[2].split("/")[0]
        return (
            f"長度={len(raw)} 前綴={scheme!r} "
            f"有@={'@' in raw} 有換行={chr(10) in raw or chr(13) in raw} "
            f"主機={host or '(無法判斷)'}"
        )

    @field_validator("DATABASE_URL")
    @classmethod
    def _must_look_like_url(cls, v: str, info) -> str:
        """
        先擋掉明顯不是連線字串的值。

        沒有這道檢查時，錯誤會拖到 SQLAlchemy 才爆，
        訊息長這樣：Could not parse SQLAlchemy URL from string '(eJ04jp6)+=@'
        —— 那串是密碼碎片，既看不出問題也把密碼寫進了日誌。

        最常見的原因是貼進環境變數時只貼到一半，或值裡混進了換行。
        """
        raw = v.strip()  # 前後空白與換行是貼上時常見的雜訊，直接去掉
        if not raw:
            raise ValueError("DATABASE_URL 是空的")
        # 中間的換行不能容忍 —— 那代表值被截斷或黏到了別的東西
        if "\n" in raw or "\r" in raw:
            raise ValueError("DATABASE_URL 中間有換行，請確認貼上的是完整的單一行")
        if "://" not in raw:
            raise ValueError(
                f"DATABASE_URL 不是完整的連線字串（缺少 :// ，長度 {len(raw)}）。"
                "多半是貼進環境變數時只貼到一半，請重新完整複製 Supabase 的 "
                "Session pooler 連線字串。"
            )

        # Supabase 的直連位址只有 IPv6（沒有 A 記錄），
        # 而 Render 免費方案沒有 IPv6 對外連線，一定連不上，
        # 錯誤會是難以判讀的 OSError: [Errno 101] Network is unreachable。
        # 在這裡直接擋下並說清楚要換成什麼。
        host = raw.rpartition("@")[2].split("/")[0].split(":")[0]
        if host.startswith("db.") and host.endswith(".supabase.co"):
            project_ref = host.removeprefix("db.").removesuffix(".supabase.co")
            raise ValueError(
                f"不能用 Supabase 的直連位址（{host}）—— 它只有 IPv6，"
                "而 Render 免費方案沒有 IPv6 對外連線。\n"
                "請改用 connection pooler：Supabase → Connect → Session pooler，"
                f"主機會是 aws-<n>-<區域>.pooler.supabase.com，"
                f"使用者名稱是 postgres.{project_ref}（要帶專案 ref）。"
            )
        return raw

    @field_validator("DATABASE_URL")
    @classmethod
    def _reject_sqlite_in_prod(cls, v: str, info) -> str:
        """
        正式環境不准用 SQLite。

        忘了設 DATABASE_URL 時，預設值會讓服務「看起來正常啟動」，
        實際上寫進容器的暫存磁碟 —— 每次重新部署或休眠喚醒，
        使用者的文章與帳號就全部消失。

        這種錯誤沉默地發生比直接啟動失敗糟糕太多，所以寧可大聲失敗。
        """
        env = (info.data or {}).get("ENV")
        if env == "prod" and v.strip().startswith("sqlite"):
            raise ValueError(
                "正式環境必須設定 DATABASE_URL（SQLite 會存在容器的暫存磁碟，重啟即消失）"
            )
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
