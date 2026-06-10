from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.db.session import get_db
from src.models.user import User
from src.models.user_block import UserBlock
from src.schemas.user import BlockedUserOut, UserOut, UserSearchOut, UserUpdate
from src.services.blocks import blocked_user_ids_for, is_blocked

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

    if user_in.show_last_seen is not None:
        current_user.show_last_seen = user_in.show_last_seen

    if user_in.read_receipts_enabled is not None:
        current_user.read_receipts_enabled = user_in.read_receipts_enabled

    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/search")
async def search_users(
    q: str = Query(..., min_length=1, description="Username or email fragment"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    blocked_ids = await blocked_user_ids_for(db, current_user.id)
    result = await db.execute(
        select(User)
        .where(
            (User.username.ilike(f"%{q}%") | User.email.ilike(f"%{q}%"))
            & (User.id != current_user.id)
        )
        .limit(20)
    )
    users = [u for u in result.scalars().all() if u.id not in blocked_ids]
    return {"results": [UserSearchOut.model_validate(u) for u in users]}


@router.get("/blocks")
async def list_blocks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserBlock).where(UserBlock.blocker_id == current_user.id).order_by(UserBlock.created_at.desc())
    )
    blocks = result.scalars().all()
    if not blocks:
        return {"blocks": []}

    blocked_ids = [b.blocked_id for b in blocks]
    users_result = await db.execute(select(User).where(User.id.in_(blocked_ids)))
    users_map = {u.id: u for u in users_result.scalars().all()}

    return {
        "blocks": [
            BlockedUserOut(
                user_id=b.blocked_id,
                username=users_map[b.blocked_id].username,
                avatar_url=users_map[b.blocked_id].avatar_url,
                blocked_at=b.created_at,
            )
            for b in blocks
            if b.blocked_id in users_map
        ]
    }


@router.post("/blocks", status_code=201)
async def block_user(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id_str = body.get("user_id")
    if not user_id_str:
        raise HTTPException(status_code=400, detail="user_id required")
    blocked_id = UUID(str(user_id_str))
    if blocked_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")

    target = await db.execute(select(User).where(User.id == blocked_id))
    if not target.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    if await is_blocked(db, current_user.id, blocked_id):
        raise HTTPException(status_code=409, detail="User already blocked")

    db.add(UserBlock(blocker_id=current_user.id, blocked_id=blocked_id))
    await db.commit()
    return {"detail": "User blocked"}


@router.delete("/blocks/{user_id}", status_code=204)
async def unblock_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserBlock).where(
            and_(UserBlock.blocker_id == current_user.id, UserBlock.blocked_id == user_id)
        )
    )
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    await db.delete(block)
    await db.commit()
