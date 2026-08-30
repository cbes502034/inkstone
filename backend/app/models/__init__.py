"""
所有 ORM 模型集中匯入。

Alembic 的 autogenerate 與 Base.metadata.create_all 都靠這裡才看得到全部資料表，
少匯入一個就會漏掉那張表。
"""

from app.models.chat import (
    Conversation,
    ConversationKind,
    ConversationMember,
    DirectConversationKey,
    Message,
    Notification,
    NotificationKind,
)
from app.models.media import MediaObject
from app.models.pending import PasswordReset, PendingRegistration
from app.models.post import Post, PostLike, PostTag
from app.models.social import (
    Block,
    Comment,
    Friendship,
    FriendRequestStatus,
    Report,
    ReportTargetType,
)
from app.models.user import User

__all__ = [
    "User",
    "MediaObject",
    "PendingRegistration",
    "PasswordReset",
    "Post",
    "PostTag",
    "PostLike",
    "Comment",
    "Friendship",
    "FriendRequestStatus",
    "Block",
    "Report",
    "ReportTargetType",
    "Conversation",
    "ConversationKind",
    "ConversationMember",
    "DirectConversationKey",
    "Message",
    "Notification",
    "NotificationKind",
]
