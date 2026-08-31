"""
資料層的地基。

這個檔案不描述任何一張資料表，它定義的是「所有資料表共同遵守的規矩」：
主鍵長什麼樣、時間怎麼存、欄位的預設值從哪來。

之所以要有這一層，是因為這些決定一旦不一致，錯誤會散落在整個系統各處
而且極難追查 —— 例如某張表存 naive datetime、另一張存 aware，
兩者相減會直接丟例外，而那個例外會出現在離錯誤來源很遠的地方。
把規矩集中在這裡，每張表只要繼承就自動正確。
"""

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
        """往資料庫寫的方向：把任何時間先轉成 UTC 再存。"""
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        """從資料庫讀的方向：把少了時區的值補回 UTC-aware。"""
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


def new_id() -> str:
    """
    產生一個新的主鍵：32 個十六進位字元的 UUID4。

    用 .hex 而不是帶連字號的字串，是為了讓它塞得進 String(32)，
    也讓它出現在網址裡時不需要額外編碼。
    """
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    """
    所有資料表的共同基底。

    主鍵用 UUID 而非自增整數：自增 id 會洩漏「總共有多少使用者、
    這篇是第幾篇文章」這類商業資訊，也讓人可以直接枚舉別人的資源。
    """


class TimestampMixin:
    """
    給資料表補上「建立時間」與「最後修改時間」兩個欄位。

    兩邊都設值是刻意的：default 由 Python 在新增時填入，
    server_default 則讓資料庫在有人繞過 ORM（手動 SQL、資料修補）時
    仍然填得出來。少了任何一邊，都會有某條路徑寫進 NULL。

    onupdate 只掛在 updated_at 上，所以 created_at 一旦寫入就不再變動。
    """

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
    """
    給資料表補上一個 UUID 主鍵。

    不是每張表都用得到 —— 像 PostLike 用 (post_id, user_id) 當複合主鍵，
    那個組合本身就是唯一的，再多一個 id 只是多佔空間。
    """

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
