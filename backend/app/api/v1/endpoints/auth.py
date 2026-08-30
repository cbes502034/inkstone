from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, stale_generation
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token_full,
    hash_password,
    needs_rehash,
    verify_password,
)
from app.models import PasswordReset, PendingRegistration, User
from app.schemas.user import (
    AuthSession,
    ForgotPasswordIn,
    LoginIn,
    LogoutIn,
    RefreshIn,
    RegisterCheckOut,
    RegisterCompleteIn,
    RegisterStartIn,
    RegisterStartOut,
    ResetPasswordIn,
    TokenPair,
    UpdateMeIn,
    UserPrivate,
)
from app.services.avatar import store_avatar
from app.services.email import send_password_reset, send_verification
from app.services.presence import last_seen_of, presence_of
from app.services.revocation import is_revoked, revoke
from app.services.verification import (
    build_link,
    build_reset_link,
    expires_at,
    hash_token,
    new_token,
    reset_expires_at,
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
        accessToken=create_access_token(user.id, user.token_generation),
        refreshToken=create_refresh_token(user.id, user.token_generation),
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
        await send_verification(email, link, payload.username)
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
        avatar_url=await store_avatar(db, payload.avatarDataUrl) if payload.avatarDataUrl else None,
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
        data = decode_token_full(payload.refreshToken, expect="refresh")
    except TokenError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e

    # 這裡一定要查撤銷名單。少了這道檢查，登出等於沒用 ——
    # 拿著 refresh token 的人立刻就能換一張新的 access token 回來。
    jti = data.get("jti")
    if jti and await is_revoked(jti):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "請重新登入")

    user = await db.get(User, str(data["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "帳號不存在或已停用")

    # 這裡一定要一起檢查。少了這道，改完密碼的人手上那張 refresh
    # 還是能換出全新的 access —— 等於整個機制沒有作用
    if stale_generation(data, user):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "密碼已變更，請重新登入")

    # 這裡刻意不做 refresh token 輪替。
    # 輪替真正的價值在「重放偵測」（發現舊 token 又被用 → 連坐廢掉整條家族），
    # 那套沒做的話，換來的只有壞處：使用者開兩個分頁時，access 一過期
    # 兩邊會同時拿同一張 refresh 來換，先到的成功、後到的被判失效，
    # 那個分頁就無端被踢回登入頁。

    return TokenPair(
        accessToken=create_access_token(user.id, user.token_generation),
        refreshToken=create_refresh_token(user.id, user.token_generation),
    )


@router.post("/password/forgot", response_model=RegisterStartOut)
async def forgot_password(payload: ForgotPasswordIn, db: DbSession) -> RegisterStartOut:
    """
    寄出重設密碼的連結。

    回應一律相同，不論這個信箱有沒有註冊過 —— 否則任何人都能拿這支 API
    逐一確認某個信箱是不是這個站的使用者。
    """
    email = payload.email.lower()
    now = datetime.now(timezone.utc)

    user = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()

    if user is None or not user.is_active:
        return RegisterStartOut(message="如果這個信箱有註冊過，重設連結已經寄出")

    # 舊的票證一律作廢：同時存在多張有效的重設票證，
    # 等於把接管帳號的機會多開了幾扇門
    old = (
        await db.execute(select(PasswordReset).where(PasswordReset.user_id == user.id))
    ).scalars().all()
    for row in old:
        last = row.last_sent_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if (now - last).total_seconds() < settings.RESET_RESEND_COOLDOWN_SECONDS:
            return RegisterStartOut(message="如果這個信箱有註冊過，重設連結已經寄出")
        await db.delete(row)
    await db.flush()

    token = new_token()
    db.add(
        PasswordReset(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=reset_expires_at(),
            last_sent_at=now,
        )
    )

    link = build_reset_link(token)
    try:
        await send_password_reset(email, link, user.username)
    except Exception:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "信件寄送失敗，請稍後再試一次"
        ) from None

    return RegisterStartOut(
        message="如果這個信箱有註冊過，重設連結已經寄出",
        devLink=link if settings.ENV == "dev" else None,
    )


@router.get("/password/check", response_model=RegisterCheckOut)
async def password_reset_check(token: str, db: DbSession) -> RegisterCheckOut:
    reset, user = await _load_reset(db, token)
    return RegisterCheckOut(username=user.username, email=user.email)


@router.post("/password/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(payload: ResetPasswordIn, db: DbSession) -> None:
    """
    設定新密碼。

    密碼一換，既有的 token 全部作廢。

    這件事很重要：改密碼正是「我懷疑帳號被盜」時會做的第一個動作，
    如果對方手上那張 refresh token 不受影響，他可以繼續用滿三十天 ——
    等於你以為換了鎖，其實舊鑰匙還開得了。

    代價是所有裝置都會被登出，包含正在操作的這一台。那是對的行為，
    但介面上要講清楚，否則使用者會覺得「我只是改個密碼，手機怎麼也登出了」。
    """
    reset, user = await _load_reset(db, payload.token)

    user.password_hash = hash_password(payload.password)
    # 能收到信就代表信箱是本人的，順便把驗證狀態補上
    user.email_verified = True
    # 這一行就是全部失效的開關：世代一進，所有既有 token 的 gen 就對不上了
    user.token_generation += 1

    # 票證一次性
    await db.delete(reset)


async def _load_reset(db, token: str) -> tuple[PasswordReset, User]:
    row = (
        await db.execute(
            select(PasswordReset).where(PasswordReset.token_hash == hash_token(token))
        )
    ).scalar_one_or_none()

    if row is None or not verify_token(token, row.token_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "重設連結無效")

    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        await db.delete(row)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "重設連結已過期，請重新申請")

    user = await db.get(User, row.user_id)
    if user is None or not user.is_active:
        await db.delete(row)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "重設連結無效")

    return row, user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(_: CurrentUser, payload: LogoutIn | None = None) -> None:
    """
    登出並作廢 token。

    只靠前端丟掉 token 是不夠的 —— JWT 簽出去之後只要沒過期就一直有效，
    被側錄或留在別台裝置上的那一份仍然可用。所以把它記進撤銷名單。

    access 與 refresh 兩張都要作廢。只廢 access 的話，
    拿著 refresh token 的人立刻就能換一張新的回來。
    """
    if payload is None:
        return None

    for token, kind in (
        (payload.accessToken, "access"),
        (payload.refreshToken, "refresh"),
    ):
        if not token:
            continue
        try:
            data = decode_token_full(token, expect=kind)  # type: ignore[arg-type]
        except TokenError:
            continue  # 已經無效的 token 不用再撤銷
        jti = data.get("jti")
        exp = data.get("exp")
        if jti and exp:
            await revoke(jti, datetime.fromtimestamp(exp, tz=timezone.utc))

    return None
