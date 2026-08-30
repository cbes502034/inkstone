"""token epoch

Revision ID: c8e3a1f70d25
Revises: b7d2f1a9c034
Create Date: 2026-08-30

改密碼之後，既有的 token 應該一併失效。

原本做不到：撤銷名單是「逐張」撤銷的（登出時記下那一張的 jti），
刻意如此 —— 在手機登出不該把桌機也一起踢掉。但改密碼要的正好相反，
是一次撤掉這個人的全部，而伺服器並沒有記錄它發過哪些 token。

改用世代編號：每張 token 帶著簽發當下的世代，對不上就不認，
重設密碼時 +1。一個整數、一次比較，不必額外查快取。

不用時間界線是因為 JWT 的 iat 只精確到秒：界線帶毫秒的話，重設後
不到一秒就登入拿到的新 token 會被判定為「比界線早」而失效，使用者
根本進不去；對齊到整秒的話，同一秒內簽發的舊 token 又躲得掉。
整數比較沒有這個問題。

既有使用者預設 0，而尚未改過密碼的人世代也是 0，所以不會被登出。
"""

import sqlalchemy as sa
from alembic import op

revision = "c8e3a1f70d25"
down_revision = "b7d2f1a9c034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "token_generation", sa.Integer(), nullable=False, server_default="0"
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "token_generation")
