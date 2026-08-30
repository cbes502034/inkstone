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


class RegisterStartIn(BaseModel):
    """第一步：只要帳號與信箱。這時候還不建立使用者。"""

    username: str
    email: EmailStr

    @field_validator("username")
    @classmethod
    def _check_username(cls, v: str) -> str:
        if not USERNAME_RE.match(v):
            raise ValueError("帳號只能用 3~32 個英數字或底線")
        return v.lower()


class RegisterStartOut(BaseModel):
    # 一律回同樣的訊息，不透露這個帳號或信箱是不是已經被用了 ——
    # 否則這支 API 就成了帳號與信箱的探測工具
    message: str = "驗證信已寄出，請到信箱點擊連結完成註冊"
    # 只在開發環境帶回連結，讓本機不必接 SMTP 也能走完流程
    devLink: str | None = None


class RegisterCheckOut(BaseModel):
    """點開連結時先問後端這張票有沒有效，才決定要不要顯示設定密碼的畫面。"""

    username: str
    email: EmailStr


class RegisterCompleteIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)
    confirmPassword: str
    avatarDataUrl: str | None = None

    @field_validator("confirmPassword")
    @classmethod
    def _passwords_match(cls, v: str, info) -> str:
        # 後端也要驗一次。前端的即時比對只是體驗，擋不住直接打 API
        if v != (info.data or {}).get("password"):
            raise ValueError("兩次輸入的密碼不一致")
        return v


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


class LogoutIn(BaseModel):
    """兩張都要送 —— 只廢 access 的話，拿著 refresh 的人立刻能換一張新的。"""

    accessToken: str | None = None
    refreshToken: str | None = None


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)
    confirmPassword: str

    @field_validator("confirmPassword")
    @classmethod
    def _passwords_match(cls, v: str, info) -> str:
        if v != (info.data or {}).get("password"):
            raise ValueError("兩次輸入的密碼不一致")
        return v
