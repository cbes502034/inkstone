from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# SQLite 不支援連線池的部分參數，兩種資料庫分開設定
_engine_kwargs: dict = {"echo": False, "future": True}

if not settings.is_sqlite:
    _engine_kwargs.update(
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,  # 免費方案的資料庫會斷閒置連線，送出前先探活
        pool_recycle=1800,
    )

    if settings.is_pgbouncer:
        # Transaction 模式的 PgBouncer 每次交易可能落在不同的實體連線上，
        # asyncpg 的 prepared statement 快取會因此失效，出現
        # 「prepared statement _asyncpg_xx does not exist」。
        # 關掉快取即可，代價是每次都重新 parse，對這個規模影響不大。
        _engine_kwargs["connect_args"] = {
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
        }

engine = create_async_engine(settings.database_url, **_engine_kwargs)

SessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # commit 後還要讀物件欄位來組回應
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    每個請求一個交易。

    正常結束就 commit，丟出例外就 rollback —— 不讓寫到一半的資料留在資料庫。
    """
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
