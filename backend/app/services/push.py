"""
Web Push —— 瀏覽器整個關掉時也送得到通知。

既有的即時通知走 WebSocket，那條連線只在分頁開著時存在。分頁在背景
還能靠 Notification API 補上，但瀏覽器一關就完全收不到。Web Push 走的是
瀏覽器廠商的推播服務（Google／Mozilla／Apple），由作業系統負責喚醒。

規格要求內容端對端加密：推播服務只負責轉送，看不到通知內容。
加密與簽章由 pywebpush 處理，我們只需要一組固定的 VAPID 金鑰對。
"""

import asyncio
import base64
import json
import logging

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import AppSecret, PushSubscription

log = logging.getLogger("inkstone.push")

_PRIVATE = "vapid_private_key"
_PUBLIC = "vapid_public_key"

# 程序內快取。金鑰固定不變，不必每次送推播都查一次資料庫
_cached: tuple[str, str] | None = None


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _generate() -> tuple[str, str]:
    """產生一組 VAPID 金鑰（P-256），回傳 (私鑰, 公鑰)。"""
    key = ec.generate_private_key(ec.SECP256R1())
    private = _b64(key.private_numbers().private_value.to_bytes(32, "big"))
    public = _b64(
        key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
    )
    return private, public


async def get_keys(db: AsyncSession) -> tuple[str, str]:
    """
    取得 VAPID 金鑰對，沒有就產生一組存起來。

    環境變數優先 —— 想自己掌管金鑰的人可以設定。沒設就自己產生，
    省掉「先產生金鑰再貼進後台」這個手動步驟；每一個手動步驟
    都是一次可能漏掉或貼錯的機會。

    金鑰必須跨重啟固定：換掉的話所有既有訂閱立刻失效，
    使用者得重新授權一次。所以存進資料庫而不是放記憶體。
    """
    global _cached
    if _cached:
        return _cached

    if settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY:
        _cached = (settings.VAPID_PRIVATE_KEY, settings.VAPID_PUBLIC_KEY)
        return _cached

    rows = (
        await db.execute(select(AppSecret).where(AppSecret.key.in_([_PRIVATE, _PUBLIC])))
    ).scalars().all()
    stored = {r.key: r.value for r in rows}

    if _PRIVATE in stored and _PUBLIC in stored:
        _cached = (stored[_PRIVATE], stored[_PUBLIC])
        return _cached

    private, public = _generate()
    db.add(AppSecret(key=_PRIVATE, value=private))
    db.add(AppSecret(key=_PUBLIC, value=public))
    await db.flush()
    log.info("已產生新的 VAPID 金鑰對並存入資料庫")

    _cached = (private, public)
    return _cached


async def public_key(db: AsyncSession) -> str:
    return (await get_keys(db))[1]


async def send_to_user(db: AsyncSession, user_id: str, payload: dict) -> None:
    """
    把一則通知推給某個使用者的所有裝置。

    失敗不會往外拋 —— 推播是錦上添花，送不出去不該讓建立通知的那個
    請求（發留言、按讚）跟著失敗。
    """
    subs = (
        await db.execute(
            select(PushSubscription).where(PushSubscription.user_id == user_id)
        )
    ).scalars().all()
    if not subs:
        return

    private, public = await get_keys(db)
    body = json.dumps(payload, ensure_ascii=False)
    dead: list[str] = []

    for sub in subs:
        # pywebpush 底層用 requests，是同步阻塞的。丟到執行緒跑，
        # 否則每一則推播都會卡住事件迴圈 —— 一個人有五台裝置就是五次往返
        ok = await asyncio.to_thread(_send_one, sub, body, private)
        if ok is False:
            dead.append(sub.endpoint)

    if dead:
        # 404／410 代表這個訂閱已經失效（使用者移除了通知權限、
        # 或換了瀏覽器）。留著只會每次都白試一遍
        await db.execute(
            delete(PushSubscription).where(PushSubscription.endpoint.in_(dead))
        )
        log.info("清掉 %d 筆失效的推播訂閱", len(dead))


def _send_one(sub: PushSubscription, body: str, private_key: str) -> bool | None:
    """送一筆。回傳 False 表示這個訂閱已死、應該刪掉；None 表示暫時性失敗。"""
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=body,
            vapid_private_key=private_key,
            # 推播服務要求能聯絡到服務的擁有者，出問題時才有辦法通知
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=60 * 60 * 24,
        )
        return True
    except WebPushException as e:
        status = getattr(e.response, "status_code", None)
        if status in (404, 410):
            return False
        log.warning("推播失敗 status=%s endpoint=%s", status, sub.endpoint[:60])
        return None
    except Exception:
        log.warning("推播發生非預期例外", exc_info=True)
        return None
