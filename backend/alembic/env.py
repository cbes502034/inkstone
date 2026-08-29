import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.base import Base

# 匯入所有模型，autogenerate 才看得到全部資料表
import app.models  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _engine_kwargs() -> dict:
    kwargs: dict = {"poolclass": pool.NullPool}
    if settings.is_pgbouncer:
        # Transaction 模式的 PgBouncer 不支援 prepared statement，
        # 不關掉會出現「prepared statement does not exist」
        kwargs["connect_args"] = {
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
        }
    return kwargs


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,  # 欄位型別改變也要偵測到
        # SQLite 不支援 ALTER COLUMN，改欄位時用重建資料表的方式繞過
        render_as_batch=settings.is_sqlite,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """
    直接用設定裡的連線字串建立引擎。

    刻意不走 config.set_main_option("sqlalchemy.url", ...) ——
    那個函式底層是 ConfigParser，會把 `%` 當成插值語法。
    資料庫密碼含 `%`（或百分比編碼後產生的 `%XX`）時，
    整段字串會被吃掉，只剩下無法解析的碎片，
    錯誤訊息還會把一小段密碼吐進部署日誌。

    連線字串本來就不該進 alembic.ini，直接交給引擎最單純也最安全。
    """
    # migration 跑在應用程式之前，失敗時看不到 app 的啟動日誌，
    # 所以這裡也要印出形狀（不含內容）才查得動
    print(f"[alembic] 資料庫設定：{settings.describe_database_url()}", flush=True)

    connectable = create_async_engine(settings.database_url, **_engine_kwargs())
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
