import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://nexttalk:changeme@localhost:5432/nexttalk"
    SECRET_KEY: str = "nexTalk-dev-secret-change-in-production"
    REFRESH_SECRET_KEY: str = "nexTalk-dev-refresh-secret-change-in-production"

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FRONTEND_URL: str = "http://localhost:8000"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    RESET_TOKEN_EXPIRE_MINUTES: int = 15

    # Include reset token in API response (dev/testing without email)
    EXPOSE_RESET_TOKEN: bool = True
    MESSAGE_RATE_LIMIT_PER_MINUTE: int = 60
    BCRYPT_ROUNDS: int = 12


settings = Settings()
