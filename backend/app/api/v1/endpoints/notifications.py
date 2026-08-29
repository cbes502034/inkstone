from fastapi import APIRouter, Query, status
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession
from app.models import Notification
from app.schemas.chat import NotificationOut
from app.services.serializers import user_public

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    db: DbSession, me: CurrentUser, limit: int = Query(default=50, le=100)
) -> list[NotificationOut]:
    stmt = (
        select(Notification)
        .options(selectinload(Notification.actor))
        .where(Notification.user_id == me.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [
        NotificationOut(
            id=n.id,
            kind=n.kind.value,
            actor=user_public(n.actor),
            href=n.href,
            preview=n.preview,
            read=n.read,
            createdAt=n.created_at,
        )
        for n in rows
    ]


@router.post("/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(db: DbSession, me: CurrentUser) -> None:
    # 一句 UPDATE 就好，不必先撈出來再一筆筆改
    await db.execute(
        update(Notification)
        .where(Notification.user_id == me.id, Notification.read.is_(False))
        .values(read=True)
    )
