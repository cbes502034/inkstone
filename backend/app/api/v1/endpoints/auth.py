from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select

from app.core.deps import CurrentUser, DbSession
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    needs_rehash,
    verify_password,
)
from app.models import User
from app.schemas.user import (
    AuthSession,
    LoginIn,
    RefreshIn,
    RegisterIn,
    TokenPair,
    UpdateMeIn,
    UserPrivate,
)
from app.services.avatar import store_avatar
from app.services.presence import last_seen_of, presence_of

router = APIRouter(prefix="/auth", tags=["auth"])


def _private(user: User) -> UserPrivate:
    return UserPrivate(
        id=user.id,
        username=user.username,
        displayName=user.display_name,
        avatarUrl=user.avatar_url,
        bio=user.bio,
        createdAt=user.created_at,
        presence=presence_of(user),
        lastSeenAt=last_seen_of(user),
        email=user.email,
        emailVerified=user.email_verified,
        showPresence=user.show_presence,
    )


def _session(user: User) -> AuthSession:
    return AuthSession(
        accessToken=create_access_token(user.id),
        refreshToken=create_refresh_token(user.id),
        user=_private(user),
    )


@router.post("/register", response_model=AuthSession, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterIn, db: DbSession) -> AuthSession:
    exists = await db.execute(
        select(User.id).where(
            or_(User.username == payload.username, User.email == payload.email)
        )
    )
    if exists.first():
        # 刻意不說是帳號還是信箱重複 —— 否則這支 API 就成了帳號列舉工具
        raise HTTPException(status.HTTP_409_CONFLICT, "這個帳號或信箱已經被使用")

    user = User(
        username=payload.username,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        display_name=payload.displayName.strip(),
        avatar_url=store_avatar(payload.avatarDataUrl) if payload.avatarDataUrl else None,
    )
    db.add(user)
    await db.flush()
    return _session(user)


@router.post("/login", response_model=AuthSession)
async def login(payload: LoginIn, db: DbSession) -> AuthSession:
    account = payload.account.strip().lower()
    result = await db.execute(
        select(User).where(or_(User.username == account, User.email == account))
    )
    user = result.scalar_one_or_none()

    # 帳號不存在與密碼錯誤回同一個訊息，避免被用來確認某個帳號存不存在
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "帳號或密碼不正確")

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "這個帳號已被停用")

    # 雜湊參數升級後，趁使用者送出正確密碼時無感換新
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)

    return _session(user)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshIn, db: DbSession) -> TokenPair:
    try:
        user_id = decode_token(payload.refreshToken, expect="refresh")
    except TokenError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "帳號不存在或已停用")

    return TokenPair(
        accessToken=create_access_token(user.id),
        refreshToken=create_refresh_token(user.id),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(_: CurrentUser) -> None:
    """
    目前 JWT 是無狀態的，登出由前端丟掉 token 完成。

    待辦：要做到「登出後 token 立刻失效」需要一份撤銷名單（Redis 存 jti），
    等 Redis 接上後補。
    """
    return None
