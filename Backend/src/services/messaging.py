from datetime import datetime
from uuid import UUID
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from ulid import ULID

from src.models.conversation import Conversation, ConversationMember
from src.models.message import Message, MessageReceipt
from src.models.user import User
from src.services.blocks import is_either_blocked
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
    conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_result.scalar_one_or_none()
    if conv and conv.type == "direct":
        other_result = await db.execute(
            select(ConversationMember.user_id).where(
                and_(
                    ConversationMember.conversation_id == conversation_id,
                    ConversationMember.user_id != sender.id,
                    ConversationMember.status == "accepted",
                )
            )
        )
        other_id = other_result.scalar_one_or_none()
        if other_id and await is_either_blocked(db, sender.id, other_id):
            raise ValueError("Cannot message this user")

    new_msg = Message(
        conversation_id=conversation_id,
        sender_id=sender.id,
        body=body.strip() if body else None,
        image_url=image_url,
        cursor_key=str(ULID()),
    )
    db.add(new_msg)
    await db.flush()

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

        # Resurrect list visibility only; message history stays trimmed.
        if m.deleted_at is not None:
            m.deleted_at = None

        in_chat = ws_manager.is_user_in_conversation(m.user_id, conversation_id)
        if in_chat:
            status = "read"
        elif ws_manager.is_user_online(m.user_id):
            status = "delivered"
        else:
            status = "sent"
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
        "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
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

    new_message_event = {
        "type": "new_message",
        "conversation_id": str(conv_id),
        "message": payload,
    }
    await ws_manager.broadcast_to_conversation(
        conv_id,
        new_message_event,
        exclude_user_id=sender.id,
    )

    for r in receipts:
        if r.status == "read":
            await ws_manager.send_to_user(
                sender.id,
                {
                    "type": "message_read",
                    "conversation_id": str(conv_id),
                    "message_id": str(msg.id),
                    "recipient_id": str(r.recipient_id),
                    "status": "READ",
                },
            )
        elif r.status == "delivered":
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
            if not ws_manager.is_user_in_conversation(r.recipient_id, conv_id):
                await ws_manager.send_to_user(r.recipient_id, new_message_event)
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
        if new_status == "read":
            recipient = await db.execute(select(User).where(User.id == r.recipient_id))
            recipient_user = recipient.scalar_one_or_none()
            if recipient_user and not recipient_user.read_receipts_enabled:
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


async def edit_message(
    db: AsyncSession,
    message_id: UUID,
    editor: User,
    body: str,
) -> Message:
    """Edit a message body. Only the original sender may edit."""
    from datetime import datetime, timezone

    result = await db.execute(select(Message).where(Message.id == message_id))
    msg = result.scalar_one_or_none()
    if not msg:
        raise ValueError("Message not found")
    if msg.sender_id != editor.id:
        raise ValueError("Only the sender can edit this message")
    if not msg.body and msg.image_url:
        raise ValueError("Image-only messages cannot be edited")

    msg.body = body.strip()
    msg.edited_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(msg)
    return msg


async def emit_message_edited(msg: Message, editor: User) -> None:
    payload = {
        "type": "message_edited",
        "conversation_id": str(msg.conversation_id),
        "message": {
            "id": str(msg.id),
            "body": msg.body,
            "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
            "sender_id": str(editor.id),
        },
    }
    await ws_manager.broadcast_to_conversation(msg.conversation_id, payload)


async def process_pending_deliveries(db: AsyncSession, user_id: UUID) -> None:
    """Mark pending SENT receipts as DELIVERED when a user connects online."""
    from src.services.receipts import mark_all_pending_delivered

    by_conv = await mark_all_pending_delivered(db, user_id)
    for conversation_id, receipts in by_conv.items():
        await emit_receipt_updates(db, conversation_id, receipts, "delivered")


async def process_mark_read(
    db: AsyncSession, conversation_id: UUID, user_id: UUID
) -> list[MessageReceipt]:
    from src.services.receipts import mark_conversation_read
    from src.models.conversation import ConversationMember

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
