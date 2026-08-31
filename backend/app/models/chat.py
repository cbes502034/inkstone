"""
訊息與通知。

放在同一個檔案是因為它們共用同一條路：都是「有事發生了，要讓某個人知道」。
差別只在訊息是人主動送給人的，通知是系統代為送出的。

這個檔案裡有兩個值得學的設計，讀的時候留意：
  * DirectConversationKey —— 把「同時點擊造成重複建立」這個並行問題
    交給資料庫的唯一約束解決，而不是在應用層用檢查再新增（那是有競態的）
  * ConversationMember.last_read_at —— 用「讀到哪裡」取代「未讀幾則」，
    把一個需要同步的計數換成一個冪等的時間戳
"""

import enum
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin, UtcDateTime


class ConversationKind(str, enum.Enum):
    """
    對話的兩種型態。

    一對一與群組共用同一張表，而不是開兩張。因為訊息、成員、
    已讀位置這些東西兩者完全一樣，差別只有「有沒有名字跟群主」。
    開兩張表會讓每一支讀訊息的程式都要寫兩遍。
    """

    direct = "direct"
    group = "group"


class Conversation(Base, UUIDMixin, TimestampMixin):
    """一個聊天室，可能是一對一，也可能是群組。"""

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
    """
    誰在哪個聊天室裡。

    這是一張典型的「多對多中間表」：一個人可以在很多聊天室，
    一個聊天室有很多人。主鍵用 (conversation_id, user_id) 這個組合，
    天然保證同一個人不會被加進同一個群兩次。
    """

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
        """
        把兩個人的 id 組成一個與順序無關的鍵。

        先排序是關鍵：A 找 B 與 B 找 A 必須算出同一個鍵，
        否則唯一約束擋不住重複，兩人之間會出現兩個一對一對話。
        """
        lo, hi = sorted([user_a, user_b])
        return f"{lo}:{hi}"


class Message(Base, UUIDMixin):
    """
    一則訊息。

    created_at 這裡是必填而且沒有預設值 —— 由呼叫端明確給定。
    因為送出訊息時要同時更新 Conversation.last_message_at，
    兩個時間必須是同一個值，交給資料庫各自產生會有微小的落差，
    而那個落差會讓對話列表的排序偶爾對不上。
    """

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
    """
    系統會主動通知的五件事。

    用列舉而不是自由字串，好處是前端可以窮舉所有情況來決定顯示什麼文案，
    而且新增一種通知時，編譯期就看得出哪些地方要跟著改。
    """

    friend_request = "friend_request"
    friend_accepted = "friend_accepted"
    post_liked = "post_liked"
    post_commented = "post_commented"
    group_invited = "group_invited"


class Notification(Base, UUIDMixin, TimestampMixin):
    """
    一則通知。

    存了 href 與 preview 兩個「快照」欄位，而不是只存 kind 跟關聯 id
    再去現算。這是刻意的取捨：通知是一份歷史紀錄，
    它該保留「事情發生當下」的樣子。文章之後被刪掉、被改標題，
    通知列表也不該整排變成空白或顯示新標題。
    """

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
