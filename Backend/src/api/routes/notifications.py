"""Notifications REST routes."""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.db.session import get_db
from src.models.notification import Notification
from src.models.user import User
from src.schemas.notification import NotificationOut
from src.services.notifications import get_unread_count
from src.utils.datetime import utcnow

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    notifications = result.scalars().all()
    unread = await get_unread_count(db, current_user.id)
    return {
        "notifications": [NotificationOut.model_validate(n) for n in notifications],
        "unread_count": unread,
    }


@router.get("/unread-count")
async def unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await get_unread_count(db, current_user.id)
    return {"unread_count": count}


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification).where(
            and_(Notification.id == notification_id, Notification.user_id == current_user.id)
        )
    )
    notif = result.scalar_one_or_none()
    if notif and notif.read_at is None:
        notif.read_at = utcnow()
        await db.commit()
    unread = await get_unread_count(db, current_user.id)
    return {"detail": "Marked read", "unread_count": unread}


@router.post("/read-all")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification).where(
            and_(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        )
    )
    now = utcnow()
    for notif in result.scalars().all():
        notif.read_at = now
    await db.commit()
    return {"detail": "All notifications marked as read", "unread_count": 0}
