"""push subscriptions

Revision ID: d4f8b2c19e60
Revises: c8e3a1f70d25
Create Date: 2026-08-30

Web Push —— 瀏覽器整個關掉時也送得到通知。

原本的即時通知走 WebSocket，那條連線只在分頁開著時存在。
分頁在背景還能靠 Notification API 補上，但瀏覽器一關就完全收不到。

push_subscriptions 一個人可能有很多筆（每台裝置、每個瀏覽器各一份），
所以唯一的是 endpoint 而不是 user_id。

app_secrets 放程式自己產生、需要跨重啟保存的值，目前只有 VAPID 金鑰對。
那組金鑰必須固定 —— 換掉的話所有既有訂閱立刻失效。
存在資料庫是為了省掉「先產生金鑰再貼進後台」這個手動步驟，
每一個手動步驟都是一次可能漏掉或貼錯的機會。
"""

import sqlalchemy as sa
from alembic import op

revision = "d4f8b2c19e60"
down_revision = "c8e3a1f70d25"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=32),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("endpoint", sa.Text(), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(length=255), nullable=False),
        sa.Column("auth", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])

    op.create_table(
        "app_secrets",
        sa.Column("key", sa.String(length=64), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("app_secrets")
    op.drop_index("ix_push_subscriptions_user_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
