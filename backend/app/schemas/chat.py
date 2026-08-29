from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.user import UserPublic


class MessageOut(BaseModel):
    id: str
    conversationId: str
    sender: UserPublic
    body: str
    createdAt: datetime
    isMine: bool


class ConversationOut(BaseModel):
    id: str
    kind: Literal["direct", "group"]
    name: str
    avatarUrl: str | None
    members: list[UserPublic]
    ownerId: str | None
    lastMessage: MessageOut | None
    unreadCount: int
    updatedAt: datetime


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class CreateGroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    memberIds: list[str] = Field(min_length=1, max_length=100)


class AddMembersIn(BaseModel):
    memberIds: list[str] = Field(min_length=1, max_length=100)


class OpenDirectIn(BaseModel):
    userId: str


class NotificationOut(BaseModel):
    id: str
    kind: str
    actor: UserPublic
    href: str
    preview: str
    read: bool
    createdAt: datetime
