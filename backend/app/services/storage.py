"""
圖片位元組要放哪裡。

供應商無關 —— 呼叫端只拿到一個網址，不需要知道位元組落在資料庫
還是物件儲存。跟信件服務同一套做法：沒設定就用內建的方式，
設定了就自動改走外部服務，程式碼與資料都不必動。

為什麼要把圖片挪出資料庫：
  * Supabase 免費方案的資料庫只有 500 MB，而 Storage 另外給 1 GB。
    平均一張頭像 45 KB，五千位使用者就吃掉資料庫一半的容量 ——
    而那裡同時還要放文章、訊息、通知。
  * 資料庫備份會把圖片一起複製。位元組挪走之後備份小得多、也快得多。
  * 物件儲存前面有 CDN，圖片不必經過我們那台會休眠的免費服務。

既有的圖片留在資料庫，網址照樣有效 —— /media 端點仍然服務它們。
只有新上傳的會進物件儲存。不做整批搬遷是刻意的：
搬遷會動到既有使用者的頭像，而收益只是省下已經佔用的那點空間。
"""

import logging

import httpx
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import MediaObject

log = logging.getLogger("inkstone.storage")

# 最後一次寫入物件儲存失敗的代碼。健康檢查會帶出來 ——
# 設定了物件儲存卻悄悄落回資料庫，是最容易被忽略的那種故障：
# 功能完全正常，只有容量默默繼續長在不該長的地方。
_last_failure: str | None = None


def last_failure_code() -> str | None:
    return _last_failure


def _record(reason: str | None) -> None:
    global _last_failure
    _last_failure = reason

# 自家端點的前綴。內容雜湊當檔名，所以網址永遠對應同一張圖
LOCAL_PREFIX = "/api/v1/media/"


async def put(db: AsyncSession, digest: str, content_type: str, blob: bytes) -> str:
    """
    存一份圖片，回傳可以放進 avatar_url 的網址。

    digest 是內容的 SHA-256，同一張圖不論誰上傳幾次都只會存一份。
    """
    if settings.storage_provider == "supabase":
        url = await _put_supabase(digest, content_type, blob)
        if url:
            _record(None)
            return url
        # 上傳失敗就落回資料庫。使用者換頭像不該因為外部服務出問題而失敗，
        # 而且內容定址代表之後真的要搬遷時，對照關係是明確的
        log.warning("物件儲存寫入失敗，改存資料庫 digest=%s", digest[:12])

    return await _put_database(db, digest, content_type, blob)


async def _put_database(
    db: AsyncSession, digest: str, content_type: str, blob: bytes
) -> str:
    if await db.get(MediaObject, digest) is None:
        try:
            # 包在 savepoint 裡：兩個人同一瞬間上傳同一張圖時，後到的會撞主鍵。
            # 有 savepoint 才能只回滾這一小段，不會把外層交易一起弄髒
            # （那會連帶讓註冊或改資料整個失敗）。
            async with db.begin_nested():
                db.add(
                    MediaObject(
                        id=digest,
                        content_type=content_type,
                        byte_size=len(blob),
                        data=blob,
                    )
                )
        except IntegrityError:
            pass  # 對方已經寫進去了，內容一模一樣，直接沿用

    return f"{LOCAL_PREFIX}{digest}.webp"


async def _put_supabase(digest: str, content_type: str, blob: bytes) -> str | None:
    """
    上傳到 Supabase Storage，回傳公開網址；失敗回 None 讓呼叫端決定怎麼辦。
    """
    base = settings.SUPABASE_URL
    bucket = settings.SUPABASE_BUCKET
    key = settings.SUPABASE_SERVICE_KEY
    name = f"{digest}.webp"
    headers = {"Authorization": f"Bearer {key}", "apikey": key}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            await _ensure_bucket(client, base, bucket, headers)

            resp = await client.post(
                f"{base}/storage/v1/object/{bucket}/{name}",
                headers={**headers, "Content-Type": content_type},
                content=blob,
            )
            # 409 = 這個檔名已經存在。內容定址的前提下那就是同一張圖，
            # 不是錯誤，直接沿用既有的那份
            if resp.status_code == 409:
                return _public_url(base, bucket, name)
            if resp.status_code >= 400:
                log.error("Supabase Storage 回應 %s：%s", resp.status_code, resp.text[:300])
                _record(str(resp.status_code))
                return None
    except Exception as e:
        log.warning("Supabase Storage 上傳發生例外", exc_info=True)
        _record(type(e).__name__)
        return None

    return _public_url(base, bucket, name)


async def _ensure_bucket(client: httpx.AsyncClient, base: str, bucket: str, headers: dict) -> None:
    """
    確保 bucket 存在且是公開的。

    自動建立而不是要人先去後台開好 —— 少一個手動步驟就少一個
    「設定看起來對但其實漏了一步」的機會。已經存在時回 409，當成成功。
    """
    try:
        resp = await client.post(
            f"{base}/storage/v1/bucket",
            headers={**headers, "Content-Type": "application/json"},
            json={"id": bucket, "name": bucket, "public": True},
        )
        if resp.status_code >= 400 and resp.status_code != 409:
            log.info("建立 bucket 回應 %s：%s", resp.status_code, resp.text[:200])
    except Exception:
        log.warning("建立 bucket 失敗，仍嘗試直接上傳", exc_info=True)


def _public_url(base: str, bucket: str, name: str) -> str:
    return f"{base}/storage/v1/object/public/{bucket}/{name}"
