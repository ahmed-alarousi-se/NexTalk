from datetime import datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from src.models.conversation import ConversationMember
from src.models.message import Message
from src.models.user import User


async def get_membership(
    db: AsyncSession, conversation_id: UUID, user_id: UUID
) -> ConversationMember | None:
    result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user_id,
            )
        )
    )
    return result.scalar_one_or_none()


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


def message_visibility_cutoff(member: ConversationMember | None) -> datetime | None:
    if member is None:
        return None
    return member.messages_hidden_before


def visible_message_condition(
    member: ConversationMember | None,
) -> ColumnElement[bool] | None:
    cutoff = message_visibility_cutoff(member)
    if cutoff is None:
        return None
    return Message.created_at > cutoff


def apply_message_visibility(query, member: ConversationMember | None):
    condition = visible_message_condition(member)
    if condition is not None:
        query = query.where(condition)
    return query
