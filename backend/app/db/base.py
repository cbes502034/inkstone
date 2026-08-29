import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, TypeDecorator, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    """一律存 UTC。時區轉換交給前端，資料庫裡不留模糊空間。"""
    return datetime.now(timezone.utc)


class UtcDateTime(TypeDecorator):
    """
    保證進出資料庫的時間都是 UTC-aware。

    SQLite 沒有原生時區，存進去的 tzinfo 會被丟掉，讀回來變成 naive datetime。
    序列化之後前端收到的字串少了 +00:00，就會被當成本地時間解讀 ——
    在 UTC+8 會整整差八小時。

    Postgres 雖然保留時區，但兩邊行為不一致本身就是隱患，
    所以統一在型別層補上，應用層永遠只會拿到 UTC-aware 的值。
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    """
    所有資料表的共同基底。

    主鍵用 UUID 而非自增整數：自增 id 會洩漏「總共有多少使用者、
    這篇是第幾篇文章」這類商業資訊，也讓人可以直接枚舉別人的資源。
    """


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime, default=utcnow, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime,
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
        nullable=False,
    )


class UUIDMixin:
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
