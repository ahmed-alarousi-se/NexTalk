"""WebSocket route — single /ws endpoint multiplexed per authenticated user."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.services.websocket import handle_connection

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Single persistent connection per user.
    Auth: token passed as query param  ?token=<access_jwt>
    Protocol events (JSON):
        → join_conversation  { type, conversation_id }
        → send_message       { type, conversation_id, body, image_url? }
        → typing             { type, conversation_id }
        ← new_message / typing_indicator / receipt_update / error
    """
    await handle_connection(websocket)
