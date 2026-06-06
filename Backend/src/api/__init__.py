"""Central API router — all versioned routes are registered here."""
from fastapi import APIRouter

from src.api.routes import (
    auth,
    contacts,
    conversations,
    message_requests,
    messages,
    notifications,
    uploads,
    users,
    ws,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(contacts.router)
api_router.include_router(message_requests.router)
api_router.include_router(conversations.router)
api_router.include_router(messages.router)
api_router.include_router(notifications.router)
api_router.include_router(uploads.router)
api_router.include_router(ws.router)
