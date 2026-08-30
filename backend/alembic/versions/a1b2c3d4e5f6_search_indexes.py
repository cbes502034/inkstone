"""search indexes

Revision ID: a1b2c3d4e5f6
Revises: 8c97ca614fbf
Create Date: 2026-08-30

搜尋加速。

刻意用 pg_trgm 三元組索引，而不是 Postgres 的全文檢索（tsvector）：

  Postgres 內建的分詞器不會斷中文詞 —— 中文沒有空格，
  to_tsvector('simple', '深度學習') 會被當成一個大詞，
  搜「學習」就找不到。要正確斷詞需要 zhparser 或 pg_jieba 這類擴充，
  Supabase 沒有提供。

  三元組索引把字串切成連續三字的片段建索引，中文一樣有效，
  而且直接加速現有的 LIKE '%...%' 查詢，應用層的程式不用改。

這支 migration 在 SQLite 上是空操作 —— 本機開發資料量小，
全表掃描比建索引還快，也沒有 pg_trgm。
"""

from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "8c97ca614fbf"
branch_labels = None
depends_on = None


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if not _is_postgres():
        return

    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # 索引建在 lower(...) 上，因為查詢也是先轉小寫再比。
    # 建在原欄位上的話這些索引一次都不會被用到。
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_posts_title_trgm "
        "ON posts USING gin (lower(title) gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_posts_body_trgm "
        "ON posts USING gin (lower(body) gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_users_display_name_trgm "
        "ON users USING gin (lower(display_name) gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_users_username_trgm "
        "ON users USING gin (lower(username) gin_trgm_ops)"
    )
    # 標籤目前是精準比對，但之後要支援「輸入一半就提示」也會用到
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_post_tags_trgm "
        "ON post_tags USING gin (tag gin_trgm_ops)"
    )


def downgrade() -> None:
    if not _is_postgres():
        return

    for name in (
        "ix_posts_title_trgm",
        "ix_posts_body_trgm",
        "ix_users_display_name_trgm",
        "ix_users_username_trgm",
        "ix_post_tags_trgm",
    ):
        op.execute(f"DROP INDEX IF EXISTS {name}")

    # 不移除 pg_trgm ——其他地方可能也在用，砍掉會波及無辜
