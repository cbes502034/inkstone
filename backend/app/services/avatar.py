import base64
import binascii
import io
import re

from fastapi import HTTPException, status
from PIL import Image, UnidentifiedImageError

from app.core.config import settings

_DATA_URL = re.compile(r"^data:image/(png|jpeg|jpg|webp|gif);base64,(.+)$", re.DOTALL)


def store_avatar(data_url: str) -> str:
    """
    處理前端送來的頭像。

    前端已經壓過一次，但後端一定要自己再驗一次 —— 前端的檢查只是為了體驗，
    擋不住直接打 API 的人。這裡做三件事：
      1. 確認真的是圖片（用實際解碼，不是看副檔名或 MIME 字串）
      2. 限制大小，避免有人塞一張 200MB 的圖進來
      3. 重新編碼成 WebP，順便剝掉 EXIF —— 手機拍的照片會夾帶 GPS 座標，
         直接存下來等於把使用者的所在位置公開出去

    目前回傳 data URL 直接存欄位。接上物件儲存（Supabase Storage）之後，
    這裡改成上傳並回傳網址，呼叫端不需要改。
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

    encoded = base64.b64encode(out.getvalue()).decode()
    return f"data:image/webp;base64,{encoded}"
