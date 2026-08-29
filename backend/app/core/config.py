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
        return self.DATABASE_URL.startswith("sqlite")

    @field_validator("JWT_SECRET")
    @classmethod
    def _reject_default_secret_in_prod(cls, v: str, info) -> str:
        # 正式環境用預設密鑰等於沒有驗證，任何人都能自己簽 token
        env = (info.data or {}).get("ENV")
        if env == "prod" and v == "dev-only-insecure-secret-change-me":
            raise ValueError("正式環境必須設定 JWT_SECRET")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
