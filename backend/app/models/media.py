from datetime import datetime

from sqlalchemy import Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UtcDateTime, utcnow


class MediaObject(Base):
    """
    使用者上傳的圖片。

    為什麼要獨立一張表，而不是把 data URL 直接存在 users.avatar_url：

    1. 頻寬。頭像塞在欄位裡，代表**每一次**回傳使用者資料時都會把整串
       base64 再送一遍。首頁二十篇文章就是二十張頭像，一次回應可以膨脹到
       一兆多 KB，而且瀏覽器沒辦法快取 —— 它看到的是 JSON，不是圖片。
       拆出來變成網址之後，圖片只下載一次，之後都走瀏覽器快取。

    2. 主鍵用內容的 SHA-256，也就是「內容定址」。同一張圖不論多少人上傳、
       上傳幾次，都只會存一份。而網址既然由內容決定，內容就永遠不會變 ——
       可以放心叫瀏覽器快取一年，不必擔心換了頭像卻還顯示舊的。

    3. 之後要搬到物件儲存（Supabase Storage、R2）時，只要換掉 data 這一欄
       的來源，網址格式與呼叫端都不用動。
    """

    __tablename__ = "media_objects"

    # SHA-256 的十六進位字串，64 個字
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<MediaObject {self.id[:12]}… {self.byte_size}B>"
