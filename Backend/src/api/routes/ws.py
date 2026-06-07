"""WebSocket route — single /ws endpoint multiplexed per authenticated user."""
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket

from src.services.websocket import handle_connection, legacy_conversation_websocket

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    """
    Single persistent connection per user.
    Auth: token passed as query param ?token=<firebase_id_token>
    """
    await handle_connection(websocket, token)


@router.websocket("/ws/{conversation_id}")
async def legacy_websocket_endpoint(
    websocket: WebSocket,
    conversation_id: UUID,
    token: str = Query(...),
):
    await legacy_conversation_websocket(websocket, conversation_id, token)
