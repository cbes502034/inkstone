from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import DbSession, OptionalUser
from app.models import Post, PostLike, PostTag, User
from app.schemas.post import SearchOut
from app.services.serializers import post_out, user_public

router = APIRouter(tags=["search"])


@router.get("/search", response_model=SearchOut)
async def search(
    db: DbSession,
    viewer: OptionalUser,
    q: str = Query(min_length=1, max_length=100),
    limit: int = Query(default=20, le=50),
) -> SearchOut:
    """
    搜文章與找人。

    比對一律轉小寫再比，不用 ILIKE —— 那是 Postgres 專屬語法，
    本機 SQLite 會直接壞掉。func.lower() 兩邊都能跑。

    待辦：資料量大之後要換成全文檢索（Postgres 的 tsvector），
    目前的 LIKE '%...%' 走不到索引。
    """
    needle = q.strip().lower()
    pattern = f"%{needle}%"

    # 標籤精準命中，或標題內文模糊命中
    tag_hits = select(PostTag.post_id).where(PostTag.tag == needle)

    post_stmt = (
        select(Post)
        .options(selectinload(Post.author))
        .where(
            or_(
                func.lower(Post.title).like(pattern),
                func.lower(Post.body).like(pattern),
                Post.id.in_(tag_hits),
            )
        )
        .order_by(Post.created_at.desc())
        .limit(limit)
    )
    posts = list((await db.execute(post_stmt)).scalars().all())

    user_stmt = (
        select(User)
        .where(
            User.is_active.is_(True),
            or_(
                func.lower(User.display_name).like(pattern),
                func.lower(User.username).like(pattern),
            ),
        )
        .limit(limit)
    )
    users = [u for u in (await db.execute(user_stmt)).scalars().all()]
    if viewer:
        users = [u for u in users if u.id != viewer.id]

    # 一次撈齊標籤與按讚狀態，避免每篇各查一次
    ids = [p.id for p in posts]
    tag_rows = await db.execute(select(PostTag.post_id, PostTag.tag).where(PostTag.post_id.in_(ids)))
    tags: dict[str, list[str]] = {}
    for pid, tag in tag_rows.all():
        tags.setdefault(pid, []).append(tag)

    liked: set[str] = set()
    if viewer and ids:
        rows = await db.execute(
            select(PostLike.post_id).where(
                PostLike.user_id == viewer.id, PostLike.post_id.in_(ids)
            )
        )
        liked = {r[0] for r in rows.all()}

    return SearchOut(
        posts=[
            post_out(
                p,
                author=p.author,
                tags=tags.get(p.id, []),
                liked_by_me=p.id in liked,
                viewer_id=viewer.id if viewer else None,
            )
            for p in posts
        ],
        users=[user_public(u) for u in users],
    )
