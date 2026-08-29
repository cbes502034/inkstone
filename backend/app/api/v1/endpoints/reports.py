from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models import Comment, Post, Report, ReportTargetType, User

router = APIRouter(prefix="/reports", tags=["moderation"])


class ReportIn(BaseModel):
    targetType: str = Field(pattern="^(post|comment|user)$")
    targetId: str
    reason: str = Field(min_length=1, max_length=1000)


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def create_report(payload: ReportIn, db: DbSession, me: CurrentUser) -> None:
    """
    檢舉內容或使用者。

    刻意**不自動下架**。自動下架會讓檢舉變成武器 ——
    幾個人合力就能讓任何文章消失。這裡只留紀錄，交給後台人工判斷。

    同一個人對同一個目標只留一筆，避免有人靠重複送出灌高權重。
    """
    kind = ReportTargetType(payload.targetType)

    # 確認目標存在，否則資料庫會累積指向不存在資源的檢舉
    exists = False
    if kind is ReportTargetType.post:
        exists = await db.get(Post, payload.targetId) is not None
    elif kind is ReportTargetType.comment:
        exists = await db.get(Comment, payload.targetId) is not None
    else:
        target = await db.get(User, payload.targetId)
        exists = target is not None
        if target is not None and target.id == me.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "不能檢舉自己")

    if not exists:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到要檢舉的對象")

    duplicate = await db.execute(
        select(Report.id).where(
            Report.reporter_id == me.id,
            Report.target_type == kind,
            Report.target_id == payload.targetId,
        )
    )
    if duplicate.first():
        # 已經檢舉過就當作成功，不告訴對方「你已經舉報過」——
        # 使用者不需要知道，重複點也不該報錯
        return None

    db.add(
        Report(
            reporter_id=me.id,
            target_type=kind,
            target_id=payload.targetId,
            reason=payload.reason.strip(),
        )
    )
