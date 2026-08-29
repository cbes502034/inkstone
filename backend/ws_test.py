"""
即時推送測試。

確認「A 做了動作 → B 的 WebSocket 立刻收到」這件事真的成立，
而不是只有寫進資料庫。
"""

import asyncio
import json
import sys
import uuid

import httpx
import websockets

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000/api/v1"
WS = BASE.replace("http://", "ws://").replace("https://", "wss://") + "/ws"

passed = 0
failed: list[str] = []


def check(label: str, ok: bool, extra: str = "") -> None:
    global passed
    if ok:
        passed += 1
        print(f"  [ok]   {label}")
    else:
        failed.append(label)
        print(f"  [FAIL] {label} {extra}")


async def register(c: httpx.AsyncClient, name: str) -> dict:
    r = await c.post(
        "/auth/register/start",
        json={"username": name, "email": f"{name}@example.com"},
    )
    token = r.json()["devLink"].split("token=")[1]
    r = await c.post(
        "/auth/register/complete",
        json={
            "token": token,
            "password": "sup3rsecret!",
            "confirmPassword": "sup3rsecret!",
        },
    )
    return r.json()


async def collect(ws, want: str, timeout: float = 6.0) -> dict | None:
    """等待指定事件。ping 是心跳，直接略過。"""
    try:
        async with asyncio.timeout(timeout):
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("event") == "ping":
                    continue
                if msg.get("event") == want:
                    return msg
    except (TimeoutError, asyncio.TimeoutError):
        return None


async def main() -> int:
    tag = uuid.uuid4().hex[:8]
    async with httpx.AsyncClient(base_url=BASE, timeout=60.0) as c:
        alice = await register(c, f"wsa_{tag}")
        bob = await register(c, f"wsb_{tag}")
        a_tok = {"Authorization": f"Bearer {alice['accessToken']}"}
        b_tok = {"Authorization": f"Bearer {bob['accessToken']}"}

        print("\n— 連線 —")
        async with websockets.connect(f"{WS}?token={bob['accessToken']}") as bws:
            check("Bob 連上 WebSocket", True)

            print("\n— 即時通知：按讚 —")
            r = await c.post(
                "/posts",
                headers=b_tok,
                json={"title": "測試推送", "body": "內容 #推送"},
            )
            post_id = r.json()["id"]

            await c.put(f"/posts/{post_id}/like", headers=a_tok)
            msg = await collect(bws, "notification")
            check(
                "按讚立刻推到作者",
                msg is not None and msg["data"]["kind"] == "post_liked",
                str(msg)[:150],
            )

            print("\n— 即時通知：留言 —")
            await c.post(
                f"/posts/{post_id}/comments", headers=a_tok, json={"body": "推一個"}
            )
            msg = await collect(bws, "notification")
            check(
                "留言立刻推到作者",
                msg is not None and msg["data"]["kind"] == "post_commented",
                str(msg)[:150],
            )

            print("\n— 即時通知：好友邀請 —")
            await c.post(
                "/friends/requests",
                headers=a_tok,
                params={"toUserId": bob["user"]["id"]},
            )
            msg = await collect(bws, "notification")
            check(
                "好友邀請立刻推到對方",
                msg is not None and msg["data"]["kind"] == "friend_request",
                str(msg)[:150],
            )

            print("\n— 即時聊天 —")
            await c.post(
                f"/friends/requests/{alice['user']['id']}/accept", headers=b_tok
            )
            r = await c.post(
                "/conversations/direct",
                headers=a_tok,
                json={"userId": bob["user"]["id"]},
            )
            conv_id = r.json()["id"]

            await c.post(
                f"/conversations/{conv_id}/messages", headers=a_tok, json={"body": "嗨"}
            )
            msg = await collect(bws, "message")
            check(
                "訊息立刻推到對方",
                msg is not None and msg["data"]["body"] == "嗨",
                str(msg)[:150],
            )
            check(
                "推出去的 isMine 是對收件者而言",
                msg is not None and msg["data"]["isMine"] is False,
                str(msg)[:150],
            )

        print("\n— 驗證 —")
        try:
            async with websockets.connect(f"{WS}?token=not-a-real-token"):
                check("偽造 token 被拒絕", False, "竟然連上了")
        except Exception:
            check("偽造 token 被拒絕", True)

    print(f"\n{'=' * 46}")
    print(f"通過 {passed} 項，失敗 {len(failed)} 項")
    for f in failed:
        print(f"  - {f}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
