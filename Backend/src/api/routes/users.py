from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.db.session import get_db
from src.models.user import User
from src.schemas.user import UserOut, UserSearchOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def read_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
async def update_me(
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user_in.avatar_url is not None:
        current_user.avatar_url = user_in.avatar_url

    if user_in.email is not None:
        existing = await db.execute(select(User).where(User.email == user_in.email))
        if (existing_user := existing.scalar_one_or_none()) and existing_user.id != current_user.id:
            raise HTTPException(status_code=409, detail="Email already in use")
        current_user.email = user_in.email

    if user_in.username is not None:
        existing = await db.execute(select(User).where(User.username == user_in.username))
        if (existing_user := existing.scalar_one_or_none()) and existing_user.id != current_user.id:
            raise HTTPException(status_code=409, detail="Username already taken")
        current_user.username = user_in.username

    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/search")
async def search_users(
    q: str = Query(..., min_length=1, description="Username or email fragment"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .where(
            (User.username.ilike(f"%{q}%") | User.email.ilike(f"%{q}%"))
            & (User.id != current_user.id)
        )
        .limit(20)
    )
    users = result.scalars().all()
    return {"results": [UserSearchOut.model_validate(u) for u in users]}
