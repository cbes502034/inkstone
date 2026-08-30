from fastapi import APIRouter, Query
from sqlalchemy import Integer, case, func, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import DbSession, OptionalUser
from app.models import Block, Post, PostLike, PostTag, User
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

    比對一律轉小寫，不用 ILIKE —— 那是 Postgres 專屬語法，本機 SQLite 會壞掉。
    正式環境有 pg_trgm 的三元組索引在 lower(...) 上加速這些查詢
    （見 migration a1b2c3d4e5f6，那裡也說明了為什麼不用 tsvector）。

    排序不是單純照時間：標籤精準命中最相關，其次標題，最後才是內文。
    只照時間排的話，一篇剛發的文章只因為內文提到一次關鍵字，
    就會壓過標題完全命中的舊文章。
    """
    needle = q.strip().lower()
    pattern = f"%{needle}%"

    tag_hits = select(PostTag.post_id).where(PostTag.tag == needle)

    # 相關性分數：數字越小越前面
    relevance = case(
        (Post.id.in_(tag_hits), 0),
        (func.lower(Post.title).like(pattern), 1),
        else_=2,
    ).label("relevance")

    post_stmt = (
        select(Post, relevance)
        .options(selectinload(Post.author))
        .where(
            or_(
                func.lower(Post.title).like(pattern),
                func.lower(Post.body).like(pattern),
                Post.id.in_(tag_hits),
            )
        )
        .order_by(relevance.asc(), Post.created_at.desc())
        .limit(limit)
    )
    posts = [row[0] for row in (await db.execute(post_stmt)).all()]

    # 被封鎖的雙方互相看不到對方 —— 封鎖之後還能在搜尋結果撞見，
    # 那個功能就等於沒用
    user_conditions = [
        User.is_active.is_(True),
        or_(
            func.lower(User.display_name).like(pattern),
            func.lower(User.username).like(pattern),
        ),
    ]
    if viewer:
        blocked_pairs = select(Block.blocked_id).where(Block.blocker_id == viewer.id)
        blocked_me = select(Block.blocker_id).where(Block.blocked_id == viewer.id)
        user_conditions += [
            User.id != viewer.id,
            User.id.not_in(blocked_pairs),
            User.id.not_in(blocked_me),
        ]

    # 帳號完全相同的排最前面，其次才是部分命中
    exact_first = case(
        (func.lower(User.username) == needle, 0),
        (func.lower(User.display_name) == needle, 1),
        else_=2,
    )
    user_stmt = (
        select(User)
        .where(*user_conditions)
        .order_by(exact_first.asc(), User.username.asc())
        .limit(limit)
    )
    users = list((await db.execute(user_stmt)).scalars().all())

    # 一次撈齊標籤與按讚狀態，避免每篇各查一次
    ids = [p.id for p in posts]
    tags: dict[str, list[str]] = {}
    if ids:
        rows = await db.execute(
            select(PostTag.post_id, PostTag.tag).where(PostTag.post_id.in_(ids))
        )
        for pid, tag in rows.all():
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
