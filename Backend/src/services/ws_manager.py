import asyncio
import logging
from typing import Dict, Set
from uuid import UUID

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """One WebSocket per user; multiplexes conversation events."""

    def __init__(self) -> None:
        self.user_sockets: Dict[UUID, Set[WebSocket]] = {}
        self.socket_user: Dict[WebSocket, UUID] = {}
        # user_id -> set of conversation_ids they are actively viewing
        self.active_conversations: Dict[UUID, Set[UUID]] = {}
        # (conversation_id, user_id) -> asyncio Task for typing stop
        self._typing_tasks: Dict[tuple[UUID, UUID], asyncio.Task] = {}

    async def connect(self, websocket: WebSocket, user_id: UUID) -> None:
        await websocket.accept()
        self.user_sockets.setdefault(user_id, set()).add(websocket)
        self.socket_user[websocket] = user_id
        self.active_conversations.setdefault(user_id, set())

    def disconnect(self, websocket: WebSocket) -> UUID | None:
        user_id = self.socket_user.pop(websocket, None)
        if user_id is None:
            return None
        if user_id in self.user_sockets:
            self.user_sockets[user_id].discard(websocket)
            if not self.user_sockets[user_id]:
                del self.user_sockets[user_id]
        active = self.active_conversations.pop(user_id, set())
        for conv_id in active:
            self._cancel_typing(conv_id, user_id)
        return user_id

    def join_conversation(self, user_id: UUID, conversation_id: UUID) -> None:
        self.active_conversations.setdefault(user_id, set()).add(conversation_id)

    def leave_conversation(self, user_id: UUID, conversation_id: UUID) -> None:
        if user_id in self.active_conversations:
            self.active_conversations[user_id].discard(conversation_id)
        self._cancel_typing(conversation_id, user_id)

    def is_user_in_conversation(self, user_id: UUID, conversation_id: UUID) -> bool:
        return conversation_id in self.active_conversations.get(user_id, set())

    def users_in_conversation(self, conversation_id: UUID) -> Set[UUID]:
        return {
            uid
            for uid, convs in self.active_conversations.items()
            if conversation_id in convs
        }

    async def send_to_user(self, user_id: UUID, payload: dict) -> None:
        for ws in list(self.user_sockets.get(user_id, set())):
            try:
                await ws.send_json(payload)
            except Exception as e:
                logger.warning("WS send failed user=%s: %s", user_id, e)

    async def broadcast_to_conversation(
        self,
        conversation_id: UUID,
        payload: dict,
        exclude_user_id: UUID | None = None,
    ) -> None:
        for user_id in self.users_in_conversation(conversation_id):
            if exclude_user_id and user_id == exclude_user_id:
                continue
            await self.send_to_user(user_id, payload)

    async def broadcast_typing(
        self,
        conversation_id: UUID,
        from_user_id: UUID,
        is_typing: bool,
        username: str | None = None,
    ) -> None:
        event_type = "typing_started" if is_typing else "typing_stopped"
        payload = {
            "type": event_type,
            "conversation_id": str(conversation_id),
            "from": str(from_user_id),
        }
        if is_typing and username:
            payload["username"] = username
        await self.broadcast_to_conversation(
            conversation_id, payload, exclude_user_id=from_user_id
        )

    def schedule_typing_stop(
        self, conversation_id: UUID, user_id: UUID, delay: float = 3.0
    ) -> None:
        self._cancel_typing(conversation_id, user_id)

        async def _stop() -> None:
            await asyncio.sleep(delay)
            await self.broadcast_typing(conversation_id, user_id, False)

        task = asyncio.create_task(_stop())
        self._typing_tasks[(conversation_id, user_id)] = task

    def _cancel_typing(self, conversation_id: UUID, user_id: UUID) -> None:
        key = (conversation_id, user_id)
        task = self._typing_tasks.pop(key, None)
        if task and not task.done():
            task.cancel()


ws_manager = WebSocketManager()
