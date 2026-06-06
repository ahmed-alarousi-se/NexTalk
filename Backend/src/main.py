"""
NexTalk Messaging Platform — Application Entry Point
-----------------------------------------------------
Run locally:
    uvicorn src.main:app --reload --port 8000

Production (via Docker):
    CMD defined in Dockerfile
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from src.api import api_router
from src.core.config import settings
from src.db.base import Base  # noqa: F401 — registers all models with metadata
from src.db.session import engine


# ── Lifespan: create tables on startup (migrations handle schema in prod) ──────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create static upload directory if missing
    Path("static/uploads").mkdir(parents=True, exist_ok=True)
    # Auto-create tables in development; use Alembic migrations in production
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static files (uploaded images) ────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(api_router)


# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "version": "2.0.0"}
