from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession, OptionalUser, get_user_by_username
from app.models import Block, Friendship, FriendRequestStatus, Post, PostLike, PostTag, User
from app.schemas.post import PostOut
from app.schemas.user import UpdateMeIn, UserPrivate, UserPublic, UserWithRelation
from app.services.avatar import store_avatar
from app.services.friends import friend_count, friend_state
from app.services.presence import last_seen_of, presence_of
from app.services.serializers import post_out, user_public

router = APIRouter(prefix="/users", tags=["users"])


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


@router.get("/me", response_model=UserPrivate)
async def read_me(me: CurrentUser) -> UserPrivate:
    return _private(me)


@router.patch("/me", response_model=UserPrivate)
async def update_me(payload: UpdateMeIn, db: DbSession, me: CurrentUser) -> UserPrivate:
    """
    只能改自己的資料。

    這支端點沒有「要改誰」的參數 —— 目標永遠是 token 裡的那個人，
    所以結構上就不可能改到別人。username 與 email 不開放從這裡改。
    """
    if payload.displayName is not None:
        me.display_name = payload.displayName.strip()
    if payload.bio is not None:
        me.bio = payload.bio.strip()
    if payload.showPresence is not None:
        me.show_presence = payload.showPresence
    if payload.avatarUrl is not None:
        me.avatar_url = await store_avatar(db, payload.avatarUrl) if payload.avatarUrl else None

    await db.flush()
    return _private(me)


@router.post("/me/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
async def heartbeat(db: DbSession, me: CurrentUser) -> None:
    """
    上線心跳。

    WebSocket 接上之前先用這個維持上線狀態；接上之後改由連線本身維護，
    這支保留給沒有 WebSocket 的降級路徑。
    """
    me.last_seen_at = datetime.now(timezone.utc)
    await db.flush()


@router.get("", response_model=list[UserWithRelation])
async def search_users(
    db: DbSession,
    me: CurrentUser,
    q: str = Query(min_length=1, max_length=60),
    limit: int = Query(default=20, le=50),
) -> list[UserWithRelation]:
    needle = q.strip().lower()
    pattern = f"%{needle}%"

    # 封鎖過我的人不該出現在搜尋結果裡
    blocked_me = select(Block.blocker_id).where(Block.blocked_id == me.id)

    stmt = (
        select(User)
        .where(
            User.id != me.id,
            User.is_active.is_(True),
            User.id.not_in(blocked_me),
            or_(
                func.lower(User.display_name).like(pattern),
                func.lower(User.username).like(pattern),
            ),
        )
        .limit(limit)
    )
    users = list((await db.execute(stmt)).scalars().all())

    out: list[UserWithRelation] = []
    for u in users:
        base = user_public(u)
        out.append(
            UserWithRelation(
                **base.model_dump(),
                friendState=await friend_state(db, me.id, u.id),
                friendCount=await friend_count(db, u.id),
                postCount=await db.scalar(
                    select(func.count(Post.id)).where(Post.author_id == u.id)
                )
                or 0,
            )
        )
    return out


@router.get("/{username}", response_model=UserWithRelation)
async def read_user(username: str, db: DbSession, me: CurrentUser) -> UserWithRelation:
    user = await get_user_by_username(db, username)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這個人")

    base = user_public(user)
    return UserWithRelation(
        **base.model_dump(),
        friendState=await friend_state(db, me.id, user.id),
        friendCount=await friend_count(db, user.id),
        postCount=await db.scalar(select(func.count(Post.id)).where(Post.author_id == user.id))
        or 0,
    )


@router.get("/{username}/posts", response_model=list[PostOut])
async def read_user_posts(
    username: str, db: DbSession, viewer: OptionalUser
) -> list[PostOut]:
    user = await get_user_by_username(db, username)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這個人")

    stmt = (
        select(Post)
        .options(selectinload(Post.author))
        .where(Post.author_id == user.id)
        .order_by(Post.created_at.desc())
    )
    posts = list((await db.execute(stmt)).scalars().all())
    ids = [p.id for p in posts]

    tag_rows = await db.execute(select(PostTag.post_id, PostTag.tag).where(PostTag.post_id.in_(ids)))
    tags: dict[str, list[str]] = {}
    for pid, tag in tag_rows.all():
        tags.setdefault(pid, []).append(tag)

    liked: set[str] = set()
    if viewer and ids:
        rows = await db.execute(
            select(PostLike.post_id).where(
                PostLike.user_id == viewer.id, PostLike.post_id.in_(ids)
            )
        )
        liked = {r[0] for r in rows.all()}

    return [
        post_out(
            p,
            author=p.author,
            tags=tags.get(p.id, []),
            liked_by_me=p.id in liked,
            viewer_id=viewer.id if viewer else None,
        )
        for p in posts
    ]
