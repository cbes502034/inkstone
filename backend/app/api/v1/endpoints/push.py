from fastapi import APIRouter, status
from pydantic import BaseModel
from sqlalchemy import delete, select

from app.core.deps import CurrentUser, DbSession
from app.models import PushSubscription
from app.services import push as push_service

router = APIRouter(prefix="/push", tags=["push"])


class SubscriptionIn(BaseModel):
    """瀏覽器 PushManager.subscribe() 回傳的那包東西。"""

    endpoint: str
    p256dh: str
    auth: str


class PublicKeyOut(BaseModel):
    publicKey: str


@router.get("/key", response_model=PublicKeyOut)
async def get_public_key(db: DbSession) -> PublicKeyOut:
    """
    訂閱推播需要的公鑰。

    公開端點：這把金鑰本來就是要給瀏覽器的，藏起來沒有意義。
    做成端點而不是前端的建置期環境變數，是為了讓金鑰只有一個來源 ——
    後端換了金鑰，前端不必重新建置就會跟上。
    """
    return PublicKeyOut(publicKey=await push_service.public_key(db))


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe(payload: SubscriptionIn, db: DbSession, me: CurrentUser) -> None:
    """
    記下這台裝置的推播訂閱。

    同一個 endpoint 重複送過來要覆蓋而不是報錯 —— 瀏覽器可能在任何時候
    重新產生訂閱（權限重新授權、快取被清），前端不該為此特別處理。
    """
    existing = (
        await db.execute(
            select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)
        )
    ).scalar_one_or_none()

    if existing is not None:
        # 換人登入同一台裝置時，訂閱要跟著換人，否則通知會送錯對象
        existing.user_id = me.id
        existing.p256dh = payload.p256dh
        existing.auth = payload.auth
        return None

    db.add(
        PushSubscription(
            user_id=me.id,
            endpoint=payload.endpoint,
            p256dh=payload.p256dh,
            auth=payload.auth,
        )
    )


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(payload: SubscriptionIn, db: DbSession, me: CurrentUser) -> None:
    """
    關掉這台裝置的推播。

    用 POST 而不是 DELETE：要帶 endpoint 進來（那是一段很長的網址），
    而 DELETE 的請求主體在部分代理與客戶端會被剝掉。

    只刪自己的 —— 帶別人的 endpoint 來也刪不掉。
    """
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint,
            PushSubscription.user_id == me.id,
        )
    )
