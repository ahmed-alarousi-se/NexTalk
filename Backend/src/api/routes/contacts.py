from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.db.session import get_db
from src.models.contact import Contact, MessageRequest
from src.models.user import User
from src.schemas.contact import ContactCreate
from src.services.notifications import create_notification
from src.services.ws_manager import ws_manager

router = APIRouter(prefix="/contacts", tags=["contacts"])


# ── List contacts ──────────────────────────────────────────────────────────────
@router.get("")
async def list_contacts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Contact).where(Contact.owner_id == current_user.id))
    contacts = result.scalars().all()

    if not contacts:
        return {"contacts": []}

    contact_user_ids = [c.contact_user_id for c in contacts]
    users_result = await db.execute(select(User).where(User.id.in_(contact_user_ids)))
    users_map = {u.id: u for u in users_result.scalars().all()}

    return {
        "contacts": [
            {
                "id": c.id,
                "user": {
                    "id": u.id,
                    "username": u.username,
                    "avatar_url": u.avatar_url,
                    "last_seen": u.last_seen,
                },
                "added_at": c.added_at,
            }
            for c in contacts
            if (u := users_map.get(c.contact_user_id))
        ]
    }


# ── Send contact request ───────────────────────────────────────────────────────
@router.post("", status_code=201)
async def send_contact_request(
    contact_in: ContactCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == contact_in.username))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot add yourself")

    # Already contacts?
    existing_contact = await db.execute(
        select(Contact).where(
            and_(Contact.owner_id == current_user.id, Contact.contact_user_id == target.id)
        )
    )
    if existing_contact.scalars().first():
        raise HTTPException(status_code=409, detail="Already a contact")

    # Pending request already?
    existing_req = await db.execute(
        select(MessageRequest).where(
            and_(
                MessageRequest.from_user_id == current_user.id,
                MessageRequest.to_user_id == target.id,
                MessageRequest.status == "pending",
            )
        )
    )
    if existing_req.scalars().first():
        raise HTTPException(status_code=409, detail="Contact request already sent")

    req = MessageRequest(
        from_user_id=current_user.id,
        to_user_id=target.id,
        status="pending",
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)

    # Notify via DB + live WebSocket push
    await create_notification(
        db,
        user_id=target.id,
        notif_type="contact_request",
        title="Contact request",
        body=f"{current_user.username} sent you a contact request",
        data={
            "from_user_id": str(current_user.id),
            "from_username": current_user.username,
            "request_id": str(req.id),
        },
    )
    await ws_manager.send_to_user(
        target.id,
        {
            "type": "contact_request",
            "from_user_id": str(current_user.id),
            "from_username": current_user.username,
            "request_id": str(req.id),
        },
    )

    return {"detail": "Contact request sent", "request_id": req.id}


# ── Search within contacts ─────────────────────────────────────────────────────
@router.get("/search")
async def search_contacts(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Contact).where(Contact.owner_id == current_user.id))
    contact_user_ids = [c.contact_user_id for c in result.scalars().all()]
    if not contact_user_ids:
        return {"results": []}

    users_result = await db.execute(
        select(User)
        .where(User.id.in_(contact_user_ids), User.username.ilike(f"%{q}%"))
        .limit(20)
    )
    return {
        "results": [
            {"id": u.id, "username": u.username, "avatar_url": u.avatar_url}
            for u in users_result.scalars().all()
        ]
    }


# ── Remove contact ─────────────────────────────────────────────────────────────
@router.delete("/{contact_user_id}", status_code=204)
async def remove_contact(
    contact_user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Contact).where(
            and_(Contact.owner_id == current_user.id, Contact.contact_user_id == contact_user_id)
        )
    )
    if contact := result.scalar_one_or_none():
        await db.delete(contact)
        await db.commit()
