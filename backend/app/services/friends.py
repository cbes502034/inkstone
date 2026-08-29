from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Block, Friendship, FriendRequestStatus


async def get_friendship(db: AsyncSession, a: str, b: str) -> Friendship | None:
    """
    取出兩人之間的關係。

    只存一列（requester → addressee），所以兩個方向都要查 ——
    否則 B 查 A 的時候會以為沒有關係。
    """
    stmt = select(Friendship).where(
        or_(
            and_(Friendship.requester_id == a, Friendship.addressee_id == b),
            and_(Friendship.requester_id == b, Friendship.addressee_id == a),
        )
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def is_blocked(db: AsyncSession, viewer_id: str, other_id: str) -> bool:
    """任一方封鎖了對方都算 —— 封鎖是雙向生效的。"""
    stmt = select(Block.id).where(
        or_(
            and_(Block.blocker_id == viewer_id, Block.blocked_id == other_id),
            and_(Block.blocker_id == other_id, Block.blocked_id == viewer_id),
        )
    )
    return (await db.execute(stmt)).first() is not None


async def friend_state(db: AsyncSession, viewer_id: str, other_id: str) -> str:
    """other 相對於 viewer 的關係狀態，對應前端的 FriendState。"""
    if viewer_id == other_id:
        return "self"

    if await is_blocked(db, viewer_id, other_id):
        return "blocked"

    rel = await get_friendship(db, viewer_id, other_id)
    if rel is None or rel.status is FriendRequestStatus.declined:
        return "none"
    if rel.status is FriendRequestStatus.accepted:
        return "friends"

    # pending：看邀請是誰送的
    return "outgoing" if rel.requester_id == viewer_id else "incoming"


async def friend_count(db: AsyncSession, user_id: str) -> int:
    stmt = select(func.count(Friendship.id)).where(
        Friendship.status == FriendRequestStatus.accepted,
        or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id),
    )
    return (await db.scalar(stmt)) or 0


async def friend_ids(db: AsyncSession, user_id: str) -> list[str]:
    stmt = select(Friendship).where(
        Friendship.status == FriendRequestStatus.accepted,
        or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id),
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [r.addressee_id if r.requester_id == user_id else r.requester_id for r in rows]
