from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession
from app.models import (
    Conversation,
    ConversationKind,
    ConversationMember,
    DirectConversationKey,
    Message,
    User,
)
from app.schemas.chat import (
    AddMembersIn,
    ConversationOut,
    CreateGroupIn,
    MessageIn,
    MessageOut,
    OpenDirectIn,
)
from app.services.friends import friend_ids, is_blocked
from app.services.serializers import user_public

router = APIRouter(prefix="/conversations", tags=["chat"])


async def _require_member(db, conversation_id: str, user_id: str) -> Conversation:
    """
    取出對話並確認呼叫者是成員。

    每支端點都經過這裡 —— 只要不是成員就看不到內容，
    不會有「猜到 conversation id 就能讀別人聊天」的漏洞。
    """
    conv = await db.get(
        Conversation, conversation_id, options=[selectinload(Conversation.members)]
    )
    if conv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這個對話")
    if not any(m.user_id == user_id for m in conv.members):
        # 回 404 而不是 403：403 等於告訴對方「這個對話存在」
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這個對話")
    return conv


def _msg_out(msg: Message, viewer_id: str) -> MessageOut:
    return MessageOut(
        id=msg.id,
        conversationId=msg.conversation_id,
        sender=user_public(msg.sender),
        body=msg.body,
        createdAt=msg.created_at,
        isMine=msg.sender_id == viewer_id,
    )


async def _conv_out(db, conv: Conversation, me: User) -> ConversationOut:
    member_ids = [m.user_id for m in conv.members]
    users = (await db.execute(select(User).where(User.id.in_(member_ids)))).scalars().all()
    by_id = {u.id: u for u in users}

    # 一對一顯示對方的名字與頭像，不是群組名稱
    others = [by_id[i] for i in member_ids if i != me.id and i in by_id]
    if conv.kind is ConversationKind.direct:
        peer = others[0] if others else me
        name = peer.display_name
        avatar = peer.avatar_url
    else:
        name = conv.name or "群組"
        avatar = conv.avatar_url

    last_stmt = (
        select(Message)
        .options(selectinload(Message.sender))
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    last = (await db.execute(last_stmt)).scalar_one_or_none()

    # 未讀用「讀到哪裡」推算，不存計數 —— 多裝置同時開著時計數很容易對不上
    mine = next((m for m in conv.members if m.user_id == me.id), None)
    unread = 0
    if mine is not None:
        cond = [Message.conversation_id == conv.id, Message.sender_id != me.id]
        if mine.last_read_at is not None:
            cond.append(Message.created_at > mine.last_read_at)
        unread = (await db.scalar(select(func.count(Message.id)).where(*cond))) or 0

    return ConversationOut(
        id=conv.id,
        kind=conv.kind.value,
        name=name,
        avatarUrl=avatar,
        members=[user_public(by_id[i]) for i in member_ids if i in by_id],
        ownerId=conv.owner_id,
        lastMessage=_msg_out(last, me.id) if last else None,
        unreadCount=unread,
        updatedAt=conv.last_message_at or conv.created_at,
    )


@router.get("", response_model=list[ConversationOut])
async def list_conversations(db: DbSession, me: CurrentUser) -> list[ConversationOut]:
    stmt = (
        select(Conversation)
        .options(selectinload(Conversation.members))
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(ConversationMember.user_id == me.id)
        .order_by(Conversation.last_message_at.desc().nullslast())
    )
    convs = (await db.execute(stmt)).scalars().unique().all()
    return [await _conv_out(db, c, me) for c in convs]


@router.post("/direct", response_model=ConversationOut)
async def open_direct(payload: OpenDirectIn, db: DbSession, me: CurrentUser) -> ConversationOut:
    """
    找出或建立一對一對話。

    兩人之間只能有一個 —— 用排序後的 id 組成唯一鍵交給資料庫約束，
    兩邊同時點「傳訊息」也不會各自建一個。
    """
    if payload.userId == me.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "不能跟自己聊天")

    peer = await db.get(User, payload.userId)
    if peer is None or not peer.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這個人")

    if await is_blocked(db, me.id, peer.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "目前無法傳訊息給這個人")

    key = DirectConversationKey.build_key(me.id, peer.id)
    found = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.members))
        .join(DirectConversationKey, DirectConversationKey.conversation_id == Conversation.id)
        .where(DirectConversationKey.pair_key == key)
    )
    conv = found.scalar_one_or_none()

    if conv is None:
        conv = Conversation(kind=ConversationKind.direct)
        db.add(conv)
        await db.flush()
        db.add_all(
            [
                ConversationMember(conversation_id=conv.id, user_id=me.id),
                ConversationMember(conversation_id=conv.id, user_id=peer.id),
                DirectConversationKey(conversation_id=conv.id, pair_key=key),
            ]
        )
        await db.flush()
        await db.refresh(conv, ["members"])

    return await _conv_out(db, conv, me)


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_group(payload: CreateGroupIn, db: DbSession, me: CurrentUser) -> ConversationOut:
    """建立群組。只能拉好友入群，否則群組會變成騷擾的管道。"""
    friends = set(await friend_ids(db, me.id))
    invalid = [uid for uid in payload.memberIds if uid not in friends]
    if invalid:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "只能邀請好友加入群組")

    conv = Conversation(kind=ConversationKind.group, name=payload.name.strip(), owner_id=me.id)
    db.add(conv)
    await db.flush()

    members = {me.id, *payload.memberIds}
    db.add_all([ConversationMember(conversation_id=conv.id, user_id=uid) for uid in members])
    await db.flush()
    await db.refresh(conv, ["members"])

    return await _conv_out(db, conv, me)


@router.post("/{conversation_id}/members", response_model=ConversationOut)
async def add_members(
    conversation_id: str, payload: AddMembersIn, db: DbSession, me: CurrentUser
) -> ConversationOut:
    conv = await _require_member(db, conversation_id, me.id)
    if conv.kind is not ConversationKind.group:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "一對一對話不能加人")
    if conv.owner_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "只有群主可以邀請成員")

    friends = set(await friend_ids(db, me.id))
    if any(uid not in friends for uid in payload.memberIds):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "只能邀請好友加入群組")

    existing = {m.user_id for m in conv.members}
    for uid in payload.memberIds:
        if uid not in existing:
            db.add(ConversationMember(conversation_id=conv.id, user_id=uid))

    await db.flush()
    await db.refresh(conv, ["members"])
    return await _conv_out(db, conv, me)


@router.get("/{conversation_id}", response_model=ConversationOut)
async def read_conversation(
    conversation_id: str, db: DbSession, me: CurrentUser
) -> ConversationOut:
    conv = await _require_member(db, conversation_id, me.id)

    # 進到對話就當作讀過了
    mine = next((m for m in conv.members if m.user_id == me.id), None)
    if mine is not None:
        mine.last_read_at = datetime.now(timezone.utc)
    await db.flush()

    return await _conv_out(db, conv, me)


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def list_messages(
    conversation_id: str,
    db: DbSession,
    me: CurrentUser,
    limit: int = Query(default=50, le=200),
) -> list[MessageOut]:
    await _require_member(db, conversation_id, me.id)

    stmt = (
        select(Message)
        .options(selectinload(Message.sender))
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    rows.reverse()  # 畫面由舊到新
    return [_msg_out(m, me.id) for m in rows]


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    conversation_id: str, payload: MessageIn, db: DbSession, me: CurrentUser
) -> MessageOut:
    conv = await _require_member(db, conversation_id, me.id)

    now = datetime.now(timezone.utc)
    msg = Message(
        conversation_id=conversation_id,
        sender_id=me.id,
        body=payload.body.strip(),
        created_at=now,
    )
    db.add(msg)
    conv.last_message_at = now  # 對話列表靠這個排序，不用 join 最後一則訊息
    await db.flush()

    msg.sender = me
    return _msg_out(msg, me.id)


@router.delete("/{conversation_id}/members/me", status_code=status.HTTP_204_NO_CONTENT)
async def leave_group(conversation_id: str, db: DbSession, me: CurrentUser) -> None:
    conv = await _require_member(db, conversation_id, me.id)
    if conv.kind is not ConversationKind.group:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "一對一對話不能退出")

    mine = next((m for m in conv.members if m.user_id == me.id), None)
    if mine is not None:
        await db.delete(mine)

    # 群主退出就把群主轉給下一個人，不留無主群組
    if conv.owner_id == me.id:
        rest = [m for m in conv.members if m.user_id != me.id]
        conv.owner_id = rest[0].user_id if rest else None
