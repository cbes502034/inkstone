from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.models import Comment, Notification, NotificationKind, Post
from app.schemas.post import CommentIn, CommentOut
from app.services.serializers import user_public
from app.utils.markup import excerpt

router = APIRouter(tags=["comments"])


def _out(comment: Comment, viewer_id: str | None) -> CommentOut:
    return CommentOut(
        id=comment.id,
        postId=comment.post_id,
        author=user_public(comment.author),
        body=comment.body,
        createdAt=comment.created_at,
        isMine=viewer_id is not None and comment.author_id == viewer_id,
    )


@router.get("/posts/{post_id}/comments", response_model=list[CommentOut])
async def list_comments(post_id: str, db: DbSession, viewer: OptionalUser) -> list[CommentOut]:
    stmt = (
        select(Comment)
        .options(selectinload(Comment.author))
        .where(Comment.post_id == post_id)
        .order_by(Comment.created_at.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_out(c, viewer.id if viewer else None) for c in rows]


@router.post(
    "/posts/{post_id}/comments",
    response_model=CommentOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    post_id: str, payload: CommentIn, db: DbSession, me: CurrentUser
) -> CommentOut:
    post = await db.get(Post, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這篇文章")

    comment = Comment(post_id=post_id, author_id=me.id, body=payload.body.strip())
    db.add(comment)
    # 計數與留言在同一個交易裡更新，不會對不上
    post.comment_count += 1
    await db.flush()

    # 不通知自己在自己文章下的留言
    if post.author_id != me.id:
        db.add(
            Notification(
                user_id=post.author_id,
                actor_id=me.id,
                kind=NotificationKind.post_commented,
                href=f"/post/{post_id}",
                preview=excerpt(comment.body, 80),
            )
        )

    comment.author = me
    return _out(comment, me.id)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(comment_id: str, db: DbSession, me: CurrentUser) -> None:
    """留言本人可刪；文章作者也可以刪自己文章底下的留言。"""
    comment = await db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這則留言")

    post = await db.get(Post, comment.post_id)
    allowed = comment.author_id == me.id or (post is not None and post.author_id == me.id)
    if not allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "沒有權限刪除這則留言")

    if post is not None:
        post.comment_count = max(0, post.comment_count - 1)
    await db.delete(comment)
