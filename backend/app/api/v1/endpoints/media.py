import re

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.core.deps import DbSession
from app.models import MediaObject

router = APIRouter(prefix="/media", tags=["media"])

# 檔名就是內容的 SHA-256，副檔名只是給瀏覽器與下載時看的
_NAME = re.compile(r"^([0-9a-f]{64})\.webp$")

# 一年。內容定址的網址不可能指到別的東西，快取再久都不會過時；
# immutable 讓瀏覽器連「問問看有沒有更新」都省下來。
_CACHE = "public, max-age=31536000, immutable"


@router.get("/{name}")
async def get_media(name: str, request: Request, db: DbSession) -> Response:
    """
    圖片本體。

    刻意不要求登入 —— <img> 標籤沒辦法帶 Authorization 標頭，
    要驗證就得改用 blob 下載，那會失去瀏覽器快取，得不償失。
    頭像本來就是公開資料（任何人點進個人頁都看得到），
    而檔名是 SHA-256，猜不出來也列舉不了。
    """
    match = _NAME.match(name)
    if not match:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這張圖片")

    digest = match.group(1)

    # 瀏覽器手上已經是同一份就回 304，不必再傳一次內容
    if request.headers.get("if-none-match") == f'"{digest}"':
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={
            "ETag": f'"{digest}"',
            "Cache-Control": _CACHE,
        })

    obj = await db.get(MediaObject, digest)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這張圖片")

    return Response(
        content=obj.data,
        media_type=obj.content_type,
        headers={
            "ETag": f'"{digest}"',
            "Cache-Control": _CACHE,
            # 就算有人上傳了偽裝成圖片的 HTML，也不會被當網頁執行
            "X-Content-Type-Options": "nosniff",
        },
    )
