from datetime import datetime

from sqlalchemy import Boolean, Integer, String, Text
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

    # --- session 世代 ---
    # 每張 token 都帶著簽發當下的世代編號，對不上就不認。
    # 重設密碼時 +1，於是所有既有 token 一次全部作廢。
    #
    # 為什麼不用撤銷名單：那份名單是「逐張」撤銷的（登出時記下該張的
    # jti），刻意如此 —— 在手機登出不該把桌機也踢掉。但改密碼要的正好
    # 相反，是一次撤掉這個人的全部，而伺服器並沒有記錄它發過哪些 token。
    #
    # 為什麼不用時間界線：JWT 的 iat 只精確到秒。界線帶毫秒的話，
    # 重設後不到一秒就登入拿到的新 token 會被判定為「比界線早」而失效，
    # 使用者根本進不去；對齊到整秒的話，同一秒內簽發的舊 token 又躲得掉。
    # 整數比較沒有這個問題。
    token_generation: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )

    # --- 帳號狀態 ---
    # 停權不刪資料：留言、文章的關聯還在，之後要申訴或還原才有依據
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    posts = relationship("Post", back_populates="author", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="author", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User {self.username}>"
