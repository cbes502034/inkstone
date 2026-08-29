import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

# 匯入才會註冊到 metadata，建表時不會漏掉
import app.models  # noqa: F401

log = logging.getLogger("inkstone")


@asynccontextmanager
async def lifespan(app: FastAPI):
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
    """給 Render 的健康檢查，也用來在免費方案上做保溫。"""
    return {"status": "ok", "env": settings.ENV}


app.include_router(api_router, prefix=settings.API_V1_PREFIX)
