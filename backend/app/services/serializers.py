"""
ORM → API 回應的轉換。

集中在這裡是為了「私密欄位不外流」這件事只需要在一個地方做對：
只要所有端點都用 user_public()，就不可能有某支 API 不小心把 email 吐出去。
"""

from app.models import Post, User
from app.schemas.post import PostOut
from app.schemas.user import UserPublic
from app.services.presence import last_seen_of, presence_of


def user_public(user: User) -> UserPublic:
    return UserPublic(
        id=user.id,
        username=user.username,
        displayName=user.display_name,
        avatarUrl=user.avatar_url,
        bio=user.bio,
        createdAt=user.created_at,
        presence=presence_of(user),
        lastSeenAt=last_seen_of(user),
    )


def post_out(
    post: Post,
    *,
    author: User,
    tags: list[str],
    liked_by_me: bool,
    viewer_id: str | None,
) -> PostOut:
    return PostOut(
        id=post.id,
        author=user_public(author),
        title=post.title,
        body=post.body,
        tags=tags,
        coverUrl=post.cover_url,
        createdAt=post.created_at,
        updatedAt=post.updated_at,
        edited=post.edited,
        likeCount=post.like_count,
        commentCount=post.comment_count,
        likedByMe=liked_by_me,
        # 前端靠這個決定要不要顯示編輯鈕，但真正的權限在後端每支寫入端點各自驗
        isMine=viewer_id is not None and post.author_id == viewer_id,
    )
