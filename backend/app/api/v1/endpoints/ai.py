import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.deps import CurrentUser
from app.services import ai as ai_service
from app.services.cache import rate_limit, store

router = APIRouter(prefix="/ai", tags=["ai"])


class ComposeIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=1000)
    # 同一次寫作的多輪對話用同一個 id，關掉面板就換一個新的
    sessionId: str | None = None


class DraftOut(BaseModel):
    title: str
    body: str


class ComposeOut(BaseModel):
    id: str
    role: str = "assistant"
    kind: str  # draft / refusal
    body: str
    draft: DraftOut | None = None
    createdAt: datetime
    sessionId: str


def _session_key(user_id: str, session_id: str) -> str:
    return f"ai:{user_id}:{session_id}"


@router.post("/compose", response_model=ComposeOut)
async def compose(payload: ComposeIn, me: CurrentUser) -> ComposeOut:
    """
    產出文章草稿。

    對話暫存在 Redis 並設 TTL，不落地資料庫 —— 使用者採用草稿或關掉面板，
    紀錄就消失。這既符合產品上「聊完就忘」的設計，也少留一份使用者內容。
    """
    allowed = await rate_limit(f"ai:{me.id}", settings.RATE_LIMIT_AI_PER_HOUR, 3600)
    if not allowed:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "今天用得有點兇，休息一下再試。",
        )

    session_id = payload.sessionId or uuid.uuid4().hex
    key = _session_key(me.id, session_id)

    raw = await store.get(key)
    history = json.loads(raw) if raw else []

    result = await ai_service.generate(payload.prompt)

    history.append({"role": "user", "content": payload.prompt})
    history.append({"role": "assistant", "content": result.body})
    await store.set(key, json.dumps(history[-20:]), settings.AI_SESSION_TTL_SECONDS)

    return ComposeOut(
        id=uuid.uuid4().hex,
        kind=result.kind,
        body=result.body,
        draft=(
            DraftOut(title=result.title or "", body=result.draft_body or "")
            if result.kind == "draft"
            else None
        ),
        createdAt=datetime.now(timezone.utc),
        sessionId=session_id,
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def end_session(session_id: str, me: CurrentUser) -> None:
    """使用者按下「就是這個」或關掉面板時呼叫，暫存立刻清掉。"""
    await store.delete(_session_key(me.id, session_id))
