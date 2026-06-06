from datetime import datetime
from uuid import UUID
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ulid import ULID

from src.models.conversation import Conversation, ConversationMember
from src.models.message import Message, MessageReceipt
from src.models.user import User
from src.services.receipts import aggregate_status_for_sender, status_upper, utcnow
from src.services.unread import get_unread_counts_for_user
from src.services.ws_manager import ws_manager


async def create_message(
    db: AsyncSession,
    conversation_id: UUID,
    sender: User,
    body: Optional[str],
    image_url: Optional[str] = None,
) -> tuple[Message, list[MessageReceipt]]:
    """Create a message, mark conversation has_messages, resurrect soft-deleted members."""
    new_msg = Message(
        conversation_id=conversation_id,
        sender_id=sender.id,
        body=body.strip() if body else None,
        image_url=image_url,
        cursor_key=str(ULID()),
    )
    db.add(new_msg)
    await db.flush()

    # Mark the conversation as having messages (so it appears in lists)
    conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_result.scalar_one_or_none()
    if conv and not conv.has_messages:
        conv.has_messages = True

    members_result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.status == "accepted",
        )
    )
    all_members = members_result.scalars().all()
    receipts: list[MessageReceipt] = []

    for m in all_members:
        if m.user_id == sender.id:
            continue

        # Resurrect soft-deleted membership for direct chats
        if m.deleted_at is not None:
            m.deleted_at = None

        in_chat = ws_manager.is_user_in_conversation(m.user_id, conversation_id)
        status = "delivered" if in_chat else "sent"
        receipt = MessageReceipt(
            message_id=new_msg.id,
            recipient_id=m.user_id,
            status=status,
        )
        db.add(receipt)
        receipts.append(receipt)

    await db.commit()
    await db.refresh(new_msg)
    for r in receipts:
        await db.refresh(r)
    return new_msg, receipts


def message_payload(
    msg: Message, sender: User, receipts: list[MessageReceipt]
) -> dict:
    status = aggregate_status_for_sender(receipts, sender.id)
    return {
        "id": str(msg.id),
        "conversation_id": str(msg.conversation_id),
        "sender": {
            "id": str(sender.id),
            "username": sender.username,
            "avatar_url": sender.avatar_url,
        },
        "body": msg.body,
        "image_url": msg.image_url,
        "cursor_key": msg.cursor_key,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "status": status,
        "receipts": [
            {
                "recipient_id": str(r.recipient_id),
                "status": status_upper(r.status),
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in receipts
        ],
    }


async def emit_message_sent(
    db: AsyncSession,
    msg: Message,
    sender: User,
    receipts: list[MessageReceipt],
) -> None:
    payload = message_payload(msg, sender, receipts)
    conv_id = msg.conversation_id

    await ws_manager.send_to_user(
        sender.id,
        {"type": "message_sent", "conversation_id": str(conv_id), "message": payload},
    )

    await ws_manager.broadcast_to_conversation(
        conv_id,
        {"type": "new_message", "conversation_id": str(conv_id), "message": payload},
        exclude_user_id=sender.id,
    )

    for r in receipts:
        if r.status == "delivered":
            await ws_manager.send_to_user(
                sender.id,
                {
                    "type": "message_delivered",
                    "conversation_id": str(conv_id),
                    "message_id": str(msg.id),
                    "recipient_id": str(r.recipient_id),
                    "status": "DELIVERED",
                },
            )
        await _emit_unread_for_user(db, r.recipient_id)


async def emit_receipt_updates(
    db: AsyncSession,
    conversation_id: UUID,
    receipts: list[MessageReceipt],
    new_status: str,
) -> None:
    for r in receipts:
        msg_q = await db.execute(select(Message).where(Message.id == r.message_id))
        msg = msg_q.scalar_one_or_none()
        if not msg:
            continue
        event = "message_read" if new_status == "read" else "message_delivered"
        await ws_manager.send_to_user(
            msg.sender_id,
            {
                "type": event,
                "conversation_id": str(conversation_id),
                "message_id": str(r.message_id),
                "recipient_id": str(r.recipient_id),
                "status": status_upper(new_status),
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            },
        )
        await _emit_unread_for_user(db, r.recipient_id)


async def _emit_unread_for_user(db: AsyncSession, user_id: UUID) -> None:
    counts = await get_unread_counts_for_user(db, user_id)
    total = sum(counts.values())
    await ws_manager.send_to_user(
        user_id,
        {
            "type": "unread_count_updated",
            "counts": counts,
            "total_unread": total,
        },
    )


async def process_mark_read(
    db: AsyncSession, conversation_id: UUID, user_id: UUID
) -> list[MessageReceipt]:
    from src.services.receipts import mark_conversation_delivered, mark_conversation_read
    from src.models.conversation import ConversationMember

    delivered = await mark_conversation_delivered(db, conversation_id, user_id)
    if delivered:
        await emit_receipt_updates(db, conversation_id, delivered, "delivered")

    read_receipts = await mark_conversation_read(db, conversation_id, user_id)

    mem_result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    member = mem_result.scalar_one_or_none()
    if member:
        member.last_read_at = utcnow()
        await db.commit()

    if read_receipts:
        await emit_receipt_updates(db, conversation_id, read_receipts, "read")

    await _emit_unread_for_user(db, user_id)
    return read_receipts
