"""
v1 的路由總表。

每個資源一個 APIRouter，各自帶好 prefix 與 tags，在這裡集中掛載。
好處是：加一個資源只要新增一個檔案再掛上來，main.py 永遠不用動；
從這個檔案也能一眼看完整個 API 的樣貌。
"""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    ai,
    auth,
    comments,
    conversations,
    friends,
    media,
    notifications,
    posts,
    push,
    reports,
    search,
    users,
    ws,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(posts.router)
api_router.include_router(comments.router)  # 路徑掛在 /posts/{id}/comments 底下
api_router.include_router(friends.router)
api_router.include_router(conversations.router)
api_router.include_router(notifications.router)
api_router.include_router(push.router)  # Web Push：瀏覽器關掉也收得到
api_router.include_router(reports.router)
api_router.include_router(media.router)  # 圖片本體，公開且長期快取
api_router.include_router(search.router)
api_router.include_router(ai.router)
api_router.include_router(ws.router)  # WebSocket：通知、訊息、上線狀態
