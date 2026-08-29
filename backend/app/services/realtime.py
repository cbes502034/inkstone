"""
即時推送。

一個使用者可能同時開好幾個分頁或裝置，所以每個 user 對應一組連線，
推送時全部都要送到 —— 否則在手機按了讚，桌機那邊不會更新。

目前是單一程序內的記憶體管理。Render 免費方案只有一個 instance，
這樣就夠了；之後要開多台時，改成用 Redis pub/sub 把訊息轉發到
其他 instance，對外的介面不用變。
"""

import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket

log = logging.getLogger("inkstone.realtime")


class ConnectionHub:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections[user_id].add(ws)
        log.info("已連線 user=%s（此人共 %d 條）", user_id, len(self._connections[user_id]))

    async def disconnect(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._connections[user_id].discard(ws)
            if not self._connections[user_id]:
                # 沒有連線就把整個 key 拿掉，否則長期執行下字典只增不減
                self._connections.pop(user_id, None)

    def is_online(self, user_id: str) -> bool:
        return bool(self._connections.get(user_id))

    def online_users(self) -> set[str]:
        return set(self._connections.keys())

    async def send_to(self, user_id: str, event: str, data: Any) -> None:
        """
        推送給某個人的所有連線。

        送失敗的連線直接移除 —— 對方可能關了分頁但 TCP 還沒斷，
        不清掉的話這些死連線會一直累積。
        """
        targets = list(self._connections.get(user_id, ()))
        if not targets:
            return

        payload = json.dumps(
            {
                "event": event,
                "data": data,
                "at": datetime.now(timezone.utc).isoformat(),
            },
            ensure_ascii=False,
            default=str,
        )

        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    self._connections[user_id].discard(ws)
                if not self._connections.get(user_id):
                    self._connections.pop(user_id, None)

    async def broadcast(self, user_ids: list[str], event: str, data: Any) -> None:
        """
        推送給多個人（群組聊天用）。

        用 gather 併發送出，不要一個一個等 —— 群組人多時
        序列送出會讓最後一個人明顯延遲。
        """
        await asyncio.gather(
            *(self.send_to(uid, event, data) for uid in set(user_ids)),
            return_exceptions=True,
        )


hub = ConnectionHub()
