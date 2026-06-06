import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError
from pydantic import ValidationError
from sqlalchemy import select
from uuid import UUID

from src.core.security import decode_token
from src.db.session import AsyncSessionLocal
from src.models.user import User
from src.schemas.ws_events import (
    WsJoinConversation,
    WsLeaveConversation,
    WsMarkRead,
    WsPing,
    WsSendMessage,
    WsTyping,
)
from src.services.conversation_access import get_active_membership
from src.services.messaging import create_message, emit_message_sent, process_mark_read
from src.core.rate_limit import message_rate_limiter
from src.services.receipts import mark_conversation_delivered
from src.services.messaging import emit_receipt_updates
from src.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)
websocket_router = APIRouter()


async def _authenticate(token: str) -> User | None:
    try:
        payload = decode_token(token, expected_type="access")
        user_id = UUID(payload["sub"])
    except (JWTError, ValueError):
        return None
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()


@websocket_router.websocket("/ws")
async def user_websocket(websocket: WebSocket, token: str = Query(...)):
    """Single authenticated WebSocket per user (Slack/WhatsApp-style multiplexing)."""
    user = await _authenticate(token)
    if not user:
        await websocket.close(code=4001)
        return

    await ws_manager.connect(websocket, user.id)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "detail": "Invalid JSON"})
                continue

            event_type = data.get("type")

            if event_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            try:
                if event_type == "join_conversation":
                    evt = WsJoinConversation.model_validate(data)
                    async with AsyncSessionLocal() as db:
                        await get_active_membership(db, evt.conversation_id, user.id)
                        delivered = await mark_conversation_delivered(
                            db, evt.conversation_id, user.id
                        )
                        if delivered:
                            await emit_receipt_updates(
                                db, evt.conversation_id, delivered, "delivered"
                            )
                        await process_mark_read(db, evt.conversation_id, user.id)
                    ws_manager.join_conversation(user.id, evt.conversation_id)
                    await websocket.send_json(
                        {
                            "type": "joined_conversation",
                            "conversation_id": str(evt.conversation_id),
                        }
                    )

                elif event_type == "leave_conversation":
                    evt = WsLeaveConversation.model_validate(data)
                    ws_manager.leave_conversation(user.id, evt.conversation_id)
                    await ws_manager.broadcast_typing(
                        evt.conversation_id, user.id, False
                    )
                    await websocket.send_json(
                        {
                            "type": "left_conversation",
                            "conversation_id": str(evt.conversation_id),
                        }
                    )

                elif event_type == "typing":
                    evt = WsTyping.model_validate(data)
                    async with AsyncSessionLocal() as db:
                        await get_active_membership(db, evt.conversation_id, user.id)
                    if evt.is_typing:
                        await ws_manager.broadcast_typing(
                            evt.conversation_id, user.id, True, user.username
                        )
                        ws_manager.schedule_typing_stop(evt.conversation_id, user.id)
                    else:
                        ws_manager._cancel_typing(evt.conversation_id, user.id)
                        await ws_manager.broadcast_typing(
                            evt.conversation_id, user.id, False
                        )

                elif event_type == "send_message":
                    evt = WsSendMessage.model_validate(data)
                    # Must have either body or image_url
                    if not evt.body and not evt.image_url:
                        await websocket.send_json(
                            {"type": "error", "detail": "Message must have body or image_url"}
                        )
                        continue
                    message_rate_limiter.check(user.id)
                    async with AsyncSessionLocal() as db:
                        await get_active_membership(db, evt.conversation_id, user.id)
                        msg, receipts = await create_message(
                            db, evt.conversation_id, user, evt.body, evt.image_url
                        )
                        await emit_message_sent(db, msg, user, receipts)

                elif event_type == "mark_read":
                    evt = WsMarkRead.model_validate(data)
                    async with AsyncSessionLocal() as db:
                        await get_active_membership(db, evt.conversation_id, user.id)
                        await process_mark_read(db, evt.conversation_id, user.id)
                    await websocket.send_json(
                        {
                            "type": "conversation_read",
                            "conversation_id": str(evt.conversation_id),
                        }
                    )

                else:
                    await websocket.send_json(
                        {"type": "error", "detail": f"Unknown event type: {event_type}"}
                    )

            except ValidationError as e:
                await websocket.send_json(
                    {"type": "error", "detail": e.errors()}
                )
            except Exception as e:
                logger.exception("WS handler error: %s", e)
                await websocket.send_json({"type": "error", "detail": str(e)})

    except WebSocketDisconnect:
        disconnected_user = ws_manager.disconnect(websocket)
        if disconnected_user:
            for conv_id in list(ws_manager.active_conversations.get(disconnected_user, set())):
                await ws_manager.broadcast_typing(conv_id, disconnected_user, False)


# Legacy per-conversation endpoint (auto-joins then proxies typing/send)
@websocket_router.websocket("/ws/{conversation_id}")
async def legacy_conversation_websocket(
    websocket: WebSocket, conversation_id: UUID, token: str = Query(...)
):
    user = await _authenticate(token)
    if not user:
        await websocket.close(code=4001)
        return

    async with AsyncSessionLocal() as db:
        try:
            await get_active_membership(db, conversation_id, user.id)
        except Exception:
            await websocket.close(code=4003)
            return

    await ws_manager.connect(websocket, user.id)
    ws_manager.join_conversation(user.id, conversation_id)
    async with AsyncSessionLocal() as db:
        delivered = await mark_conversation_delivered(db, conversation_id, user.id)
        if delivered:
            await emit_receipt_updates(db, conversation_id, delivered, "delivered")
        await process_mark_read(db, conversation_id, user.id)

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            data["conversation_id"] = str(conversation_id)
            if data.get("type") == "typing":
                data["is_typing"] = data.get("is_typing", True)
            event_type = data.get("type")
            if event_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif event_type == "typing":
                evt = WsTyping.model_validate(data)
                if evt.is_typing:
                    await ws_manager.broadcast_typing(
                        conversation_id, user.id, True, user.username
                    )
                    ws_manager.schedule_typing_stop(conversation_id, user.id)
                else:
                    await ws_manager.broadcast_typing(conversation_id, user.id, False)
            elif event_type == "send_message":
                evt = WsSendMessage.model_validate(data)
                if not evt.body and not evt.image_url:
                    continue
                message_rate_limiter.check(user.id)
                async with AsyncSessionLocal() as db:
                    msg, receipts = await create_message(
                        db, conversation_id, user, evt.body, evt.image_url
                    )
                    await emit_message_sent(db, msg, user, receipts)
            elif event_type == "mark_read":
                async with AsyncSessionLocal() as db:
                    await process_mark_read(db, conversation_id, user.id)
    except WebSocketDisconnect:
        ws_manager.leave_conversation(user.id, conversation_id)
        ws_manager.disconnect(websocket)
        await ws_manager.broadcast_typing(conversation_id, user.id, False)
