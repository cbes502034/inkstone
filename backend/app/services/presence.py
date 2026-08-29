from datetime import datetime, timedelta, timezone

from app.models import User

# 心跳斷了之後的寬限期。切分頁、過隧道、短暫斷網都不該立刻被標成離線。
OFFLINE_AFTER = timedelta(seconds=45)
AWAY_AFTER = timedelta(minutes=5)


def presence_of(user: User) -> str:
    """
    由 last_seen_at 推算上線狀態。

    關掉 show_presence 的人一律回報 offline —— 這個判斷放在後端，
    不是靠前端不顯示，否則有人直接打 API 就看得到。
    """
    if not user.show_presence or user.last_seen_at is None:
        return "offline"

    seen = user.last_seen_at
    if seen.tzinfo is None:
        seen = seen.replace(tzinfo=timezone.utc)

    idle = datetime.now(timezone.utc) - seen
    if idle > AWAY_AFTER:
        return "offline"
    if idle > OFFLINE_AFTER:
        return "away"
    return "online"


def last_seen_of(user: User) -> datetime | None:
    """關閉上線狀態的人，連最後上線時間都不該外流。"""
    return user.last_seen_at if user.show_presence else None
