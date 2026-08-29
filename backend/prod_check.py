"""
正式環境驗證。

跟 smoke_test 不同：這支不製造垃圾資料，也不寄出測試信 ——
正式環境的每一筆註冊都是真的帳號、每一封信都真的會寄出去。

驗證的是「線上這一套設定是否正確」，不是功能本身（那由 smoke_test 在本機把關）。
"""

import sys

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://inkstone-api-kbhs.onrender.com/api/v1"
ROOT = BASE.rsplit("/api/", 1)[0]

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


def main() -> int:
    print(f"目標：{BASE}\n")
    c = httpx.Client(base_url=BASE, timeout=120.0)

    print("— 服務 —")
    r = httpx.get(f"{ROOT}/health", timeout=120.0)
    check("健康檢查", r.status_code == 200 and r.json().get("env") == "prod", r.text[:120])

    print("\n— 端點是否上線 —")
    for ep in ["auth/register/start", "auth/password/forgot", "auth/register/complete"]:
        r = c.post(f"/{ep}", json={})
        check(f"{ep} 存在", r.status_code == 422, f"HTTP {r.status_code}")

    r = c.get("/auth/register/check", params={"token": "nope"})
    check("register/check 存在且拒絕假票證", r.status_code == 400, f"HTTP {r.status_code}")

    print("\n— 資料庫 —")
    # 讀得到動態牆就代表 migration 跑過、資料表都在
    r = c.get("/posts")
    ok = r.status_code == 200 and "items" in r.json()
    check("動態牆讀得到（資料表存在）", ok, r.text[:120])

    r = c.get("/search", params={"q": "測試"})
    check("搜尋可用", r.status_code == 200, f"HTTP {r.status_code}")

    print("\n— 安全行為 —")
    r = c.post("/auth/password/forgot", json={"email": "definitely-not-a-user@example.com"})
    ok = r.status_code == 200 and r.json().get("devLink") is None
    check("不存在的信箱不透露、且正式環境不外流連結", ok, r.text[:150])

    r = c.post("/auth/register/start", json={"username": "ab", "email": "x@y.com"})
    check("帳號太短被擋", r.status_code == 422, f"HTTP {r.status_code}")

    r = c.get("/users/me")
    check("未登入拿不到私密資料", r.status_code == 401, f"HTTP {r.status_code}")

    r = httpx.get(f"{ROOT}/openapi.json", timeout=60.0)
    check("正式環境關閉 API 文件", r.status_code == 404, f"HTTP {r.status_code}")

    print("\n— 錯誤格式 —")
    r = c.get("/posts/does-not-exist")
    ok = r.status_code == 404 and "error" in r.json()
    check("統一錯誤格式", ok, r.text[:120])

    print(f"\n{'=' * 46}")
    print(f"通過 {passed} 項，失敗 {len(failed)} 項")
    for f in failed:
        print(f"  - {f}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
