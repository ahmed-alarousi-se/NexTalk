"""
NexTalk Messaging Platform — Application Entry Point
-----------------------------------------------------
Run locally (with venv activated):
    source .venv/bin/activate
    uvicorn src.main:app --reload --port 8000

Production (via Docker):
    CMD defined in Dockerfile
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from src.api import api_router
from src.core.config import settings
from src.db.base import Base  # noqa: F401 — registers all models with metadata
from src.db.session import engine

logger = logging.getLogger(__name__)

DB_STARTUP_ATTEMPTS = 30
DB_STARTUP_DELAY_SECONDS = 2


async def _wait_for_database() -> None:
    """Retry DB connection while Postgres is starting (Docker / cloud cold boot)."""
    last_error: Exception | None = None
    for attempt in range(1, DB_STARTUP_ATTEMPTS + 1):
        try:
            async with engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
            if attempt > 1:
                logger.info("Database connection established on attempt %s", attempt)
            return
        except Exception as exc:
            last_error = exc
            if attempt == DB_STARTUP_ATTEMPTS:
                break
            logger.warning(
                "Database not ready (attempt %s/%s): %s",
                attempt,
                DB_STARTUP_ATTEMPTS,
                exc,
            )
            await asyncio.sleep(DB_STARTUP_DELAY_SECONDS)
    assert last_error is not None
    raise last_error


async def _apply_schema_patches(conn) -> None:
    """Lightweight dev patches until Alembic migrations are wired up."""
    await conn.execute(
        text(
            "ALTER TABLE conversation_members "
            "ADD COLUMN IF NOT EXISTS messages_hidden_before TIMESTAMP WITH TIME ZONE"
        )
    )
    await conn.execute(
        text(
            "UPDATE conversation_members "
            "SET messages_hidden_before = deleted_at "
            "WHERE deleted_at IS NOT NULL AND messages_hidden_before IS NULL"
        )
    )
    await conn.execute(
        text(
            "ALTER TABLE messages "
            "ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE"
        )
    )
    await conn.execute(
        text(
            "ALTER TABLE conversation_members "
            "ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE"
        )
    )
    await conn.execute(
        text(
            "ALTER TABLE users "
            "ADD COLUMN IF NOT EXISTS show_last_seen BOOLEAN NOT NULL DEFAULT TRUE"
        )
    )
    await conn.execute(
        text(
            "ALTER TABLE users "
            "ADD COLUMN IF NOT EXISTS read_receipts_enabled BOOLEAN NOT NULL DEFAULT TRUE"
        )
    )
    await _normalize_timestamp_columns(conn)


async def _normalize_timestamp_columns(conn) -> None:
    """Convert legacy timestamp-without-time-zone columns to timestamptz."""
    await conn.execute(
        text(
            """
            DO $$
            DECLARE
                rec RECORD;
            BEGIN
                FOR rec IN
                    SELECT table_name, column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND data_type = 'timestamp without time zone'
                LOOP
                    EXECUTE format(
                        'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMP WITH TIME ZONE '
                        'USING %I AT TIME ZONE ''UTC''',
                        rec.table_name,
                        rec.column_name,
                        rec.column_name
                    );
                END LOOP;
            END $$;
            """
        )
    )


# ── Lifespan: create tables on startup (migrations handle schema in prod) ──────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create static upload directory if missing
    Path("static/uploads").mkdir(parents=True, exist_ok=True)
    # Auto-create tables in development; use Alembic migrations in production
    await _wait_for_database()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _apply_schema_patches(conn)
    yield
    await engine.dispose()


# ── Application factory ────────────────────────────────────────────────────────
app = FastAPI(
    title="NexTalk API",
    description="Real-time messaging platform — REST + WebSocket",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static files (uploaded images) ────────────────────────────────────────────
# Must exist before StaticFiles mount (lifespan runs too late).
Path("static/uploads").mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(api_router)


# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "version": "2.0.0"}
