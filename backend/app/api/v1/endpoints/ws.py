import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.security import TokenError, decode_token
from app.db.session import SessionLocal
from app.models import User
from app.services.realtime import hub

router = APIRouter(tags=["realtime"])
log = logging.getLogger("inkstone.ws")

# 伺服器主動探活的間隔。中間的反向代理常在 60 秒無流量時砍掉連線，
# 定期送 ping 讓連線保持活著。
HEARTBEAT_SECONDS = 25


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(...)) -> None:
    """
    即時通道：通知、聊天訊息、上線狀態。

    驗證用 query string 帶 token 而不是 Authorization 標頭 ——
    瀏覽器的 WebSocket API 不支援自訂標頭，這是這個場景的標準做法。
    代價是 token 會進伺服器存取日誌，所以用短效的 access token，
    不是 refresh token。
    """
    try:
        user_id = decode_token(token, expect="access")
    except TokenError:
        # 1008 = Policy Violation，讓前端能分辨是驗證失敗而不是網路問題
        await ws.close(code=1008, reason="invalid token")
        return

    async with SessionLocal() as db:
        user = await db.get(User, user_id)
        if user is None or not user.is_active:
            await ws.close(code=1008, reason="user not found")
            return

    await hub.connect(user_id, ws)
    await _mark_seen(user_id)

    # 上線狀態改變要讓別人知道
    await _notify_presence(user_id, "online")

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_SECONDS)
            await ws.send_json({"event": "ping", "data": None})
            # 有連線就代表人在線上，順手更新 last_seen
            await _mark_seen(user_id)

    beat = asyncio.create_task(heartbeat())

    try:
        while True:
            msg = await ws.receive_json()
            event = msg.get("event")

            if event == "pong":
                continue

            if event == "typing":
                await _relay_typing(user_id, msg.get("conversationId"))
                continue
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("WebSocket 發生未預期的錯誤 user=%s", user_id)
    finally:
        beat.cancel()
        await hub.disconnect(user_id, ws)
        # 只有在這個人所有分頁都關掉之後才算離線
        if not hub.is_online(user_id):
            await _notify_presence(user_id, "offline")


async def _relay_typing(user_id: str, conversation_id: str | None) -> None:
    """
    轉發「正在輸入」給同一個對話的其他成員。

    刻意不寫進資料庫 —— 這種訊號一秒可能來好幾次，而且過期就沒有意義。
    每次都要確認發送者確實是成員，否則猜到 conversation id
    就能對別人的對話發假訊號。
    """
    if not conversation_id:
        return

    from sqlalchemy import select

    from app.models import ConversationMember, User

    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(ConversationMember.user_id).where(
                    ConversationMember.conversation_id == conversation_id
                )
            )
        ).all()
        member_ids = [r[0] for r in rows]

        if user_id not in member_ids:
            return

        sender = await db.get(User, user_id)
        name = sender.display_name if sender else ""

    others = [uid for uid in member_ids if uid != user_id]
    if others:
        await hub.broadcast(
            others,
            "typing",
            {"conversationId": conversation_id, "userId": user_id, "displayName": name},
        )


async def _mark_seen(user_id: str) -> None:
    async with SessionLocal() as db:
        user = await db.get(User, user_id)
        if user is not None:
            user.last_seen_at = datetime.now(timezone.utc)
            await db.commit()


async def _notify_presence(user_id: str, presence: str) -> None:
    """
    把上線狀態告訴好友。

    只推給好友，不是廣播給全站 —— 陌生人不需要知道你何時上線，
    而且關掉「顯示上線狀態」的人根本不推送。
    """
    from sqlalchemy import or_, select

    from app.models import Friendship, FriendRequestStatus

    async with SessionLocal() as db:
        user = await db.get(User, user_id)
        if user is None or not user.show_presence:
            return

        rows = (
            await db.execute(
                select(Friendship).where(
                    Friendship.status == FriendRequestStatus.accepted,
                    or_(
                        Friendship.requester_id == user_id,
                        Friendship.addressee_id == user_id,
                    ),
                )
            )
        ).scalars().all()

    friend_ids = [
        r.addressee_id if r.requester_id == user_id else r.requester_id for r in rows
    ]
    if friend_ids:
        await hub.broadcast(
            friend_ids, "presence", {"userId": user_id, "presence": presence}
        )
