from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import TokenError, decode_token, decode_token_full
from app.db.session import get_db
from app.models import User
from app.services.revocation import is_revoked

# auto_error=False：沒帶 token 時我們自己回傳訊息，而不是 FastAPI 的預設英文
_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    """
    取出目前登入者。

    所有需要身分的端點都經過這裡 —— 權限判斷集中在一個地方，
    不會有某支 API 忘了驗證的情況。
    """
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="請先登入",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token_full(creds.credentials, expect="access")
    except TokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    # 登出過的 token 即使還沒過期也不能用
    jti = payload.get("jti")
    if jti and await is_revoked(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="請重新登入",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = str(payload["sub"])

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "帳號不存在或已停用")

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_optional_user(
    db: DbSession,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User | None:
    """公開端點用 —— 有登入就帶身分（才知道 likedByMe），沒登入也能看。"""
    if creds is None:
        return None
    try:
        payload = decode_token_full(creds.credentials, expect="access")
    except TokenError:
        return None
    jti = payload.get("jti")
    if jti and await is_revoked(jti):
        return None
    user_id = str(payload["sub"])
    user = await db.get(User, user_id)
    return user if user and user.is_active else None


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username.lower()))
    return result.scalar_one_or_none()
