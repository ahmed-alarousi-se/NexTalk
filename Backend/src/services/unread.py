from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.conversation import ConversationMember
from src.models.message import Message, MessageReceipt


async def count_unread_in_conversation(
    db: AsyncSession,
    conversation_id: UUID,
    user_id: UUID,
    messages_hidden_before: datetime | None = None,
) -> int:
    visible_messages = select(Message.id).where(Message.conversation_id == conversation_id)
    if messages_hidden_before is not None:
        visible_messages = visible_messages.where(
            Message.created_at > messages_hidden_before
        )
    result = await db.execute(
        select(func.count(MessageReceipt.id)).where(
            and_(
                MessageReceipt.recipient_id == user_id,
                MessageReceipt.status.in_(["sent", "delivered"]),
                MessageReceipt.message_id.in_(visible_messages),
            )
        )
    )
    return int(result.scalar() or 0)


async def get_unread_counts_for_user(db: AsyncSession, user_id: UUID) -> dict[str, int]:
    mem_result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.user_id == user_id,
                ConversationMember.deleted_at.is_(None),
            )
        )
    )
    memberships = mem_result.scalars().all()
    counts: dict[str, int] = {}
    for membership in memberships:
        counts[str(membership.conversation_id)] = await count_unread_in_conversation(
            db,
            membership.conversation_id,
            user_id,
            messages_hidden_before=membership.messages_hidden_before,
        )
    return counts
