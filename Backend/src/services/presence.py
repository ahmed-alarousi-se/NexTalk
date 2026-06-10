from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.conversation import ConversationMember
from src.models.user import User
from src.services.ws_manager import ws_manager
from src.utils.datetime import utcnow as _now


async def touch_last_seen(db: AsyncSession, user_id: UUID) -> datetime:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return _now()
    now = _now()
    user.last_seen = now
    await db.commit()
    return now


async def peers_for_user(db: AsyncSession, user_id: UUID) -> set[UUID]:
    """Users who share at least one accepted conversation with this user."""
    my_convs = select(ConversationMember.conversation_id).where(
        and_(
            ConversationMember.user_id == user_id,
            ConversationMember.status == "accepted",
            ConversationMember.deleted_at.is_(None),
        )
    )
    result = await db.execute(
        select(ConversationMember.user_id).where(
            and_(
                ConversationMember.conversation_id.in_(my_convs),
                ConversationMember.user_id != user_id,
                ConversationMember.status == "accepted",
                ConversationMember.deleted_at.is_(None),
            )
        )
    )
    return set(result.scalars().all())


async def broadcast_presence(
    db: AsyncSession, user_id: UUID, *, online: bool, last_seen: datetime | None = None
) -> None:
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return
    seen = last_seen or user.last_seen
    hide_seen = not getattr(user, "show_last_seen", True)
    payload = {
        "type": "presence_updated",
        "user_id": str(user_id),
        "username": user.username,
        "online": online,
        "last_seen": None if hide_seen else (seen.isoformat() if seen else None),
    }
    for peer_id in await peers_for_user(db, user_id):
        await ws_manager.send_to_user(peer_id, payload)
