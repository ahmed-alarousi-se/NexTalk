from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

import bcrypt
from jose import JWTError, jwt

from src.core.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def _create_token(subject: str, expires_delta: timedelta, token_type: str, secret: str) -> str:
    expire = datetime.now(timezone.utc) + expires_delta
    payload = {"sub": subject, "exp": expire, "type": token_type}
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def create_access_token(user_id: UUID) -> str:
    return _create_token(
        str(user_id),
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "access",
        settings.SECRET_KEY,
    )


def create_refresh_token(user_id: UUID) -> str:
    return _create_token(
        str(user_id),
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "refresh",
        settings.REFRESH_SECRET_KEY,
    )


def create_reset_token(user_id: UUID) -> str:
    return _create_token(
        str(user_id),
        timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES),
        "reset",
        settings.SECRET_KEY,
    )


def decode_token(token: str, expected_type: Optional[str] = None) -> dict[str, Any]:
    secret = settings.REFRESH_SECRET_KEY if expected_type == "refresh" else settings.SECRET_KEY
    payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
    if expected_type and payload.get("type") != expected_type:
        raise JWTError("Invalid token type")
    return payload


def get_user_id_from_token(token: str, expected_type: str = "access") -> UUID:
    payload = decode_token(token, expected_type)
    return UUID(payload["sub"])
