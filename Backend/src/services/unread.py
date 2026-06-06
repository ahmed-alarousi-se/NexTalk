from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.conversation import ConversationMember
from src.models.message import Message, MessageReceipt


async def count_unread_in_conversation(
    db: AsyncSession, conversation_id: UUID, user_id: UUID
) -> int:
    result = await db.execute(
        select(func.count(MessageReceipt.id)).where(
            and_(
                MessageReceipt.recipient_id == user_id,
                MessageReceipt.status.in_(["sent", "delivered"]),
                MessageReceipt.message_id.in_(
                    select(Message.id).where(Message.conversation_id == conversation_id)
                ),
            )
        )
    )
    return int(result.scalar() or 0)


async def get_unread_counts_for_user(db: AsyncSession, user_id: UUID) -> dict[str, int]:
    mem_result = await db.execute(
        select(ConversationMember.conversation_id).where(
            and_(
                ConversationMember.user_id == user_id,
                ConversationMember.deleted_at.is_(None),
            )
        )
    )
    conv_ids = [row[0] for row in mem_result.all()]
    counts: dict[str, int] = {}
    for conv_id in conv_ids:
        counts[str(conv_id)] = await count_unread_in_conversation(db, conv_id, user_id)
    return counts
