from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.rate_limit import message_rate_limiter
from src.db.session import get_db
from src.models.message import Message
from src.models.user import User
from src.schemas.message import MessageCreate
from src.services.conversation_access import require_member
from src.services.messaging import create_message, emit_message_sent, message_payload, process_mark_read

router = APIRouter(prefix="/messages", tags=["messages"])


@router.post("", status_code=201)
async def send_message(
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """REST fallback for sending a message (rate-limited). Prefer WebSocket for real-time delivery."""
    message_rate_limiter.check(current_user.id)
    await require_member(db, body.conversation_id, current_user)
    msg, receipts = await create_message(db, body.conversation_id, current_user, body.body)
    await emit_message_sent(db, msg, current_user, receipts)
    return {"message": message_payload(msg, current_user, receipts)}


@router.post("/{message_id}/read")
async def mark_message_read(
    message_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all messages up to (and including) this one as read in the conversation."""
    result = await db.execute(select(Message).where(Message.id == message_id))
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    await require_member(db, msg.conversation_id, current_user)
    receipts = await process_mark_read(db, msg.conversation_id, current_user.id)
    return {"marked_read": len(receipts), "conversation_id": str(msg.conversation_id)}
