import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import settings
from app.services import ai as ai_service
from app.services import storage as storage_service
from app.db.base import Base
from app.db.session import engine

# 匯入才會註冊到 metadata，建表時不會漏掉
import app.models  # noqa: F401

# uvicorn 只設定自己的 logger，不動 root ——
# 不做這一步，應用程式的 log.info / log.warning 全部不會出現在部署日誌裡，
# 出問題時等於瞎子摸象。
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s [%(name)s] %(message)s",
    force=True,  # 蓋掉 uvicorn 已經裝好的 handler，否則設定不會生效
)

log = logging.getLogger("inkstone")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 只記形狀不記內容。連線出問題時這一行就能定位，
    # 不必等 SQLAlchemy 把密碼碎片吐進日誌
    log.info("資料庫設定：%s", settings.describe_database_url())
    log.info("寄信通道：%s", settings.email_provider)
    if settings.ENV == "prod" and settings.email_provider == "smtp":
        # 這種組合在 Render 上一定寄不出去，先警告免得使用者收不到信才發現
        log.warning(
            "正式環境使用 SMTP —— Render、Heroku 這類平台封鎖對外的 SMTP 連接埠，"
            "信很可能寄不出去。建議改用 Brevo 或 Resend 的 HTTPS API。"
        )
    if settings.ENV == "prod" and settings.email_provider == "none":
        log.warning("沒有設定寄信通道，正式環境將無法註冊新帳號")

    # 本機用 SQLite 時直接建表，clone 下來就能跑。
    # 正式環境走 Alembic migration，不在啟動時改結構 ——
    # 自動建表遇到既有資料表不會做任何變更，等於悄悄跑在錯的 schema 上。
    if settings.is_sqlite:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        log.info("SQLite 資料表已就緒")

    yield
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    lifespan=lifespan,
    # 正式環境關掉互動文件，不對外暴露完整 API 結構
    docs_url="/docs" if settings.ENV == "dev" else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.ENV == "dev" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,  # 不用 "*"，帶 cookie 時瀏覽器會直接拒絕
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- 統一錯誤格式 ---
# 前端只需要處理一種形狀：{ "error": { "code", "message", "details" } }


def _error(code: str, message: str, details: list | None = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or []}}


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_error(f"HTTP_{exc.status_code}", str(exc.detail)),
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    """
    只取出能安全序列化的欄位。

    自訂驗證器丟 ValueError 時，exc.errors() 的 ctx 會夾帶「原始的例外物件」，
    直接塞進 JSONResponse 會讓這個處理器本身爆掉，變成 500 ——
    使用者看到的就不是「密碼不一致」而是「伺服器發生問題」。

    input 也一併排除：那是使用者送來的原始值，密碼欄位會原封不動被回傳出去。
    """
    details = [
        {
            "field": ".".join(str(p) for p in err.get("loc", ()) if p != "body"),
            "message": err.get("msg", ""),
            "type": err.get("type", ""),
        }
        for err in exc.errors()
    ]
    # 只有一個錯誤時直接把它當主訊息，前端不用再翻 details 才知道哪裡錯
    message = details[0]["message"] if len(details) == 1 else "送出的資料格式不正確"
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_error("VALIDATION_ERROR", message, details),
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    # 例外細節只寫進日誌。回給使用者的訊息不含堆疊或 SQL —— 那是資訊洩漏。
    log.exception("未處理的例外：%s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_error("INTERNAL_ERROR", "伺服器發生問題，請稍後再試"),
    )


@app.get("/health", tags=["meta"])
async def health() -> dict:
    """
    給 Render 的健康檢查，也用來在免費方案上做保溫。

    順便回報幾項設定的「開關狀態」—— 只有是/否與通道名稱，
    沒有任何金鑰或連線字串。部署後想確認設定有沒有生效，
    打這一支就好，不必翻日誌（雲端平台的日誌常常抓不到啟動訊息）。
    """
    return {
        "status": "ok",
        "env": settings.ENV,
        "email": settings.email_provider,
        "database": "postgres" if not settings.is_sqlite else "sqlite",
        "redis": bool(settings.REDIS_URL),
        # 圖片位元組放資料庫還是物件儲存。兩者對外行為一致，
        # 但放資料庫會吃掉 500 MB 的容量額度，部署後值得確認一下
        "storage": settings.storage_provider,
        # 設定了物件儲存卻寫入失敗時的代碼。有值代表圖片其實還在往
        # 資料庫裡堆 —— 功能看起來正常，容量卻默默長在不該長的地方
        "storageLastError": storage_service.last_failure_code(),
        "ai": "huggingface" if settings.HF_TOKEN else "local",
        # 模型呼叫最近一次失敗的「代碼」—— 狀態碼或例外類別名，不含訊息內文。
        # 只有代碼是刻意的：401/402/404/逾時各自對應完全不同的原因，
        # 光這一個字就足以判斷方向，而把供應商的錯誤全文公開出來
        # 等於把營運細節掛在網路上。要看完整訊息請打 /ai/diagnostics（需登入）。
        "aiLastError": ai_service.last_failure_code(),
    }


app.include_router(api_router, prefix=settings.API_V1_PREFIX)
