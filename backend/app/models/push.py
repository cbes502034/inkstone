from datetime import datetime

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDMixin, UtcDateTime, utcnow


class PushSubscription(Base, UUIDMixin):
    """
    瀏覽器的推播訂閱。

    一個人可能有很多筆 —— 每台裝置、每個瀏覽器各自一份，
    所以不能用 user_id 當主鍵。真正唯一的是 endpoint（推播服務給的網址）。

    這些值都由瀏覽器產生：
      * endpoint 是 Google／Mozilla／Apple 的推播服務網址
      * p256dh 與 auth 是加密金鑰。Web Push 規格要求內容端對端加密，
        推播服務本身看不到通知內容，只負責轉送
    """

    __tablename__ = "push_subscriptions"

    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # 推播服務的網址可以很長，用 Text 不設上限
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<PushSubscription {self.user_id} {self.endpoint[:40]}…>"


class AppSecret(Base):
    """
    程式自己產生、需要跨重啟保存的秘密值。

    目前只放推播用的 VAPID 金鑰對。那組金鑰必須固定 ——
    換掉的話所有既有訂閱立刻失效，使用者得重新授權一次。

    為什麼不是只用環境變數：那會多一個「你要先產生金鑰再貼進後台」的
    手動步驟，而每一個手動步驟都是一次可能漏掉或貼錯的機會。
    設了環境變數就以環境變數為準，沒設就自己產生一組存在這裡。
    """

    __tablename__ = "app_secrets"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow, nullable=False)
