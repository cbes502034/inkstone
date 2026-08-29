from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select

from app.core.config import settings
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
from app.models import PendingRegistration, User
from app.schemas.user import (
    AuthSession,
    LoginIn,
    RefreshIn,
    RegisterCheckOut,
    RegisterCompleteIn,
    RegisterStartIn,
    RegisterStartOut,
    TokenPair,
    UpdateMeIn,
    UserPrivate,
)
from app.services.avatar import store_avatar
from app.services.email import send_verification
from app.services.presence import last_seen_of, presence_of
from app.services.verification import (
    build_link,
    expires_at,
    hash_token,
    new_token,
    verify_token,
)

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


@router.post("/register/start", response_model=RegisterStartOut)
async def register_start(payload: RegisterStartIn, db: DbSession) -> RegisterStartOut:
    """
    註冊第一步：收下帳號與信箱，寄出驗證信。

    這裡刻意**不建立使用者**。若先建立再等驗證，資料庫會累積大量沒驗證的
    殭屍帳號，而且那些帳號會一直佔著帳號名稱與信箱。

    回應一律相同，不論帳號或信箱是否已被使用 —— 否則這支 API 就變成
    「這個信箱有沒有註冊過」的查詢工具，是常見的個資外洩管道。
    """
    email = payload.email.lower()
    now = datetime.now(timezone.utc)

    taken = await db.execute(
        select(User.id).where(or_(User.username == payload.username, User.email == email))
    )
    if taken.first():
        # 帳號已存在：不建立票證，也不回報，行為與正常情況無法區分
        return RegisterStartOut()

    # 同一個信箱短時間內重複送出就不再寄信，避免有人拿註冊功能轟炸別人的信箱
    existing = (
        await db.execute(
            select(PendingRegistration).where(PendingRegistration.email == email)
        )
    ).scalar_one_or_none()

    if existing is not None:
        last_sent = existing.last_sent_at
        if last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)
        if (now - last_sent).total_seconds() < settings.VERIFICATION_RESEND_COOLDOWN_SECONDS:
            return RegisterStartOut()
        await db.delete(existing)
        await db.flush()

    # 帳號名稱在待驗證階段也要保留，否則兩個人可能同時走完流程才發現撞名
    holding = await db.execute(
        select(PendingRegistration).where(PendingRegistration.username == payload.username)
    )
    for row in holding.scalars().all():
        expires = row.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires > now:
            return RegisterStartOut()  # 還在保留中，同樣不透露
        await db.delete(row)
    await db.flush()

    token = new_token()
    db.add(
        PendingRegistration(
            username=payload.username,
            email=email,
            token_hash=hash_token(token),
            expires_at=expires_at(),
            last_sent_at=now,
        )
    )

    link = build_link(token)
    try:
        send_verification(email, link, payload.username)
    except Exception:
        # 寄信失敗要讓使用者知道可以重試，但不能吐出 SMTP 的錯誤細節
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "驗證信寄送失敗，請稍後再試一次"
        ) from None

    return RegisterStartOut(devLink=link if settings.ENV == "dev" else None)


@router.get("/register/check", response_model=RegisterCheckOut)
async def register_check(token: str, db: DbSession) -> RegisterCheckOut:
    """點開連結時先確認票證有效，前端才顯示設定密碼的畫面。"""
    pending = await _load_pending(db, token)
    return RegisterCheckOut(username=pending.username, email=pending.email)


@router.post(
    "/register/complete", response_model=AuthSession, status_code=status.HTTP_201_CREATED
)
async def register_complete(payload: RegisterCompleteIn, db: DbSession) -> AuthSession:
    """
    註冊第二步：設定密碼，帳號在這一刻才真正建立。

    信箱驗證已經完成（能點到這個連結就代表收得到信），
    所以直接標記 email_verified。
    """
    pending = await _load_pending(db, payload.token)

    # 從送出到點信之間，可能有人先用掉了這個帳號或信箱
    taken = await db.execute(
        select(User.id).where(
            or_(User.username == pending.username, User.email == pending.email)
        )
    )
    if taken.first():
        await db.delete(pending)
        raise HTTPException(
            status.HTTP_409_CONFLICT, "這個帳號或信箱已經被註冊，請重新開始"
        )

    user = User(
        username=pending.username,
        email=pending.email,
        password_hash=hash_password(payload.password),
        # 還沒讓使用者取顯示名稱，先用帳號，之後可以在個人資料改
        display_name=pending.username,
        email_verified=True,
        avatar_url=store_avatar(payload.avatarDataUrl) if payload.avatarDataUrl else None,
    )
    db.add(user)

    # 票證一次性：用掉就刪，同一條連結不能重複註冊
    await db.delete(pending)
    await db.flush()

    return _session(user)


async def _load_pending(db, token: str) -> PendingRegistration:
    """
    取出票證並驗證。

    先用雜湊查、再用 compare_digest 比對，避免以回應時間差推敲出雜湊值。
    """
    row = (
        await db.execute(
            select(PendingRegistration).where(
                PendingRegistration.token_hash == hash_token(token)
            )
        )
    ).scalar_one_or_none()

    if row is None or not verify_token(token, row.token_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "驗證連結無效")

    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        await db.delete(row)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "驗證連結已過期，請重新註冊")

    return row


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
