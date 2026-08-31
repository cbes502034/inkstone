"""
兩種一次性的票證：註冊驗證與重設密碼。

共同的模式值得記住 —— 寄出去的是明碼 token，資料庫裡只留它的雜湊。
這樣「持有那封信」才等於「有權限」，而讀得到資料庫並不等於。
"""

from datetime import datetime

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin, UtcDateTime


class PendingRegistration(Base, UUIDMixin, TimestampMixin):
    """
    待驗證的註冊。

    信箱驗證完成前不建立 User —— 否則資料庫會累積大量沒驗證的殭屍帳號，
    而且那些帳號會佔用帳號名稱與信箱的唯一性。

    這張表同時扮演「保留位」的角色：A 送出註冊後、還沒點信之前，
    B 不能拿同一個帳號名去註冊。過期後由清理程序釋出。
    """

    __tablename__ = "pending_registrations"
    __table_args__ = (
        Index("ix_pending_username", "username"),
        Index("ix_pending_email", "email"),
        Index("ix_pending_expires", "expires_at"),
    )

    username: Mapped[str] = mapped_column(String(32), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)

    # 只存雜湊。資料庫萬一外洩，拿到這張表也無法冒用他人信箱完成註冊 ——
    # 這跟密碼不存明碼是同一個道理，驗證連結等同一次性的通行證。
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    expires_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)

    # 防止有人不斷重送驗證信轟炸別人的信箱
    send_count: Mapped[int] = mapped_column(default=1, nullable=False)
    last_sent_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)


class PasswordReset(Base, UUIDMixin, TimestampMixin):
    """
    重設密碼的票證。

    與註冊票證分開兩張表，不共用 —— 兩者的生命週期、有效期與
    「用完之後要做什麼」都不同，混在一起遲早會出現用註冊票證改別人密碼的漏洞。

    同樣只存雜湊。這張票的權限比註冊票更高（可以接管既有帳號），
    所以有效期設得更短。
    """

    __tablename__ = "password_resets"
    __table_args__ = (
        Index("ix_reset_user", "user_id"),
        Index("ix_reset_expires", "expires_at"),
    )

    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    last_sent_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
