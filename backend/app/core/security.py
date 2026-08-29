from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import settings

# argon2id —— 目前密碼雜湊的建議選擇，對 GPU 暴力破解的抵抗力比 bcrypt 好
_hasher = PasswordHasher()

TokenType = Literal["access", "refresh"]


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        _hasher.verify(hashed, plain)
        return True
    except (VerifyMismatchError, InvalidHashError):
        return False


def needs_rehash(hashed: str) -> bool:
    """參數升級後，讓使用者下次登入時無感換上新的雜湊"""
    try:
        return _hasher.check_needs_rehash(hashed)
    except InvalidHashError:
        return True


def _create_token(subject: str, token_type: TokenType, expires: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: str) -> str:
    return _create_token(
        user_id, "access", timedelta(minutes=settings.ACCESS_TOKEN_TTL_MINUTES)
    )


def create_refresh_token(user_id: str) -> str:
    return _create_token(user_id, "refresh", timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS))


class TokenError(Exception):
    pass


def decode_token(token: str, expect: TokenType) -> str:
    """
    驗證並取出 user id。

    一定要檢查 type：access 與 refresh 的有效期差很多，
    若不分辨，別人就能拿長效的 refresh token 當 access token 用一個月。
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as e:
        raise TokenError("token 已過期") from e
    except jwt.InvalidTokenError as e:
        raise TokenError("token 無效") from e

    if payload.get("type") != expect:
        raise TokenError("token 類型不符")

    sub = payload.get("sub")
    if not sub:
        raise TokenError("token 缺少 subject")
    return str(sub)
