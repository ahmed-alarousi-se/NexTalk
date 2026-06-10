import json

from pydantic_settings import BaseSettings, SettingsConfigDict


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

    @property
    def cors_origins(self) -> list[str]:
        return _split_cors_origins(self.CORS_ORIGINS)

    @property
    def cors_origin_regex(self) -> str | None:
        if self.CORS_ALLOW_LOCALHOST:
            return r"http://(localhost|127\.0\.0\.1)(:\d+)?"
        return None


settings = Settings()
