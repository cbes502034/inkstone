"""
暫存層。

AI 對話與速率限制都放這裡。有設定 REDIS_URL 就用 Redis，
沒有就退回程序內字典 —— 本機開發不必先去開 Upstash 帳號。

記憶體版本只在單一程序內有效，多台機器就會各記各的，
所以正式環境一定要設 REDIS_URL（Render 開兩個 instance 就會踩到）。
"""

import time
from typing import Any

from app.core.config import settings

try:
    from redis.asyncio import Redis
except ImportError:  # pragma: no cover
    Redis = None  # type: ignore[assignment]


class _MemoryStore:
    def __init__(self) -> None:
        self._data: dict[str, tuple[float, Any]] = {}

    def _sweep(self) -> None:
        now = time.time()
        for k, (exp, _) in list(self._data.items()):
            if exp < now:
                self._data.pop(k, None)

    async def get(self, key: str) -> Any | None:
        self._sweep()
        item = self._data.get(key)
        return item[1] if item else None

    async def set(self, key: str, value: Any, ttl: int) -> None:
        self._data[key] = (time.time() + ttl, value)

    async def delete(self, key: str) -> None:
        self._data.pop(key, None)

    async def incr(self, key: str, ttl: int) -> int:
        self._sweep()
        exp, current = self._data.get(key, (time.time() + ttl, 0))
        current = int(current) + 1
        self._data[key] = (exp, current)
        return current


class _RedisStore:
    def __init__(self, url: str) -> None:
        self._r = Redis.from_url(url, decode_responses=True)

    async def get(self, key: str) -> Any | None:
        return await self._r.get(key)

    async def set(self, key: str, value: Any, ttl: int) -> None:
        await self._r.set(key, value, ex=ttl)

    async def delete(self, key: str) -> None:
        await self._r.delete(key)

    async def incr(self, key: str, ttl: int) -> int:
        # 第一次遞增才設過期，否則每次都重設等於永不過期
        count = await self._r.incr(key)
        if count == 1:
            await self._r.expire(key, ttl)
        return int(count)


def _build():
    if settings.REDIS_URL and Redis is not None:
        return _RedisStore(settings.REDIS_URL)
    return _MemoryStore()


store = _build()


async def rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    """回傳 True 代表還在額度內。超過就擋下來。"""
    count = await store.incr(f"rl:{key}", window_seconds)
    return count <= limit
