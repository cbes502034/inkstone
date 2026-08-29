from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    ACCESS_TOKEN_TTL_MINUTES: int = 15
    REFRESH_TOKEN_TTL_DAYS: int = 30

    # --- CORS ---
    # 前端來源。多個用逗號分隔。
    CORS_ORIGINS: str = "http://localhost:5173"

    # --- Redis（AI 對話暫存）---
    # 沒設定就退回程序內記憶體，本機開發不必先開 Upstash 帳號。
    REDIS_URL: str | None = None
    AI_SESSION_TTL_SECONDS: int = 60 * 60  # 一小時沒動作就清掉

    # --- Hugging Face ---
    HF_TOKEN: str | None = None
    HF_TEXT_MODEL: str = "Qwen/Qwen2.5-7B-Instruct"
    HF_MODERATION_MODEL: str = "textdetox/xlmr-large-toxicity-classifier"
    HF_TIMEOUT_SECONDS: float = 60.0

    # --- 信箱驗證 ---
    # 前端網址，用來組出信裡的驗證連結
    FRONTEND_URL: str = "http://localhost:5173"
    VERIFICATION_TTL_MINUTES: int = 30
    # 同一個信箱重寄驗證信的最短間隔，防止拿註冊功能轟炸別人的信箱
    VERIFICATION_RESEND_COOLDOWN_SECONDS: int = 60

    # --- SMTP ---
    # 留空就不寄信，改把驗證連結寫進日誌（本機開發用）。
    # Gmail、Brevo、Resend、Mailgun 都支援 SMTP，換供應商只要改這幾個值。
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

        Supabase 與大多數雲端供應商給的是 `postgresql://...`，
        但 SQLAlchemy 的 async engine 需要指定驅動 `postgresql+asyncpg://...`。
        在這裡自動補上，使用者可以直接貼供應商給的字串，不用手動改。
        """
        url = self.DATABASE_URL.strip()
        if url.startswith("postgres://"):  # 有些平台仍給舊式前綴
            url = "postgresql://" + url[len("postgres://") :]
        if url.startswith("postgresql://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://") :]
        return url

    @property
    def smtp_configured(self) -> bool:
        return bool(self.SMTP_HOST and self.SMTP_USER and self.SMTP_PASSWORD)

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

    @field_validator("JWT_SECRET")
    @classmethod
    def _reject_default_secret_in_prod(cls, v: str, info) -> str:
        # 正式環境用預設密鑰等於沒有驗證，任何人都能自己簽 token
        env = (info.data or {}).get("ENV")
        if env == "prod" and v == "dev-only-insecure-secret-change-me":
            raise ValueError("正式環境必須設定 JWT_SECRET")
        return v

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
