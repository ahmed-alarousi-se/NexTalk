from uuid import UUID
from typing import Optional

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.notification import Notification
from src.services.ws_manager import ws_manager


async def create_notification(
    db: AsyncSession,
    user_id: UUID,
    notif_type: str,
    title: str,
    body: str = "",
    data: Optional[dict] = None,
) -> Notification:
    """Insert a notification and push it to the user via WebSocket."""
    notif = Notification(
        user_id=user_id,
        type=notif_type,
        title=title,
        body=body,
        data=data or {},
    )
    db.add(notif)
    await db.commit()
    await db.refresh(notif)

    unread_count = await get_unread_count(db, user_id)
    await ws_manager.send_to_user(
        user_id,
        {
            "type": "notification",
            "notification": {
                "id": str(notif.id),
                "type": notif.type,
                "title": notif.title,
                "body": notif.body,
                "data": notif.data,
                "read_at": None,
                "created_at": notif.created_at.isoformat() if notif.created_at else None,
            },
            "unread_count": unread_count,
        },
    )
    return notif


async def get_unread_count(db: AsyncSession, user_id: UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(Notification).where(
            and_(Notification.user_id == user_id, Notification.read_at.is_(None))
        )
    )
    return result.scalar() or 0
