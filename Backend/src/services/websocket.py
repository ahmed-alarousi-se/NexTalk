import json
import logging

from fastapi import WebSocket, WebSocketDisconnect, Query
from firebase_admin import auth as firebase_auth
from pydantic import ValidationError
from sqlalchemy import select
from uuid import UUID

from src.core.firebase import verify_firebase_token
from src.db.session import AsyncSessionLocal
from src.models.user import User
from src.schemas.ws_events import (
    WsCallAccept,
    WsCallAnswer,
    WsCallEnd,
    WsCallInvite,
    WsCallOffer,
    WsCallReject,
    WsEditMessage,
    WsIceCandidate,
    WsJoinConversation,
    WsLeaveConversation,
    WsMarkRead,
    WsPing,
    WsSendMessage,
    WsTyping,
)
from src.services.calls import (
    end_calls_for_user,
    handle_call_accept,
    handle_call_end,
    handle_call_invite,
    handle_call_reject,
    relay_call_signal,
)
from src.services.conversation_access import get_active_membership
from src.services.messaging import (
    create_message,
    edit_message,
    emit_message_edited,
    emit_message_sent,
    process_mark_read,
    process_pending_deliveries,
)
from src.services.presence import broadcast_presence, touch_last_seen
from src.core.rate_limit import message_rate_limiter
from src.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)


async def _authenticate(token: str) -> User | None:
    try:
        decoded = verify_firebase_token(token)
        firebase_uid = decoded["uid"]
    except (firebase_auth.InvalidIdTokenError, firebase_auth.ExpiredIdTokenError, Exception):
        return None
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
        return result.scalar_one_or_none()


async def handle_connection(websocket: WebSocket, token: str) -> None:
    """Single authenticated WebSocket per user (Slack/WhatsApp-style multiplexing)."""
    user = await _authenticate(token)
    if not user:
        await websocket.close(code=4001)
        return

    await ws_manager.connect(websocket, user.id)
    try:
        async with AsyncSessionLocal() as db:
            await process_pending_deliveries(db, user.id)
            last_seen = await touch_last_seen(db, user.id)
            await broadcast_presence(db, user.id, online=True, last_seen=last_seen)
        await websocket.send_json({"type": "connected", "user_id": str(user.id)})

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
                    ws_manager.join_conversation(user.id, evt.conversation_id, websocket)
                    async with AsyncSessionLocal() as db:
                        await get_active_membership(db, evt.conversation_id, user.id)
                        await process_mark_read(db, evt.conversation_id, user.id)
                    await websocket.send_json(
                        {
                            "type": "joined_conversation",
                            "conversation_id": str(evt.conversation_id),
                        }
                    )

                elif event_type == "leave_conversation":
                    evt = WsLeaveConversation.model_validate(data)
                    ws_manager.leave_conversation(user.id, evt.conversation_id, websocket)
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
                    if not evt.body and not evt.image_url:
                        await websocket.send_json(
                            {"type": "error", "detail": "Message must have body or image_url"}
                        )
                        continue
                    message_rate_limiter.check(user.id)
                    async with AsyncSessionLocal() as db:
                        await get_active_membership(db, evt.conversation_id, user.id)
                        try:
                            msg, receipts = await create_message(
                                db, evt.conversation_id, user, evt.body, evt.image_url
                            )
                        except ValueError as e:
                            await websocket.send_json({"type": "error", "detail": str(e)})
                            continue
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

                elif event_type == "edit_message":
                    evt = WsEditMessage.model_validate(data)
                    async with AsyncSessionLocal() as db:
                        from src.models.message import Message as MsgModel
                        msg_result = await db.execute(
                            select(MsgModel).where(MsgModel.id == evt.message_id)
                        )
                        msg_row = msg_result.scalar_one_or_none()
                        if not msg_row:
                            await websocket.send_json({"type": "error", "detail": "Message not found"})
                            continue
                        await get_active_membership(db, msg_row.conversation_id, user.id)
                        try:
                            updated = await edit_message(db, evt.message_id, user, evt.body)
                        except ValueError as e:
                            await websocket.send_json({"type": "error", "detail": str(e)})
                            continue
                    await emit_message_edited(updated, user)

                elif event_type == "call_invite":
                    evt = WsCallInvite.model_validate(data)
                    async with AsyncSessionLocal() as db:
                        err = await handle_call_invite(
                            db,
                            user.id,
                            user.username,
                            evt.call_id,
                            evt.to_user_id,
                            evt.conversation_id,
                            evt.call_type,
                        )
                    if err:
                        await websocket.send_json({"type": "error", "detail": err})
                    else:
                        await websocket.send_json(
                            {
                                "type": "call_ringing",
                                "call_id": str(evt.call_id),
                                "to_user_id": str(evt.to_user_id),
                                "call_type": evt.call_type,
                            }
                        )

                elif event_type == "call_accept":
                    evt = WsCallAccept.model_validate(data)
                    async with AsyncSessionLocal() as db:
                        err = await handle_call_accept(db, user.id, evt.call_id)
                    if err:
                        await websocket.send_json({"type": "error", "detail": err})

                elif event_type == "call_reject":
                    evt = WsCallReject.model_validate(data)
                    err = await handle_call_reject(user.id, evt.call_id)
                    if err:
                        await websocket.send_json({"type": "error", "detail": err})

                elif event_type == "call_end":
                    evt = WsCallEnd.model_validate(data)
                    err = await handle_call_end(user.id, evt.call_id)
                    if err:
                        await websocket.send_json({"type": "error", "detail": err})

                elif event_type == "call_offer":
                    evt = WsCallOffer.model_validate(data)
                    err = await relay_call_signal(user.id, evt.call_id, "call_offer", {"sdp": evt.sdp})
                    if err:
                        await websocket.send_json({"type": "error", "detail": err})

                elif event_type == "call_answer":
                    evt = WsCallAnswer.model_validate(data)
                    err = await relay_call_signal(user.id, evt.call_id, "call_answer", {"sdp": evt.sdp})
                    if err:
                        await websocket.send_json({"type": "error", "detail": err})

                elif event_type == "ice_candidate":
                    evt = WsIceCandidate.model_validate(data)
                    err = await relay_call_signal(
                        user.id, evt.call_id, "ice_candidate", {"candidate": evt.candidate}
                    )
                    if err:
                        await websocket.send_json({"type": "error", "detail": err})

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
        pass
    finally:
        disconnected_user = ws_manager.disconnect(websocket)
        if disconnected_user:
            await end_calls_for_user(disconnected_user)
            if not ws_manager.is_user_online(disconnected_user):
                async with AsyncSessionLocal() as db:
                    last_seen = await touch_last_seen(db, disconnected_user)
                    await broadcast_presence(
                        db, disconnected_user, online=False, last_seen=last_seen
                    )


async def legacy_conversation_websocket(
    websocket: WebSocket, conversation_id: UUID, token: str
) -> None:
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
    async with AsyncSessionLocal() as db:
        await process_pending_deliveries(db, user.id)
    ws_manager.join_conversation(user.id, conversation_id, websocket)
    async with AsyncSessionLocal() as db:
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
                    try:
                        msg, receipts = await create_message(
                            db, conversation_id, user, evt.body, evt.image_url
                        )
                    except ValueError:
                        continue
                    await emit_message_sent(db, msg, user, receipts)
            elif event_type == "mark_read":
                async with AsyncSessionLocal() as db:
                    await process_mark_read(db, conversation_id, user.id)
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.leave_conversation(user.id, conversation_id, websocket)
        disconnected_user = ws_manager.disconnect(websocket)
        await ws_manager.broadcast_typing(conversation_id, user.id, False)
        if disconnected_user and not ws_manager.is_user_online(disconnected_user):
            async with AsyncSessionLocal() as db:
                last_seen = await touch_last_seen(db, disconnected_user)
                await broadcast_presence(
                    db, disconnected_user, online=False, last_seen=last_seen
                )
