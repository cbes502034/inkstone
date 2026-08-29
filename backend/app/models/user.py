from datetime import datetime

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin, UtcDateTime


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    # 帳號一經建立不可更改 —— 別人可能已經用 @username 連到這個人
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    display_name: Mapped[str] = mapped_column(String(60), nullable=False)
    bio: Mapped[str] = mapped_column(Text, default="", nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # --- 上線狀態 ---
    # 由 WebSocket 心跳維護。關掉 show_presence 之後，
    # 對外一律回報 offline 且不提供 last_seen_at。
    last_seen_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    show_presence: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # --- 帳號狀態 ---
    # 停權不刪資料：留言、文章的關聯還在，之後要申訴或還原才有依據
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    posts = relationship("Post", back_populates="author", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="author", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User {self.username}>"
