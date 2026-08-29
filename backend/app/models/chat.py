import enum
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin, UtcDateTime


class ConversationKind(str, enum.Enum):
    direct = "direct"
    group = "group"


class Conversation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "conversations"

    kind: Mapped[ConversationKind] = mapped_column(
        Enum(ConversationKind, native_enum=False), nullable=False
    )
    # 群組才有名稱；一對一顯示對方的名字，由後端組出來
    name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 群主：可以改群名、邀請與移除成員、解散群組。一對一沒有群主。
    owner_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # 用來排序對話列表。每次有新訊息就更新，避免每次都去 join 最後一則訊息。
    last_message_at: Mapped[datetime | None] = mapped_column(
        UtcDateTime, nullable=True, index=True
    )

    members = relationship(
        "ConversationMember", back_populates="conversation", cascade="all, delete-orphan"
    )
    messages = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan"
    )


class ConversationMember(Base, TimestampMixin):
    __tablename__ = "conversation_members"
    __table_args__ = (Index("ix_member_user", "user_id"),)

    conversation_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    # 未讀數不另存計數，改記「讀到哪裡」。
    # 存計數在多裝置同時開著時很容易對不上，記時間戳則是冪等的。
    last_read_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)

    conversation = relationship("Conversation", back_populates="members")
    user = relationship("User")


class DirectConversationKey(Base):
    """
    一對一對話的唯一鍵。

    兩個人之間只能有一個一對一對話。把兩個 id 排序後存成一個鍵並加唯一約束，
    由資料庫保證唯一 —— 兩邊同時點「傳訊息」也不會各自建立一個。
    """

    __tablename__ = "direct_conversation_keys"
    __table_args__ = (UniqueConstraint("pair_key", name="uq_direct_pair"),)

    conversation_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True
    )
    pair_key: Mapped[str] = mapped_column(String(72), nullable=False, index=True)

    @staticmethod
    def build_key(user_a: str, user_b: str) -> str:
        lo, hi = sorted([user_a, user_b])
        return f"{lo}:{hi}"


class Message(Base, UUIDMixin):
    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_conv_created", "conversation_id", "created_at"),)

    conversation_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime, nullable=False, index=True
    )

    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User")


class NotificationKind(str, enum.Enum):
    friend_request = "friend_request"
    friend_accepted = "friend_accepted"
    post_liked = "post_liked"
    post_commented = "post_commented"
    group_invited = "group_invited"


class Notification(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_created", "user_id", "created_at"),)

    # 收件者
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # 觸發者
    actor_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[NotificationKind] = mapped_column(
        Enum(NotificationKind, native_enum=False), nullable=False
    )
    href: Mapped[str] = mapped_column(String(255), nullable=False)
    preview: Mapped[str] = mapped_column(Text, default="", nullable=False)
    read: Mapped[bool] = mapped_column(default=False, nullable=False)

    actor = relationship("User", foreign_keys=[actor_id])
