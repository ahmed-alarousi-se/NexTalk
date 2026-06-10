import json
import os
import ssl
from pathlib import Path
from urllib.parse import urlparse

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_database_url(url: str) -> str:
    """Convert platform URLs (postgres://, postgresql://) to async SQLAlchemy form."""
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://") and "+asyncpg" not in url.split("://", 1)[0]:
        return "postgresql+asyncpg://" + url.removeprefix("postgresql://")
    return url


def database_connect_args(url: str) -> dict:
    """Enable SSL for remote Postgres hosts (Railway, Supabase, Neon, etc.)."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if host in {"localhost", "127.0.0.1", "db"}:
        return {}
    query = dict(
        part.split("=", 1)
        for part in parsed.query.split("&")
        if "=" in part
    )
    sslmode = query.get("sslmode", "").lower()
    if sslmode == "disable":
        return {}
    if sslmode or host:
        return {"ssl": ssl.create_default_context()}
    return {}


def _split_cors_origins(value: str) -> list[str]:
    stripped = value.strip()
    if stripped.startswith("["):
        return json.loads(stripped)
    return [origin.strip() for origin in stripped.split(",") if origin.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://nextalk:changeme@localhost:5432/nexttalk"

    # Firebase Admin — service account JSON (single line, from Firebase Console)
    FIREBASE_PROJECT_ID: str = "nextalk-ec625"
    FIREBASE_CREDENTIALS_JSON: str = ""

    FRONTEND_URL: str = "http://localhost:5173"
    # Comma-separated origins (str avoids pydantic-settings JSON parsing on list fields)
    CORS_ORIGINS: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "http://localhost:3000,"
        "http://127.0.0.1:3000,"
        "http://localhost:8080,"
        "http://127.0.0.1:8080"
    )
    # Dev convenience: allow any localhost port (5173, 8080, etc.)
    CORS_ALLOW_LOCALHOST: bool = True

    MESSAGE_RATE_LIMIT_PER_MINUTE: int = 60

    @model_validator(mode="after")
    def _validate_database_url(self) -> "Settings":
        if "DATABASE_URL" in os.environ:
            return self
        in_container = Path("/.dockerenv").exists()
        on_paas = any(os.getenv(key) for key in ("RAILWAY_ENVIRONMENT", "RENDER", "FLY_APP_NAME"))
        if in_container or on_paas:
            raise ValueError(
                "DATABASE_URL environment variable is required in production. "
                "Link a Postgres service (Railway/Render) or set the connection string manually."
            )
        return self

    @property
    def async_database_url(self) -> str:
        return normalize_database_url(self.DATABASE_URL)

    @property
    def async_database_connect_args(self) -> dict:
        return database_connect_args(self.async_database_url)

    @property
    def cors_origins(self) -> list[str]:
        return _split_cors_origins(self.CORS_ORIGINS)

    @property
    def cors_origin_regex(self) -> str | None:
        if self.CORS_ALLOW_LOCALHOST:
            return r"http://(localhost|127\.0\.0\.1)(:\d+)?"
        return None


settings = Settings()
