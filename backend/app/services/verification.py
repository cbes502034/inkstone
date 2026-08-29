"""
註冊驗證票證。

票證本身是高熵亂數，資料庫只存 SHA-256 雜湊 ——
驗證連結等同一次性通行證，跟密碼一樣不該以明碼落地。
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from app.core.config import settings


def new_token() -> str:
    """32 bytes 的亂數。用 token_urlsafe 是為了能直接放進網址不用再編碼。"""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_token(token: str, stored_hash: str) -> bool:
    # 用 compare_digest 而不是 == ，避免透過回應時間差一個位元組一個位元組猜出雜湊
    return secrets.compare_digest(hash_token(token), stored_hash)


def expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(
        minutes=settings.VERIFICATION_TTL_MINUTES
    )


def build_link(token: str) -> str:
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/register/verify?token={quote(token)}"


def reset_expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=settings.RESET_TTL_MINUTES)


def build_reset_link(token: str) -> str:
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/reset-password?token={quote(token)}"
