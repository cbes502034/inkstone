from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models import (
    Block,
    Friendship,
    FriendRequestStatus,
    Notification,
    NotificationKind,
    User,
)
from app.schemas.user import UserPublic
from app.services.friends import friend_ids, get_friendship, is_blocked
from app.services.serializers import user_public

router = APIRouter(prefix="/friends", tags=["friends"])


async def _load(db, ids: list[str]) -> list[UserPublic]:
    if not ids:
        return []
    rows = (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all()
    return [user_public(u) for u in rows]


@router.get("", response_model=list[UserPublic])
async def list_friends(db: DbSession, me: CurrentUser) -> list[UserPublic]:
    return await _load(db, await friend_ids(db, me.id))


@router.get("/requests", response_model=list[UserPublic])
async def list_requests(
    db: DbSession, me: CurrentUser, direction: str = "incoming"
) -> list[UserPublic]:
    """direction=incoming 是別人邀請我，outgoing 是我送出的。"""
    if direction not in ("incoming", "outgoing"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "direction 只能是 incoming 或 outgoing")

    if direction == "incoming":
        stmt = select(Friendship.requester_id).where(
            Friendship.addressee_id == me.id,
            Friendship.status == FriendRequestStatus.pending,
        )
    else:
        stmt = select(Friendship.addressee_id).where(
            Friendship.requester_id == me.id,
            Friendship.status == FriendRequestStatus.pending,
        )

    ids = [r[0] for r in (await db.execute(stmt)).all()]
    return await _load(db, ids)


@router.post("/requests", status_code=status.HTTP_204_NO_CONTENT)
async def send_request(db: DbSession, me: CurrentUser, toUserId: str) -> None:
    """
    送出好友邀請。

    刻意做成「邀請 → 對方接受」的雙向流程：單方面就能把人加成好友，
    等於任何人都能硬塞進別人的名單，也讓騷擾變得容易。
    """
    if toUserId == me.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "不能加自己為好友")

    target = await db.get(User, toUserId)
    if target is None or not target.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這個人")

    if await is_blocked(db, me.id, toUserId):
        # 不明說是被封鎖，避免對方藉此確認自己被封鎖了
        raise HTTPException(status.HTTP_403_FORBIDDEN, "目前無法邀請這個人")

    existing = await get_friendship(db, me.id, toUserId)
    if existing is not None:
        if existing.status is FriendRequestStatus.accepted:
            raise HTTPException(status.HTTP_409_CONFLICT, "你們已經是好友了")
        if existing.status is FriendRequestStatus.pending:
            # 對方先邀請過我，那這次動作等同接受
            if existing.addressee_id == me.id:
                existing.status = FriendRequestStatus.accepted
                return None
            raise HTTPException(status.HTTP_409_CONFLICT, "邀請已經送出了")
        # 之前被拒絕過，允許重新送出
        existing.requester_id, existing.addressee_id = me.id, toUserId
        existing.status = FriendRequestStatus.pending
    else:
        db.add(Friendship(requester_id=me.id, addressee_id=toUserId))

    db.add(
        Notification(
            user_id=toUserId,
            actor_id=me.id,
            kind=NotificationKind.friend_request,
            href="/friends",
            preview="想加你為好友",
        )
    )


@router.post("/requests/{user_id}/accept", status_code=status.HTTP_204_NO_CONTENT)
async def accept_request(user_id: str, db: DbSession, me: CurrentUser) -> None:
    rel = await get_friendship(db, me.id, user_id)
    if rel is None or rel.status is not FriendRequestStatus.pending:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "沒有這筆邀請")
    # 只有被邀請的一方能接受，不然送出邀請的人可以自己批准自己
    if rel.addressee_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "這筆邀請不是給你的")

    rel.status = FriendRequestStatus.accepted
    db.add(
        Notification(
            user_id=rel.requester_id,
            actor_id=me.id,
            kind=NotificationKind.friend_accepted,
            href=f"/u/{me.username}",
            preview="接受了你的好友邀請",
        )
    )


@router.delete("/requests/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def decline_request(user_id: str, db: DbSession, me: CurrentUser) -> None:
    """拒絕對方的邀請，或收回自己送出的邀請 —— 兩者都是刪掉這筆關係。"""
    rel = await get_friendship(db, me.id, user_id)
    if rel is None or rel.status is not FriendRequestStatus.pending:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "沒有這筆邀請")
    await db.delete(rel)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_friend(user_id: str, db: DbSession, me: CurrentUser) -> None:
    rel = await get_friendship(db, me.id, user_id)
    if rel is None or rel.status is not FriendRequestStatus.accepted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "你們不是好友")
    await db.delete(rel)


@router.post("/block/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def block_user(user_id: str, db: DbSession, me: CurrentUser) -> None:
    """封鎖並同時解除好友關係 —— 封鎖之後還留著好友身分沒有意義。"""
    if user_id == me.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "不能封鎖自己")

    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這個人")

    rel = await get_friendship(db, me.id, user_id)
    if rel is not None:
        await db.delete(rel)

    exists = await db.execute(
        select(Block).where(Block.blocker_id == me.id, Block.blocked_id == user_id)
    )
    if exists.scalar_one_or_none() is None:
        db.add(Block(blocker_id=me.id, blocked_id=user_id))


@router.delete("/block/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unblock_user(user_id: str, db: DbSession, me: CurrentUser) -> None:
    result = await db.execute(
        select(Block).where(Block.blocker_id == me.id, Block.blocked_id == user_id)
    )
    block = result.scalar_one_or_none()
    if block is not None:
        await db.delete(block)
