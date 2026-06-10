from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.rate_limit import message_rate_limiter
from src.db.session import get_db
from src.models.message import Message
from src.models.user import User
from src.schemas.message import MessageCreate, MessageUpdate
from src.services.conversation_access import require_member
from src.services.messaging import (
    create_message,
    edit_message,
    emit_message_edited,
    emit_message_sent,
    message_payload,
    process_mark_read,
)

router = APIRouter(prefix="/messages", tags=["messages"])


@router.post("", status_code=201)
async def send_message(
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """REST fallback for sending a message (rate-limited). Prefer WebSocket for real-time delivery."""
    if not body.body and not body.image_url:
        raise HTTPException(status_code=400, detail="Message must have body or image_url")
    message_rate_limiter.check(current_user.id)
    await require_member(db, body.conversation_id, current_user)
    try:
        msg, receipts = await create_message(
            db, body.conversation_id, current_user, body.body, body.image_url
        )
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    await emit_message_sent(db, msg, current_user, receipts)
    return {"message": message_payload(msg, current_user, receipts)}


@router.patch("/{message_id}")
async def update_message(
    message_id: UUID,
    body: MessageUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit a message you sent. Broadcasts message_edited over WebSocket."""
    result = await db.execute(select(Message).where(Message.id == message_id))
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    await require_member(db, msg.conversation_id, current_user)
    try:
        updated = await edit_message(db, message_id, current_user, body.body)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    await emit_message_edited(updated, current_user)
    return {
        "message": {
            "id": str(updated.id),
            "conversation_id": str(updated.conversation_id),
            "body": updated.body,
            "edited_at": updated.edited_at.isoformat() if updated.edited_at else None,
        }
    }


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
