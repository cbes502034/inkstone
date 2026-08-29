from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserPublic

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    """游標式分頁 —— 配合無限捲動。

    不用 offset：使用者在看的時候若有人發新文章，offset 會讓同一篇重複出現。
    """

    items: list[T]
    nextCursor: str | None = None


class PostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    author: UserPublic
    title: str
    body: str
    tags: list[str]
    coverUrl: str | None
    createdAt: datetime
    updatedAt: datetime
    edited: bool
    likeCount: int
    commentCount: int
    likedByMe: bool
    isMine: bool


class PostIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=50_000)


class LikeOut(BaseModel):
    likeCount: int
    likedByMe: bool


class LikersOut(BaseModel):
    items: list[UserPublic]
    total: int


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    postId: str
    author: UserPublic
    body: str
    createdAt: datetime
    isMine: bool


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class SearchOut(BaseModel):
    posts: list[PostOut]
    users: list[UserPublic]
