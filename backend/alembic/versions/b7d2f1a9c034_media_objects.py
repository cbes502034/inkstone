"""media objects

Revision ID: b7d2f1a9c034
Revises: a1b2c3d4e5f6
Create Date: 2026-08-30

把頭像從欄位裡搬出來。

原本 users.avatar_url 存的是整串 base64 data URL。那代表**每一次**
回傳使用者資料時，都會把幾十 KB 的圖片再送一遍 —— 首頁二十篇文章
就是二十張頭像，而且瀏覽器完全無法快取，它看到的是 JSON 不是圖片。

改成獨立一張表，主鍵用內容的 SHA-256（內容定址）：
  * 同一張圖只存一份，不論多少人上傳
  * 網址由內容決定，所以永遠不會指到別的東西，可以快取一年
  * 之後要搬去物件儲存，只換 data 欄位的來源，網址格式不用動

這支 migration 會把既有的 data URL 一併搬過去，使用者不會看到頭像消失。
"""

import base64
import hashlib
import re
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op

revision = "b7d2f1a9c034"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None

_DATA_URL = re.compile(r"^data:image/([a-z]+);base64,(.+)$", re.DOTALL)
_PREFIX = "/api/v1/media/"


def upgrade() -> None:
    op.create_table(
        "media_objects",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("content_type", sa.String(length=64), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    _migrate_column("users")
    _migrate_column("conversations")


def _migrate_column(table: str) -> None:
    """把某張表的 avatar_url 從 data URL 換成 media 網址。"""
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            f"SELECT id, avatar_url FROM {table} "  # noqa: S608 — table 是寫死的字面值
            "WHERE avatar_url IS NOT NULL AND avatar_url LIKE 'data:image/%'"
        )
    ).fetchall()

    now = datetime.now(timezone.utc)
    seen: set[str] = set()

    for row_id, data_url in rows:
        match = _DATA_URL.match(data_url)
        if not match:
            continue
        try:
            blob = base64.b64decode(match.group(2), validate=True)
        except Exception:
            # 壞掉的資料就讓它退回文字頭像，不要讓整支 migration 掛掉
            continue

        digest = hashlib.sha256(blob).hexdigest()
        if digest not in seen:
            seen.add(digest)
            # 兩張表可能引用到同一張圖，先確認沒存過
            exists = conn.execute(
                sa.text("SELECT 1 FROM media_objects WHERE id = :id"), {"id": digest}
            ).first()
            if exists is None:
                conn.execute(
                    sa.text(
                        "INSERT INTO media_objects "
                        "(id, content_type, byte_size, data, created_at) "
                        "VALUES (:id, :ct, :size, :data, :now)"
                    ),
                    {
                        "id": digest,
                        "ct": f"image/{match.group(1)}",
                        "size": len(blob),
                        "data": blob,
                        "now": now,
                    },
                )

        conn.execute(
            sa.text(f"UPDATE {table} SET avatar_url = :url WHERE id = :id"),  # noqa: S608
            {"url": f"{_PREFIX}{digest}.webp", "id": row_id},
        )


def downgrade() -> None:
    # 把圖片塞回欄位裡，退版之後頭像才不會整批消失
    conn = op.get_bind()
    for table in ("users", "conversations"):
        rows = conn.execute(
            sa.text(
                f"SELECT id, avatar_url FROM {table} "  # noqa: S608
                "WHERE avatar_url LIKE :like"
            ),
            {"like": f"{_PREFIX}%"},
        ).fetchall()
        for row_id, url in rows:
            digest = url.removeprefix(_PREFIX).removesuffix(".webp")
            obj = conn.execute(
                sa.text("SELECT content_type, data FROM media_objects WHERE id = :id"),
                {"id": digest},
            ).first()
            if obj is None:
                continue
            encoded = base64.b64encode(obj[1]).decode()
            conn.execute(
                sa.text(f"UPDATE {table} SET avatar_url = :url WHERE id = :id"),  # noqa: S608
                {"url": f"data:{obj[0]};base64,{encoded}", "id": row_id},
            )

    op.drop_table("media_objects")
