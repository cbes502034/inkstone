"""
通知：寫進資料庫，同時即時推送。

兩者缺一不可 ——
  只推送不入庫：使用者當下沒開網站就永遠收不到。
  只入庫不推送：要等下次重新整理才看得到，不算即時。

推送失敗不能讓主要動作失敗。按讚、留言本身已經成功了，
沒有理由因為對方剛好斷線就整個回滾。
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, NotificationKind, User
from app.services.realtime import hub
from app.services.serializers import user_public

log = logging.getLogger("inkstone.notify")


async def create(
    db: AsyncSession,
    *,
    user_id: str,
    actor: User,
    kind: NotificationKind,
    href: str,
    preview: str = "",
) -> Notification | None:
    """建立一則通知並即時推給收件者。自己觸發的事件不通知自己。"""
    if user_id == actor.id:
        return None

    note = Notification(
        user_id=user_id,
        actor_id=actor.id,
        kind=kind,
        href=href,
        preview=preview,
    )
    db.add(note)
    await db.flush()

    payload = {
        "id": note.id,
        "kind": kind.value,
        "actor": user_public(actor).model_dump(mode="json"),
        "href": href,
        "preview": preview,
        "read": False,
        "createdAt": note.created_at.isoformat(),
    }

    try:
        await hub.send_to(user_id, "notification", payload)
    except Exception:
        # 通知已經入庫，下次開網站一定看得到，推送失敗不影響正確性
        log.warning("通知推送失敗 user=%s", user_id, exc_info=True)

    return note
