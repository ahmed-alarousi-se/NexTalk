from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.user_block import UserBlock


async def is_blocked(db: AsyncSession, blocker_id: UUID, blocked_id: UUID) -> bool:
    result = await db.execute(
        select(UserBlock.id).where(
            and_(UserBlock.blocker_id == blocker_id, UserBlock.blocked_id == blocked_id)
        )
    )
    return result.scalar_one_or_none() is not None


async def is_either_blocked(db: AsyncSession, user_a: UUID, user_b: UUID) -> bool:
    result = await db.execute(
        select(UserBlock.id).where(
            or_(
                and_(UserBlock.blocker_id == user_a, UserBlock.blocked_id == user_b),
                and_(UserBlock.blocker_id == user_b, UserBlock.blocked_id == user_a),
            )
        )
    )
    return result.scalar_one_or_none() is not None


async def blocked_user_ids_for(db: AsyncSession, user_id: UUID) -> set[UUID]:
    """Users this person blocked plus users who blocked them."""
    result = await db.execute(
        select(UserBlock.blocker_id, UserBlock.blocked_id).where(
            or_(UserBlock.blocker_id == user_id, UserBlock.blocked_id == user_id)
        )
    )
    ids: set[UUID] = set()
    for blocker_id, blocked_id in result.all():
        if blocker_id == user_id:
            ids.add(blocked_id)
        else:
            ids.add(blocker_id)
    return ids
