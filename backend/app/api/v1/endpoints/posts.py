from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.models import Post, PostLike, PostTag, User
from app.schemas.post import LikeOut, LikersOut, Page, PostIn, PostOut, SearchOut
from app.services.serializers import post_out, user_public
from app.utils.markup import extract_tags

router = APIRouter(prefix="/posts", tags=["posts"])

PAGE_SIZE = 10


async def _tags_of(db, post_ids: list[str]) -> dict[str, list[str]]:
    """一次撈完所有文章的標籤，避免每篇各查一次（N+1）"""
    if not post_ids:
        return {}
    rows = await db.execute(select(PostTag.post_id, PostTag.tag).where(PostTag.post_id.in_(post_ids)))
    out: dict[str, list[str]] = {}
    for post_id, tag in rows.all():
        out.setdefault(post_id, []).append(tag)
    return out


async def _liked_by(db, post_ids: list[str], viewer: User | None) -> set[str]:
    if not viewer or not post_ids:
        return set()
    rows = await db.execute(
        select(PostLike.post_id).where(
            PostLike.user_id == viewer.id, PostLike.post_id.in_(post_ids)
        )
    )
    return {r[0] for r in rows.all()}


async def _render(db, posts: list[Post], viewer: User | None) -> list[PostOut]:
    ids = [p.id for p in posts]
    tags = await _tags_of(db, ids)
    liked = await _liked_by(db, ids, viewer)
    return [
        post_out(
            p,
            author=p.author,
            tags=tags.get(p.id, []),
            liked_by_me=p.id in liked,
            viewer_id=viewer.id if viewer else None,
        )
        for p in posts
    ]


async def _sync_tags(db, post: Post, body: str) -> list[str]:
    """
    重算標籤。

    編輯文章時舊標籤可能被刪掉，所以是整批換掉而不是只新增，
    否則會留下文章裡已經不存在的標籤還能搜到。
    """
    tags = extract_tags(body)
    await db.execute(delete(PostTag).where(PostTag.post_id == post.id))
    for tag in tags:
        db.add(PostTag(post_id=post.id, tag=tag))
    return tags


@router.get("", response_model=Page[PostOut])
async def feed(
    db: DbSession,
    viewer: OptionalUser,
    cursor: str | None = Query(default=None, description="上一頁最後一篇的 id"),
    limit: int = Query(default=PAGE_SIZE, le=50),
) -> Page[PostOut]:
    """
    動態牆，刊登日期新到舊。

    游標式分頁：以「上一頁最後一篇的發布時間」往下取，
    這樣使用者在捲動時就算有人發新文章，也不會出現重複或跳過的項目。
    """
    stmt = select(Post).options(selectinload(Post.author)).order_by(Post.created_at.desc(), Post.id.desc())

    if cursor:
        anchor = await db.get(Post, cursor)
        if anchor is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "分頁游標無效")
        stmt = stmt.where(
            or_(
                Post.created_at < anchor.created_at,
                (Post.created_at == anchor.created_at) & (Post.id < anchor.id),
            )
        )

    rows = (await db.execute(stmt.limit(limit + 1))).scalars().all()
    has_more = len(rows) > limit
    page = list(rows[:limit])

    return Page[PostOut](
        items=await _render(db, page, viewer),
        nextCursor=page[-1].id if has_more and page else None,
    )


@router.post("", response_model=PostOut, status_code=status.HTTP_201_CREATED)
async def create_post(payload: PostIn, db: DbSession, me: CurrentUser) -> PostOut:
    post = Post(author_id=me.id, title=payload.title.strip(), body=payload.body)
    db.add(post)
    await db.flush()
    tags = await _sync_tags(db, post, payload.body)
    return post_out(post, author=me, tags=tags, liked_by_me=False, viewer_id=me.id)


@router.get("/{post_id}", response_model=PostOut)
async def get_post(post_id: str, db: DbSession, viewer: OptionalUser) -> PostOut:
    stmt = select(Post).options(selectinload(Post.author)).where(Post.id == post_id)
    post = (await db.execute(stmt)).scalar_one_or_none()
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這篇文章")
    return (await _render(db, [post], viewer))[0]


@router.patch("/{post_id}", response_model=PostOut)
async def update_post(post_id: str, payload: PostIn, db: DbSession, me: CurrentUser) -> PostOut:
    """
    編輯文章。

    擁有者檢查在這裡，不是靠前端隱藏編輯鈕 —— 那擋不住直接打 API 的人。

    created_at 保持不動，只更新 updated_at 並標記 edited：
    排序不會因為編輯而跳動，讀者也看得出這篇被改過。
    """
    post = await db.get(Post, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這篇文章")
    if post.author_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "你只能編輯自己的文章")

    post.title = payload.title.strip()
    post.body = payload.body
    post.updated_at = datetime.now(timezone.utc)
    post.edited = True
    tags = await _sync_tags(db, post, payload.body)

    liked = await _liked_by(db, [post.id], me)
    return post_out(post, author=me, tags=tags, liked_by_me=post.id in liked, viewer_id=me.id)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(post_id: str, db: DbSession, me: CurrentUser) -> None:
    post = await db.get(Post, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這篇文章")
    if post.author_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "你只能刪除自己的文章")
    await db.delete(post)


@router.put("/{post_id}/like", response_model=LikeOut)
async def like_post(post_id: str, db: DbSession, me: CurrentUser) -> LikeOut:
    """冪等：已經按過再按一次不會重複計數。"""
    post = await db.get(Post, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這篇文章")

    existing = await db.get(PostLike, {"post_id": post_id, "user_id": me.id})
    if existing is None:
        db.add(PostLike(post_id=post_id, user_id=me.id))
        post.like_count += 1

    return LikeOut(likeCount=post.like_count, likedByMe=True)


@router.delete("/{post_id}/like", response_model=LikeOut)
async def unlike_post(post_id: str, db: DbSession, me: CurrentUser) -> LikeOut:
    post = await db.get(Post, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這篇文章")

    existing = await db.get(PostLike, {"post_id": post_id, "user_id": me.id})
    if existing is not None:
        await db.delete(existing)
        post.like_count = max(0, post.like_count - 1)

    return LikeOut(likeCount=post.like_count, likedByMe=False)


@router.get("/{post_id}/likes", response_model=LikersOut)
async def post_likers(
    post_id: str,
    db: DbSession,
    viewer: OptionalUser,
    limit: int = Query(default=30, le=100),
) -> LikersOut:
    """誰按了讚。熱門文章可能上千人，只回一頁，總數另外給。"""
    post = await db.get(Post, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這篇文章")

    rows = await db.execute(
        select(User)
        .join(PostLike, PostLike.user_id == User.id)
        .where(PostLike.post_id == post_id)
        .order_by(PostLike.created_at.desc())
        .limit(limit)
    )
    users = list(rows.scalars().all())

    # 自己排最前面 —— 使用者最先想確認的是「我按過了嗎」
    if viewer:
        users.sort(key=lambda u: 0 if u.id == viewer.id else 1)

    return LikersOut(items=[user_public(u) for u in users], total=post.like_count)
