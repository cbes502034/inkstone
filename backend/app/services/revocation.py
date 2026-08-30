"""
Token 撤銷名單。

JWT 是無狀態的 —— 簽出去之後伺服器不再參與，只要沒過期就一直有效。
好處是驗證不用查資料庫，代價是「登出」在伺服器端沒有意義：
使用者按了登出，前端把 token 丟掉，但那張 token 本身還是有效的。
被側錄或存在別台裝置上的 token，可以繼續用到過期為止。

所以登出時把 token 記進撤銷名單，驗證時多查一次。

實作上的兩個決定：

1. **存 jti 而不是整串 token。** token 本身很長，而且是憑證 ——
   即使是快取也沒必要留一份完整的可用憑證。

2. **名單項目的存活時間等於 token 的剩餘壽命。** 過期之後 token
   本來就無效，再留在名單裡只是佔空間。設 TTL 讓它自己消失，
   不需要清理排程。

沒有 Redis 時退回程序內字典 —— 單機開發夠用，但多台機器時
A 機器的登出不會影響 B 機器，正式環境務必設定 REDIS_URL。
"""

import logging
from datetime import datetime, timezone

from app.services.cache import store

log = logging.getLogger("inkstone.revocation")


def _key(jti: str) -> str:
    return f"revoked:{jti}"


async def revoke(jti: str, expires_at: datetime) -> None:
    """把 token 加入撤銷名單，存活到它本來就會過期的時間點。"""
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    ttl = int((expires_at - now).total_seconds())
    if ttl <= 0:
        return  # 已經過期了，不必記

    try:
        await store.set(_key(jti), "1", ttl)
    except Exception:
        # 撤銷失敗不該讓登出報錯 —— 前端仍會丟掉 token，
        # 使用者的感受是登出成功。但要記下來，這是安全相關的降級。
        log.warning("token 撤銷寫入失敗 jti=%s", jti, exc_info=True)


async def is_revoked(jti: str) -> bool:
    try:
        return await store.get(_key(jti)) is not None
    except Exception:
        # 查不到撤銷名單時採「放行」而非「拒絕」——
        # 快取掛掉不該讓全站使用者被登出。
        # 這是刻意的取捨：可用性優先於這一層額外的防護。
        log.warning("撤銷名單查詢失敗 jti=%s，本次放行", jti, exc_info=True)
        return False
