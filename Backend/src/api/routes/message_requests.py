from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.db.session import get_db
from src.models.contact import Contact, MessageRequest
from src.models.user import User

router = APIRouter(prefix="/message-requests", tags=["message-requests"])


@router.get("")
async def list_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all pending inbound contact requests for the current user."""
    result = await db.execute(
        select(MessageRequest).where(
            and_(
                MessageRequest.to_user_id == current_user.id,
                MessageRequest.status == "pending",
            )
        )
    )
    requests = result.scalars().all()

    from_ids = [r.from_user_id for r in requests]
    users_map: dict = {}
    if from_ids:
        users_result = await db.execute(select(User).where(User.id.in_(from_ids)))
        users_map = {u.id: u for u in users_result.scalars().all()}

    return {
        "requests": [
            {
                "id": r.id,
                "from_user": {
                    "id": users_map[r.from_user_id].id,
                    "username": users_map[r.from_user_id].username,
                    "avatar_url": users_map[r.from_user_id].avatar_url,
                }
                if r.from_user_id in users_map
                else None,
                "status": r.status,
                "created_at": r.created_at,
            }
            for r in requests
        ]
    }


@router.post("/{request_id}/accept")
async def accept_request(
    request_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MessageRequest).where(
            and_(
                MessageRequest.id == request_id,
                MessageRequest.to_user_id == current_user.id,
            )
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending")

    req.status = "accepted"

    # Add bidirectional contact entries
    for owner_id, contact_id in [
        (current_user.id, req.from_user_id),
        (req.from_user_id, current_user.id),
    ]:
        existing = await db.execute(
            select(Contact).where(
                and_(Contact.owner_id == owner_id, Contact.contact_user_id == contact_id)
            )
        )
        if not existing.scalars().first():
            db.add(Contact(owner_id=owner_id, contact_user_id=contact_id))

    await db.commit()
    return {"detail": "Request accepted"}


@router.post("/{request_id}/decline")
async def decline_request(
    request_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MessageRequest).where(
            and_(
                MessageRequest.id == request_id,
                MessageRequest.to_user_id == current_user.id,
            )
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req.status = "declined"
    await db.commit()
    return {"detail": "Request declined"}
