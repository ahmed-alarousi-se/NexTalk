from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.message import Message, MessageReceipt
from src.utils.datetime import utcnow


def status_upper(status: str) -> str:
    return status.upper()


async def mark_all_pending_delivered(
    db: AsyncSession, recipient_id: UUID
) -> dict[UUID, list[MessageReceipt]]:
    """Mark all SENT receipts as DELIVERED when recipient comes online."""
    result = await db.execute(
        select(MessageReceipt, Message.conversation_id)
        .join(Message, Message.id == MessageReceipt.message_id)
        .where(
            and_(
                MessageReceipt.recipient_id == recipient_id,
                MessageReceipt.status == "sent",
            )
        )
    )
    by_conv: dict[UUID, list[MessageReceipt]] = {}
    now = utcnow()
    for receipt, conversation_id in result.all():
        receipt.status = "delivered"
        receipt.updated_at = now
        by_conv.setdefault(conversation_id, []).append(receipt)
    if by_conv:
        await db.commit()
    return by_conv


async def mark_conversation_delivered(
    db: AsyncSession, conversation_id: UUID, recipient_id: UUID
) -> list[MessageReceipt]:
    """Mark SENT receipts as DELIVERED for a single conversation."""
    result = await db.execute(
        select(MessageReceipt).where(
            and_(
                MessageReceipt.recipient_id == recipient_id,
                MessageReceipt.status == "sent",
                MessageReceipt.message_id.in_(
                    select(Message.id).where(Message.conversation_id == conversation_id)
                ),
            )
        )
    )
    receipts = list(result.scalars().all())
    for r in receipts:
        r.status = "delivered"
        r.updated_at = utcnow()
    if receipts:
        await db.commit()
    return receipts


async def mark_conversation_read(
    db: AsyncSession, conversation_id: UUID, recipient_id: UUID
) -> list[MessageReceipt]:
    """Mark all SENT/DELIVERED receipts as READ for this user in the conversation."""
    result = await db.execute(
        select(MessageReceipt).where(
            and_(
                MessageReceipt.recipient_id == recipient_id,
                MessageReceipt.status.in_(["sent", "delivered"]),
                MessageReceipt.message_id.in_(
                    select(Message.id).where(Message.conversation_id == conversation_id)
                ),
            )
        )
    )
    receipts = list(result.scalars().all())
    now = utcnow()
    for r in receipts:
        r.status = "read"
        r.updated_at = now
    if receipts:
        await db.commit()
    return receipts


async def get_receipts_for_messages(
    db: AsyncSession, message_ids: list[UUID]
) -> dict[UUID, list[MessageReceipt]]:
    if not message_ids:
        return {}
    result = await db.execute(
        select(MessageReceipt).where(MessageReceipt.message_id.in_(message_ids))
    )
    by_msg: dict[UUID, list[MessageReceipt]] = {}
    for r in result.scalars().all():
        by_msg.setdefault(r.message_id, []).append(r)
    return by_msg


def aggregate_status_for_sender(receipts: list[MessageReceipt], sender_id: UUID) -> str:
    """Lowest status among recipients (excluding sender's own non-existent receipt)."""
    other = [r for r in receipts if r.recipient_id != sender_id]
    if not other:
        return "SENT"
    order = {"sent": 0, "delivered": 1, "read": 2}
    lowest = min(other, key=lambda r: order.get(r.status, 0))
    return status_upper(lowest.status)
