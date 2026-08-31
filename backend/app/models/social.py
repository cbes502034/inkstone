"""
人與人之間的關係：留言、好友、封鎖、檢舉。

這四件事共通的地方是它們都牽涉到「兩個使用者」，而且都需要防止
單方面的行為造成傷害 —— 好友要對方同意、封鎖要能真的擋住、
檢舉不能被拿來當攻擊工具。社群功能的難處從來不是資料表怎麼開，
而是這些規則想不想得周全。
"""

import enum

from sqlalchemy import Enum, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class Comment(Base, UUIDMixin, TimestampMixin):
    """
    一則留言。

    刻意做成單層，沒有 parent_id、不支援回覆的回覆。巢狀留言需要遞迴查詢、
    需要決定展開幾層、需要處理「父留言被刪但子留言還在」——
    對這個規模的站台，那些複雜度換不到相應的價值。

    索引開在 (post_id, created_at)：讀一篇文章的留言永遠是
    「這篇的、依時間排」，這條複合索引正好對應那個查詢。
    """

    __tablename__ = "comments"
    __table_args__ = (Index("ix_comments_post_created", "post_id", "created_at"),)

    post_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)

    post = relationship("Post", back_populates="comments")
    author = relationship("User", back_populates="comments")


class FriendRequestStatus(str, enum.Enum):
    """
    好友邀請的三種狀態。

    繼承 str 是個常見技巧：這樣列舉值本身就是字串，
    序列化成 JSON 時直接得到 "pending"，不需要額外轉換。
    """

    pending = "pending"
    accepted = "accepted"
    declined = "declined"


class Friendship(Base, UUIDMixin, TimestampMixin):
    """
    好友關係。

    一律是「邀請 → 對方接受」的雙向流程，不允許單方面把人加成好友，
    否則等於任何人都能硬塞進別人的好友名單。

    只存一列（requester → addressee），不重複存反向，
    查詢時兩個方向都要看 —— 這樣不會出現只有一邊成立的髒資料。
    """

    __tablename__ = "friendships"
    __table_args__ = (
        UniqueConstraint("requester_id", "addressee_id", name="uq_friendship_pair"),
        Index("ix_friendship_addressee", "addressee_id", "status"),
        Index("ix_friendship_requester", "requester_id", "status"),
    )

    requester_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    addressee_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[FriendRequestStatus] = mapped_column(
        Enum(FriendRequestStatus, native_enum=False),
        default=FriendRequestStatus.pending,
        nullable=False,
    )

    requester = relationship("User", foreign_keys=[requester_id])
    addressee = relationship("User", foreign_keys=[addressee_id])


class Block(Base, UUIDMixin, TimestampMixin):
    """
    封鎖。

    真實用戶就會有真實的騷擾，這是上線前的必要配備而不是加分項。
    被封鎖的人看不到對方的文章、無法邀請好友、無法傳訊息。
    """

    __tablename__ = "blocks"
    __table_args__ = (UniqueConstraint("blocker_id", "blocked_id", name="uq_block_pair"),)

    blocker_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    blocked_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )


class ReportTargetType(str, enum.Enum):
    """可以被檢舉的三種東西。"""

    post = "post"
    comment = "comment"
    user = "user"


class Report(Base, UUIDMixin, TimestampMixin):
    """檢舉。留給後台處理，不自動下架 —— 避免被人拿檢舉當武器。"""

    __tablename__ = "reports"

    reporter_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    target_type: Mapped[ReportTargetType] = mapped_column(
        Enum(ReportTargetType, native_enum=False), nullable=False
    )
    target_id: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    resolved: Mapped[bool] = mapped_column(default=False, nullable=False)
