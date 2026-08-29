import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Presence = Literal["online", "away", "offline"]
FriendState = Literal["none", "outgoing", "incoming", "friends", "self", "blocked"]

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,32}$")


class UserPublic(BaseModel):
    """任何人都看得到的欄位。信箱等私密資料絕不出現在這裡。"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    displayName: str
    avatarUrl: str | None
    bio: str
    createdAt: datetime
    presence: Presence
    lastSeenAt: datetime | None


class UserPrivate(UserPublic):
    """只有本人拿得到，由 GET /users/me 回傳。"""

    email: EmailStr
    emailVerified: bool
    showPresence: bool


class UserWithRelation(UserPublic):
    friendState: FriendState
    friendCount: int
    postCount: int


class RegisterIn(BaseModel):
    username: str
    displayName: str = Field(min_length=1, max_length=60)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    avatarDataUrl: str | None = None

    @field_validator("username")
    @classmethod
    def _check_username(cls, v: str) -> str:
        if not USERNAME_RE.match(v):
            raise ValueError("帳號只能用 3~32 個英數字或底線")
        return v.lower()


class LoginIn(BaseModel):
    account: str  # 帳號或 email 皆可
    password: str


class UpdateMeIn(BaseModel):
    displayName: str | None = Field(default=None, min_length=1, max_length=60)
    bio: str | None = Field(default=None, max_length=160)
    avatarUrl: str | None = None
    showPresence: bool | None = None


class TokenPair(BaseModel):
    accessToken: str
    refreshToken: str


class AuthSession(TokenPair):
    user: UserPrivate


class RefreshIn(BaseModel):
    refreshToken: str
