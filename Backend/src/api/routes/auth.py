import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from firebase_admin import auth as firebase_auth
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user, security
from src.core.firebase import verify_firebase_token
from src.db.session import get_db
from src.models.user import User
from src.schemas.auth import SyncUserRequest
from src.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _default_username(email: str | None, firebase_uid: str) -> str:
    if email and "@" in email:
        base = re.sub(r"[^a-zA-Z0-9_]", "", email.split("@")[0].lower())
        if len(base) >= 2:
            return base[:50]
    return f"user_{firebase_uid[:8]}"


async def _unique_username(db: AsyncSession, desired: str) -> str:
    candidate = desired[:50]
    suffix = 0
    while True:
        name = candidate if suffix == 0 else f"{candidate[:45]}_{suffix}"
        existing = await db.execute(select(User).where(User.username == name))
        if not existing.scalar_one_or_none():
            return name
        suffix += 1


@router.post("/sync", response_model=UserOut)
async def sync_user(
    body: SyncUserRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    """Create or return the app user for an authenticated Firebase account."""
    decoded = verify_firebase_token(credentials.credentials)
    firebase_uid = decoded["uid"]
    email = decoded.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Firebase account must have an email")

    provider = decoded.get("firebase", {}).get("sign_in_provider", "password")
    avatar_url = decoded.get("picture")

    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()
    if user:
        if avatar_url and user.avatar_url != avatar_url:
            user.avatar_url = avatar_url
            await db.commit()
            await db.refresh(user)
        return user

    username = body.username or _default_username(email, firebase_uid)
    username = await _unique_username(db, username)

    user = User(
        firebase_uid=firebase_uid,
        username=username,
        email=email,
        auth_provider=provider,
        avatar_url=avatar_url,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/me", status_code=204)
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete the app user and Firebase account."""
    await db.delete(current_user)
    await db.commit()
    try:
        firebase_auth.delete_user(current_user.firebase_uid)
    except Exception:
        pass
