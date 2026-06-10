"""WebRTC call signaling — relay-only with in-memory session tracking."""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import AsyncSessionLocal
from src.models.conversation import Conversation, ConversationMember
from src.models.user import User
from src.services.blocks import is_either_blocked
from src.services.messaging import create_call_log_message, emit_message_sent
from src.services.ws_manager import ws_manager
from src.utils.datetime import utcnow

logger = logging.getLogger(__name__)

RING_TIMEOUT_SECONDS = 45


class CallState(str, Enum):
    RINGING = "ringing"
    ACTIVE = "active"


@dataclass
class CallSession:
    call_id: UUID
    caller_id: UUID
    callee_id: UUID
    conversation_id: UUID
    call_type: str
    state: CallState = CallState.RINGING
    started_at: datetime | None = None
    ring_task: asyncio.Task | None = field(default=None, repr=False)


class CallSessionManager:
    def __init__(self) -> None:
        self._sessions: dict[UUID, CallSession] = {}
        self._user_calls: dict[UUID, UUID] = {}

    def get(self, call_id: UUID) -> CallSession | None:
        return self._sessions.get(call_id)

    def for_user(self, user_id: UUID) -> CallSession | None:
        call_id = self._user_calls.get(user_id)
        return self._sessions.get(call_id) if call_id else None

    def create(self, session: CallSession) -> None:
        self._sessions[session.call_id] = session
        self._user_calls[session.caller_id] = session.call_id
        self._user_calls[session.callee_id] = session.call_id

    def activate(self, call_id: UUID) -> None:
        session = self._sessions.get(call_id)
        if session:
            session.state = CallState.ACTIVE
            session.started_at = utcnow()
            _cancel_ring_task(session)

    def remove(self, call_id: UUID) -> CallSession | None:
        session = self._sessions.pop(call_id, None)
        if session:
            _cancel_ring_task(session)
            self._user_calls.pop(session.caller_id, None)
            self._user_calls.pop(session.callee_id, None)
        return session

    def remove_for_user(self, user_id: UUID) -> CallSession | None:
        call_id = self._user_calls.get(user_id)
        return self.remove(call_id) if call_id else None


call_manager = CallSessionManager()


def _cancel_ring_task(session: CallSession) -> None:
    if session.ring_task and not session.ring_task.done():
        session.ring_task.cancel()


def _schedule_ring_timeout(session: CallSession) -> None:
    _cancel_ring_task(session)
    session.ring_task = asyncio.create_task(_ring_timeout(session.call_id))


async def _ring_timeout(call_id: UUID) -> None:
    try:
        await asyncio.sleep(RING_TIMEOUT_SECONDS)
    except asyncio.CancelledError:
        return

    session = call_manager.get(call_id)
    if not session or session.state != CallState.RINGING:
        return

    await _finalize_call(
        session,
        log_status="missed",
        ended_by=session.caller_id,
        notify_type="call_missed",
        notify_reason="timeout",
        extra_payload={"show_quick_messages": True},
    )


async def _write_call_log(session: CallSession, status: str, duration_seconds: int = 0) -> None:
    try:
        async with AsyncSessionLocal() as db:
            caller_result = await db.execute(select(User).where(User.id == session.caller_id))
            caller = caller_result.scalar_one_or_none()
            if not caller:
                return
            msg, receipts = await create_call_log_message(
                db,
                session.conversation_id,
                caller,
                session.call_type,
                status,
                duration_seconds,
                session.call_id,
            )
            await emit_message_sent(db, msg, caller, receipts)
    except Exception:
        logger.exception("Failed to write call log for call %s", session.call_id)


async def _finalize_call(
    session: CallSession,
    *,
    log_status: str | None,
    duration_seconds: int = 0,
    ended_by: UUID,
    notify_type: str = "call_ended",
    notify_reason: str | None = None,
    extra_payload: dict | None = None,
) -> None:
    if log_status:
        await _write_call_log(session, log_status, duration_seconds)

    call_manager.remove(session.call_id)

    payload = {
        "type": notify_type,
        "call_id": str(session.call_id),
        "by_user_id": str(ended_by),
        "conversation_id": str(session.conversation_id),
        "call_type": session.call_type,
        "log_status": log_status,
    }
    if notify_reason:
        payload["reason"] = notify_reason
    if extra_payload:
        payload.update(extra_payload)

    await ws_manager.send_to_user(session.caller_id, payload)
    if session.callee_id != session.caller_id:
        await ws_manager.send_to_user(session.callee_id, payload)


async def _peer_in_direct_conversation(
    db: AsyncSession, conversation_id: UUID, user_id: UUID, peer_id: UUID
) -> bool:
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv or conv.type != "direct":
        return False

    members_result = await db.execute(
        select(ConversationMember.user_id).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.deleted_at.is_(None),
                ConversationMember.status == "accepted",
            )
        )
    )
    member_ids = {row[0] for row in members_result.all()}
    return user_id in member_ids and peer_id in member_ids and user_id != peer_id


def _peer_id(session: CallSession, user_id: UUID) -> UUID:
    return session.callee_id if user_id == session.caller_id else session.caller_id


async def handle_call_invite(
    db: AsyncSession,
    caller_id: UUID,
    caller_username: str,
    call_id: UUID,
    to_user_id: UUID,
    conversation_id: UUID,
    call_type: str,
) -> str | None:
    """Returns error message if invite rejected, else None."""
    if caller_id == to_user_id:
        return "Cannot call yourself"

    if call_manager.for_user(caller_id):
        return "You are already in a call"
    if call_manager.for_user(to_user_id):
        return "User is busy"

    try:
        from src.services.conversation_access import get_active_membership

        await get_active_membership(db, conversation_id, caller_id)
    except Exception:
        return "Not a member of this conversation"

    if not await _peer_in_direct_conversation(db, conversation_id, caller_id, to_user_id):
        return "Calls are only supported in direct conversations"

    if await is_either_blocked(db, caller_id, to_user_id):
        return "Cannot call this user"

    if not ws_manager.is_user_online(to_user_id):
        return "User is offline"

    caller_row = await db.execute(select(User).where(User.id == caller_id))
    caller = caller_row.scalar_one_or_none()

    session = CallSession(
        call_id=call_id,
        caller_id=caller_id,
        callee_id=to_user_id,
        conversation_id=conversation_id,
        call_type=call_type,
    )
    call_manager.create(session)
    _schedule_ring_timeout(session)

    await ws_manager.send_to_user(
        to_user_id,
        {
            "type": "call_incoming",
            "call_id": str(call_id),
            "from_user_id": str(caller_id),
            "from_username": caller_username,
            "from_avatar_url": caller.avatar_url if caller else None,
            "conversation_id": str(conversation_id),
            "call_type": call_type,
        },
    )
    return None


async def handle_call_accept(db: AsyncSession, user_id: UUID, call_id: UUID) -> str | None:
    session = call_manager.get(call_id)
    if not session:
        return "Call not found"
    if user_id != session.callee_id:
        return "Only the callee can accept"
    if session.state != CallState.RINGING:
        return "Call is no longer ringing"

    call_manager.activate(call_id)
    payload = {
        "type": "call_accepted",
        "call_id": str(call_id),
        "by_user_id": str(user_id),
    }
    await ws_manager.send_to_user(session.caller_id, payload)
    await ws_manager.send_to_user(session.callee_id, payload)
    return None


async def handle_call_reject(user_id: UUID, call_id: UUID) -> str | None:
    session = call_manager.get(call_id)
    if not session:
        return "Call not found"
    if user_id != session.callee_id:
        return "Only the callee can reject"

    await _finalize_call(
        session,
        log_status="declined",
        ended_by=user_id,
        notify_type="call_rejected",
    )
    return None


async def handle_call_end(user_id: UUID, call_id: UUID) -> str | None:
    session = call_manager.get(call_id)
    if not session:
        return "Call not found"
    if user_id not in (session.caller_id, session.callee_id):
        return "Not a participant in this call"

    if session.state == CallState.ACTIVE:
        duration = 0
        if session.started_at:
            duration = max(0, int((utcnow() - session.started_at).total_seconds()))
        await _finalize_call(
            session,
            log_status="completed",
            duration_seconds=duration,
            ended_by=user_id,
        )
    elif session.state == CallState.RINGING:
        log_status = "cancelled" if user_id == session.caller_id else "missed"
        await _finalize_call(
            session,
            log_status=log_status,
            ended_by=user_id,
            notify_reason="cancelled" if log_status == "cancelled" else "no_answer",
            extra_payload={"show_quick_messages": log_status in ("cancelled", "missed")},
        )
    else:
        call_manager.remove(call_id)

    return None


async def relay_call_signal(
    user_id: UUID, call_id: UUID, event_type: str, extra: dict
) -> str | None:
    session = call_manager.get(call_id)
    if not session:
        return "Call not found"
    if user_id not in (session.caller_id, session.callee_id):
        return "Not a participant in this call"

    peer = _peer_id(session, user_id)
    await ws_manager.send_to_user(
        peer,
        {"type": event_type, "call_id": str(call_id), "from_user_id": str(user_id), **extra},
    )
    return None


async def end_calls_for_user(user_id: UUID) -> None:
    session = call_manager.for_user(user_id)
    if not session:
        return

    peer = _peer_id(session, user_id)
    if session.state == CallState.ACTIVE:
        duration = 0
        if session.started_at:
            duration = max(0, int((utcnow() - session.started_at).total_seconds()))
        await _write_call_log(session, "completed", duration)
    elif session.state == CallState.RINGING:
        await _write_call_log(session, "missed", 0)

    call_manager.remove(session.call_id)
    await ws_manager.send_to_user(
        peer,
        {
            "type": "call_ended",
            "call_id": str(session.call_id),
            "by_user_id": str(user_id),
            "reason": "disconnected",
            "conversation_id": str(session.conversation_id),
        },
    )
