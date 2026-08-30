import asyncio
import base64
import binascii
import hashlib
import io
import re

from fastapi import HTTPException, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import MediaObject

_DATA_URL = re.compile(r"^data:image/(png|jpeg|jpg|webp|gif);base64,(.+)$", re.DOTALL)

# 圖片一律轉成 WebP：同樣畫質下比 JPEG 小三成左右，而且支援度已經夠廣
_CONTENT_TYPE = "image/webp"

# 網址前綴。內容雜湊當檔名，所以同一個網址永遠對應同一張圖
MEDIA_PREFIX = "/api/v1/media/"


def _normalize(data_url: str) -> bytes:
    """
    把前端送來的 data URL 轉成乾淨的 WebP 位元組。

    前端已經壓過一次，但後端一定要自己再驗一次 —— 前端的檢查只是為了體驗，
    擋不住直接打 API 的人。這裡做三件事：
      1. 確認真的是圖片（用實際解碼，不是看副檔名或 MIME 字串）
      2. 限制大小，避免有人塞一張 200MB 的圖進來
      3. 重新編碼，順便剝掉 EXIF —— 手機拍的照片會夾帶 GPS 座標，
         直接存下來等於把使用者的所在位置公開出去

    純 CPU 工作，由呼叫端丟到執行緒跑。解一張圖大概幾十毫秒，
    直接在事件迴圈裡做的話，這段時間全站所有請求都會被卡住。
    """
    match = _DATA_URL.match(data_url.strip())
    if not match:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "頭像格式不正確")

    try:
        raw = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "頭像資料無法解碼") from e

    if len(raw) > settings.MAX_AVATAR_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "圖片太大了")

    try:
        with Image.open(io.BytesIO(raw)) as img:
            img.load()  # 真的解碼，偽裝成圖片的檔案會在這裡失敗
            rgb = img.convert("RGB")

            # 置中裁成正方形，頭像才不會忽高忽低
            side = min(rgb.size)
            left = (rgb.width - side) // 2
            top = (rgb.height - side) // 2
            square = rgb.crop((left, top, left + side, top + side))

            target = min(side, settings.AVATAR_SIZE_PX)
            square = square.resize((target, target), Image.LANCZOS)

            out = io.BytesIO()
            # 不帶入原圖的 metadata，EXIF 位置資訊就此斷開
            square.save(out, format="WEBP", quality=86, method=4)
    except (UnidentifiedImageError, OSError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "這個檔案不是有效的圖片") from e

    return out.getvalue()


async def store_avatar(db: AsyncSession, data_url: str) -> str:
    """處理頭像並存進 media 表，回傳可以放進 avatar_url 的網址。"""
    # 客戶端把原本的網址原封不動送回來時（例如整包 PATCH 回來），
    # 那不是新圖，直接沿用，不要當成格式錯誤擋下來
    if data_url.startswith(MEDIA_PREFIX):
        return data_url

    blob = await asyncio.to_thread(_normalize, data_url)
    digest = hashlib.sha256(blob).hexdigest()

    # 同一張圖已經有人上傳過就直接共用，不重複佔空間
    if await db.get(MediaObject, digest) is None:
        try:
            # 包在 savepoint 裡：兩個人同一瞬間上傳同一張圖時，
            # 後到的那個會撞主鍵。有 savepoint 才能只回滾這一小段，
            # 不會把外層交易一起弄髒（那會連帶讓註冊或改資料整個失敗）。
            async with db.begin_nested():
                db.add(
                    MediaObject(
                        id=digest,
                        content_type=_CONTENT_TYPE,
                        byte_size=len(blob),
                        data=blob,
                    )
                )
        except IntegrityError:
            # 對方已經寫進去了，內容一模一樣，直接沿用
            pass

    return f"{MEDIA_PREFIX}{digest}.webp"
