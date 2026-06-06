from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.conversation import ConversationMember
from src.models.user import User


async def get_active_membership(
    db: AsyncSession, conversation_id: UUID, user_id: UUID
) -> ConversationMember:
    result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user_id,
                ConversationMember.deleted_at.is_(None),
            )
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this conversation")
    return member


async def require_member(
    db: AsyncSession, conversation_id: UUID, user: User
) -> ConversationMember:
    return await get_active_membership(db, conversation_id, user.id)
