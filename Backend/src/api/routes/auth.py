import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.security import (
    create_access_token,
    create_refresh_token,
    create_reset_token,
    decode_token,
    hash_password,
    verify_password,
)
from src.db.session import get_db
from src.models.password_reset import PasswordResetToken
from src.models.user import User
from src.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from src.schemas.user import UserCreate
from src.services.email import send_password_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/register", status_code=201)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where((User.username == user_in.username) | (User.email == user_in.email))
    )
    if result.scalars().first():
        raise HTTPException(status_code=409, detail="Username or email already taken")

    user = User(
        username=user_in.username,
        email=user_in.email,
        password_hash=hash_password(user_in.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "created_at": user.created_at,
    }


@router.post("/login", response_model=TokenResponse)
async def login(user_in: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == user_in.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(user_in.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user_id=str(user.id),
    )


@router.post("/logout")
async def logout():
    """Stateless JWT logout — client discards tokens."""
    return {"detail": "Logged out successfully"}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    response: dict = {"detail": "If that email exists, a reset link was sent."}
    if not user:
        return response

    token = create_reset_token(user.id)
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)

    reset_row = PasswordResetToken(
        user_id=user.id,
        token_hash=_token_hash(token),
        expires_at=expires,
    )
    db.add(reset_row)
    await db.commit()

    # Send reset email (fire-and-forget — won't crash if SMTP misconfigured)
    await send_password_reset_email(user.email, user.username, token)

    if settings.EXPOSE_RESET_TOKEN:
        response["reset_token"] = token
        response["expires_in_minutes"] = settings.RESET_TOKEN_EXPIRE_MINUTES

    return response


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.token, expected_type="reset")
        user_id = payload["sub"]
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    token_hash = _token_hash(body.token)
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
        )
    )
    reset_row = result.scalar_one_or_none()
    if not reset_row:
        raise HTTPException(status_code=400, detail="Reset token already used or invalid")

    if reset_row.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token expired")

    user_result = await db.execute(select(User).where(User.id == reset_row.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(body.new_password)
    reset_row.used_at = datetime.now(timezone.utc)
    await db.commit()

    return {"detail": "Password updated successfully"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token, expected_type="refresh")
        user_id = payload["sub"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user_id=str(user.id),
    )
