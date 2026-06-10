from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.db.session import get_db
from src.models.contact import Contact
from src.models.conversation import Conversation, ConversationMember
from src.models.message import Message, MessageReceipt
from src.models.user import User
from src.schemas.conversation import (
    ConversationPreferencesUpdate,
    GroupInviteCreate,
    MediaHistoryOut,
    MediaItemOut,
    MemberAdd,
)
from src.services.blocks import is_either_blocked
from src.schemas.message import MessageHistoryOut, MessageOut, PaginationOut
from src.services.conversation_access import apply_message_visibility, require_member
from src.services.messaging import process_mark_read
from src.services.notifications import create_notification
from src.services.receipts import aggregate_status_for_sender, get_receipts_for_messages, status_upper
from src.utils.datetime import ensure_utc, utcnow
from src.services.unread import count_unread_in_conversation, get_unread_counts_for_user
from src.services.ws_manager import ws_manager

router = APIRouter(prefix="/conversations", tags=["conversations"])

# Distinct palette for group member bubbles (up to 20 slots)
MEMBER_COLORS = [
    "#4f8ef7", "#4fd18e", "#f7a84f", "#f75f5f", "#c084fc",
    "#fb923c", "#34d399", "#60a5fa", "#f472b6", "#a78bfa",
    "#fbbf24", "#2dd4bf", "#f87171", "#818cf8", "#4ade80",
    "#e879f9", "#fb7185", "#38bdf8", "#facc15", "#a3e635",
]


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _pick_color(db: AsyncSession, conversation_id: UUID) -> str:
    result = await db.execute(
        select(ConversationMember.color).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.color.isnot(None),
            )
        )
    )
    used = set(result.scalars().all())
    for color in MEMBER_COLORS:
        if color not in used:
            return color
    count_result = await db.execute(
        select(func.count())
        .select_from(ConversationMember)
        .where(ConversationMember.conversation_id == conversation_id)
    )
    return MEMBER_COLORS[(count_result.scalar() or 0) % len(MEMBER_COLORS)]


async def _build_list_item(
    db: AsyncSession, conv: Conversation, current_user: User, membership: ConversationMember
) -> dict:
    last_msg_query = select(Message).where(Message.conversation_id == conv.id)
    last_msg_query = apply_message_visibility(last_msg_query, membership)
    last_msg_result = await db.execute(
        last_msg_query.order_by(desc(Message.cursor_key)).limit(1)
    )
    last_msg = last_msg_result.scalar_one_or_none()
    unread_count = await count_unread_in_conversation(
        db,
        conv.id,
        current_user.id,
        messages_hidden_before=membership.messages_hidden_before,
    )

    other_user = None
    if conv.type == "direct":
        other_mem_result = await db.execute(
            select(ConversationMember).where(
                and_(
                    ConversationMember.conversation_id == conv.id,
                    ConversationMember.user_id != current_user.id,
                    ConversationMember.deleted_at.is_(None),
                )
            )
        )
        other_member = other_mem_result.scalar_one_or_none()
        if other_member:
            u_result = await db.execute(select(User).where(User.id == other_member.user_id))
            u = u_result.scalar_one_or_none()
            if u:
                other_user = {
                    "id": u.id,
                    "username": u.username,
                    "avatar_url": u.avatar_url,
                    "last_seen": None if not u.show_last_seen else u.last_seen,
                }

    return {
        "id": conv.id,
        "type": conv.type,
        "name": conv.name,
        "description": conv.description,
        "other_user": other_user,
        "last_message": {
            "body": last_msg.body,
            "image_url": last_msg.image_url,
            "cursor_key": last_msg.cursor_key,
            "created_at": ensure_utc(last_msg.created_at),
        }
        if last_msg
        else None,
        "unread_count": unread_count,
        "is_muted": membership.is_muted,
    }


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/unread-counts")
async def unread_counts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    counts = await get_unread_counts_for_user(db, current_user.id)
    return {"counts": counts, "total_unread": sum(counts.values())}


@router.get("/search")
async def search_groups(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Discover groups by name that the current user is not an accepted member of."""
    accepted_conv_ids = select(ConversationMember.conversation_id).where(
        and_(
            ConversationMember.user_id == current_user.id,
            ConversationMember.status == "accepted",
            ConversationMember.deleted_at.is_(None),
        )
    )
    result = await db.execute(
        select(Conversation)
        .where(
            and_(
                Conversation.type == "group",
                Conversation.name.ilike(f"%{q}%"),
                ~Conversation.id.in_(accepted_conv_ids),
            )
        )
        .limit(20)
    )
    groups = result.scalars().all()
    items = []
    for g in groups:
        count_result = await db.execute(
            select(func.count())
            .select_from(ConversationMember)
            .where(
                and_(
                    ConversationMember.conversation_id == g.id,
                    ConversationMember.status == "accepted",
                )
            )
        )
        pending_result = await db.execute(
            select(ConversationMember).where(
                and_(
                    ConversationMember.conversation_id == g.id,
                    ConversationMember.user_id == current_user.id,
                    ConversationMember.status == "pending",
                )
            )
        )
        items.append({
            "id": g.id,
            "name": g.name,
            "description": g.description,
            "member_count": count_result.scalar() or 0,
            "join_status": "pending" if pending_result.scalar_one_or_none() else None,
        })
    return {"groups": items}


@router.get("")
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mem_result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.user_id == current_user.id,
                ConversationMember.deleted_at.is_(None),
                ConversationMember.status == "accepted",
            )
        )
    )
    memberships = mem_result.scalars().all()
    conv_ids = [m.conversation_id for m in memberships]
    if not conv_ids:
        return {"conversations": []}

    conv_result = await db.execute(select(Conversation).where(Conversation.id.in_(conv_ids)))
    conversations = {c.id: c for c in conv_result.scalars().all()}
    membership_map = {m.conversation_id: m for m in memberships}

    items = []
    for cid in conv_ids:
        conv = conversations.get(cid)
        if not conv:
            continue
        mem = membership_map.get(cid)
        if not mem:
            continue
        if not (conv.has_messages or (conv.type == "group" and mem.role == "admin")):
            continue
        item = await _build_list_item(db, conv, current_user, mem)
        if (
            mem.messages_hidden_before is not None
            and item["last_message"] is None
            and not (conv.type == "group" and mem.role == "admin")
        ):
            continue
        items.append(item)

    items.sort(
        key=lambda x: ensure_utc(
            x["last_message"]["created_at"] if x["last_message"] else None
        ),
        reverse=True,
    )
    return {"conversations": items}


@router.post("", status_code=201)
async def create_conversation(
    conv_in: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c_type = conv_in.get("type")

    # ── Direct ───────────────────────────────────────────────────────────────
    if c_type == "direct":
        participant_id_str = conv_in.get("participant_id")
        if not participant_id_str:
            raise HTTPException(status_code=400, detail="participant_id required for direct conversation")
        participant_id = UUID(str(participant_id_str))

        if await is_either_blocked(db, current_user.id, participant_id):
            raise HTTPException(status_code=403, detail="Cannot message this user")

        # Look for an existing shared direct conversation
        my_conv_ids = select(ConversationMember.conversation_id).where(
            and_(ConversationMember.user_id == current_user.id, ConversationMember.status == "accepted")
        )
        their_conv_ids = select(ConversationMember.conversation_id).where(
            and_(ConversationMember.user_id == participant_id, ConversationMember.status == "accepted")
        )
        existing_result = await db.execute(
            select(Conversation).where(
                and_(
                    Conversation.type == "direct",
                    Conversation.id.in_(my_conv_ids),
                    Conversation.id.in_(their_conv_ids),
                )
            )
        )
        existing_conv = existing_result.scalars().first()
        if existing_conv:
            # Resurface in list without restoring pre-deletion message history.
            mem_result = await db.execute(
                select(ConversationMember).where(
                    and_(
                        ConversationMember.conversation_id == existing_conv.id,
                        ConversationMember.user_id == current_user.id,
                    )
                )
            )
            mem = mem_result.scalar_one_or_none()
            if mem and mem.deleted_at is not None:
                mem.deleted_at = None
                await db.commit()
            return {"id": existing_conv.id, "type": existing_conv.type}

        conv = Conversation(type="direct", created_by=current_user.id)
        db.add(conv)
        await db.flush()
        db.add_all([
            ConversationMember(
                conversation_id=conv.id, user_id=current_user.id,
                role="member", status="accepted", color=MEMBER_COLORS[0],
            ),
            ConversationMember(
                conversation_id=conv.id, user_id=participant_id,
                role="member", status="accepted", color=MEMBER_COLORS[1],
            ),
        ])
        await db.commit()
        await db.refresh(conv)
        return {"id": conv.id, "type": conv.type}

    # ── Group ────────────────────────────────────────────────────────────────
    if c_type == "group":
        name = conv_in.get("name", "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="name required for group")
        description = conv_in.get("description")
        participant_ids_raw = conv_in.get("participant_ids") or []

        conv = Conversation(
            type="group",
            name=name,
            description=description,
            created_by=current_user.id,
        )
        db.add(conv)
        await db.flush()
        db.add(ConversationMember(
            conversation_id=conv.id, user_id=current_user.id,
            role="admin", status="accepted", color=MEMBER_COLORS[0],
        ))
        await db.commit()
        await db.refresh(conv)

        invited_users = []
        for pid_raw in participant_ids_raw:
            try:
                pid = UUID(str(pid_raw))
            except (ValueError, AttributeError):
                continue
            if pid == current_user.id:
                continue
            user_res = await db.execute(select(User).where(User.id == pid))
            target_user = user_res.scalar_one_or_none()
            if not target_user:
                continue
            db.add(ConversationMember(
                conversation_id=conv.id, user_id=pid,
                role="member", status="pending",
            ))
            invited_users.append(target_user)

        if invited_users:
            await db.commit()

        for target_user in invited_users:
            await create_notification(
                db,
                user_id=target_user.id,
                notif_type="group_invitation",
                title=f"Group invitation: {conv.name}",
                body=f"{current_user.username} invited you to join '{conv.name}'",
                data={
                    "group_id": str(conv.id),
                    "group_name": conv.name,
                    "from_user_id": str(current_user.id),
                    "from_username": current_user.username,
                },
            )
            await ws_manager.send_to_user(
                target_user.id,
                {
                    "type": "group_invitation",
                    "conversation_id": str(conv.id),
                    "group_name": conv.name,
                    "from_username": current_user.username,
                },
            )

        return {
            "id": conv.id, "type": conv.type,
            "name": conv.name, "description": conv.description,
            "created_at": conv.created_at,
        }

    raise HTTPException(status_code=400, detail="Invalid conversation type. Use 'direct' or 'group'.")


# ── Conversation-level actions ─────────────────────────────────────────────────

@router.post("/{conversation_id}/read")
async def mark_read(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await require_member(db, conversation_id, current_user)
    receipts = await process_mark_read(db, conversation_id, current_user.id)
    unread = await count_unread_in_conversation(
        db,
        conversation_id,
        current_user.id,
        messages_hidden_before=member.messages_hidden_before,
    )
    return {
        "marked_read": len(receipts),
        "unread_count": unread,
        "conversation_id": str(conversation_id),
    }


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete: removes the conversation from current user's list only."""
    result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == current_user.id,
                ConversationMember.deleted_at.is_(None),
            )
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Conversation not found")
    now = utcnow()
    member.deleted_at = now
    member.messages_hidden_before = now
    await db.commit()
    ws_manager.leave_conversation(current_user.id, conversation_id)
    await ws_manager.send_to_user(
        current_user.id, {"type": "conversation_deleted", "conversation_id": str(conversation_id)}
    )


@router.patch("/{conversation_id}")
async def update_conversation(
    conversation_id: UUID,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    admin = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == current_user.id,
                ConversationMember.role == "admin",
                ConversationMember.deleted_at.is_(None),
            )
        )
    )
    if not admin.scalars().first():
        raise HTTPException(status_code=403, detail="Admin access required")

    conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_result.scalar_one_or_none()
    if not conv or conv.type != "group":
        raise HTTPException(status_code=404, detail="Group not found")

    if "name" in body and body["name"]:
        conv.name = body["name"].strip()
    if "description" in body:
        conv.description = body["description"]
    await db.commit()
    await db.refresh(conv)
    return {"id": conv.id, "name": conv.name, "description": conv.description, "type": conv.type}


# ── Group details ──────────────────────────────────────────────────────────────

@router.get("/{conversation_id}/details")
async def get_group_details(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_member(db, conversation_id, current_user)
    conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    creator_result = await db.execute(select(User).where(User.id == conv.created_by))
    creator = creator_result.scalar_one_or_none()

    members_result = await db.execute(
        select(ConversationMember).where(
            and_(ConversationMember.conversation_id == conversation_id, ConversationMember.status == "accepted")
        )
    )
    members = members_result.scalars().all()
    users_map = {}
    if user_ids := [m.user_id for m in members]:
        u_res = await db.execute(select(User).where(User.id.in_(user_ids)))
        users_map = {u.id: u for u in u_res.scalars().all()}

    contacts_result = await db.execute(
        select(Contact.contact_user_id).where(Contact.owner_id == current_user.id)
    )
    contact_ids = set(contacts_result.scalars().all())

    member_details = [
        {
            "user_id": u.id,
            "username": u.username,
            "avatar_url": u.avatar_url,
            "role": m.role,
            "status": m.status,
            "color": m.color,
            "joined_at": m.joined_at,
            "is_contact": m.user_id in contact_ids or m.user_id == current_user.id,
        }
        for m in members
        if (u := users_map.get(m.user_id))
    ]

    return {
        "id": conv.id,
        "name": conv.name,
        "description": conv.description,
        "creator_username": creator.username if creator else "unknown",
        "created_at": conv.created_at,
        "member_count": len(member_details),
        "members": member_details,
    }


# ── Invitations ────────────────────────────────────────────────────────────────

@router.post("/{conversation_id}/invite", status_code=201)
async def invite_members(
    conversation_id: UUID,
    invite: GroupInviteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    admin = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == current_user.id,
                ConversationMember.role == "admin",
                ConversationMember.deleted_at.is_(None),
            )
        )
    )
    if not admin.scalars().first():
        raise HTTPException(status_code=403, detail="Admin access required")

    conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_result.scalar_one_or_none()
    if not conv or conv.type != "group":
        raise HTTPException(status_code=404, detail="Group not found")

    count_result = await db.execute(
        select(func.count()).select_from(ConversationMember).where(
            and_(ConversationMember.conversation_id == conversation_id, ConversationMember.status != "rejected")
        )
    )
    if (count_result.scalar() or 0) + len(invite.user_ids) > 50:
        raise HTTPException(status_code=400, detail="Invitations would exceed group capacity (50)")

    invited: list[User] = []
    for uid in invite.user_ids:
        existing = await db.execute(
            select(ConversationMember).where(
                and_(ConversationMember.conversation_id == conversation_id, ConversationMember.user_id == uid)
            )
        )
        if existing.scalars().first():
            continue
        user_result = await db.execute(select(User).where(User.id == uid))
        target = user_result.scalar_one_or_none()
        if not target:
            continue
        db.add(ConversationMember(
            conversation_id=conversation_id, user_id=uid, role="member", status="pending"
        ))
        invited.append(target)

    await db.commit()

    for target in invited:
        await create_notification(
            db, user_id=target.id, notif_type="group_invitation",
            title=f"Group invitation: {conv.name}",
            body=f"{current_user.username} invited you to join '{conv.name}'",
            data={"group_id": str(conversation_id), "group_name": conv.name,
                  "from_user_id": str(current_user.id), "from_username": current_user.username},
        )
        await ws_manager.send_to_user(
            target.id,
            {"type": "group_invitation", "conversation_id": str(conversation_id),
             "group_name": conv.name, "from_username": current_user.username},
        )

    return {"detail": f"Invited {len(invited)} user(s)", "invited_count": len(invited)}


@router.post("/{conversation_id}/invite/accept")
async def accept_invitation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == current_user.id,
                ConversationMember.status == "pending",
            )
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Invitation not found")

    color = await _pick_color(db, conversation_id)
    member.status = "accepted"
    member.color = color
    await db.commit()

    conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_result.scalar_one_or_none()

    admin_result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.role == "admin",
                ConversationMember.status == "accepted",
            )
        )
    )
    for admin in admin_result.scalars().all():
        await create_notification(
            db, user_id=admin.user_id, notif_type="invitation_accepted",
            title="Invitation accepted",
            body=f"{current_user.username} accepted your invitation to '{conv.name if conv else 'group'}'",
            data={"group_id": str(conversation_id), "from_user_id": str(current_user.id),
                  "from_username": current_user.username},
        )

    return {"detail": "Invitation accepted", "color": color}


@router.post("/{conversation_id}/invite/reject")
async def reject_invitation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == current_user.id,
                ConversationMember.status == "pending",
            )
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Invitation not found")
    member.status = "rejected"
    await db.commit()

    conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_result.scalar_one_or_none()
    admin_result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.role == "admin",
                ConversationMember.status == "accepted",
            )
        )
    )
    for admin in admin_result.scalars().all():
        await create_notification(
            db, user_id=admin.user_id, notif_type="invitation_rejected",
            title="Invitation rejected",
            body=f"{current_user.username} declined your invitation to '{conv.name if conv else 'group'}'",
            data={"group_id": str(conversation_id), "from_user_id": str(current_user.id),
                  "from_username": current_user.username},
        )

    return {"detail": "Invitation rejected"}


@router.post("/{conversation_id}/join-request", status_code=201)
async def request_join_group(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Request to join a group. Creates a pending membership and notifies admins."""
    conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_result.scalar_one_or_none()
    if not conv or conv.type != "group":
        raise HTTPException(status_code=404, detail="Group not found")

    existing = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == current_user.id,
            )
        )
    )
    member = existing.scalar_one_or_none()
    if member:
        if member.status == "accepted" and member.deleted_at is None:
            raise HTTPException(status_code=409, detail="Already a member")
        if member.status == "pending":
            raise HTTPException(status_code=409, detail="Join request already pending")
        member.status = "pending"
        member.deleted_at = None
    else:
        db.add(ConversationMember(
            conversation_id=conversation_id,
            user_id=current_user.id,
            role="member",
            status="pending",
        ))
    await db.commit()

    admin_result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.role == "admin",
                ConversationMember.status == "accepted",
            )
        )
    )
    for admin in admin_result.scalars().all():
        await create_notification(
            db,
            user_id=admin.user_id,
            notif_type="join_request",
            title="Join request",
            body=f"{current_user.username} requested to join '{conv.name}'",
            data={
                "group_id": str(conversation_id),
                "group_name": conv.name,
                "from_user_id": str(current_user.id),
                "from_username": current_user.username,
            },
        )
        await ws_manager.send_to_user(
            admin.user_id,
            {
                "type": "join_request",
                "conversation_id": str(conversation_id),
                "group_name": conv.name,
                "from_user_id": str(current_user.id),
                "from_username": current_user.username,
            },
        )

    return {"detail": "Join request sent"}


@router.post("/{conversation_id}/leave")
async def leave_group(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Leave a group voluntarily (removes membership)."""
    conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_result.scalar_one_or_none()
    if not conv or conv.type != "group":
        raise HTTPException(status_code=400, detail="Leave is only for group conversations")

    result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == current_user.id,
                ConversationMember.status == "accepted",
            )
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Not a group member")

    if member.role == "admin":
        admin_count = await db.execute(
            select(func.count())
            .select_from(ConversationMember)
            .where(
                and_(
                    ConversationMember.conversation_id == conversation_id,
                    ConversationMember.role == "admin",
                    ConversationMember.status == "accepted",
                )
            )
        )
        if (admin_count.scalar() or 0) <= 1:
            other = await db.execute(
                select(ConversationMember).where(
                    and_(
                        ConversationMember.conversation_id == conversation_id,
                        ConversationMember.user_id != current_user.id,
                        ConversationMember.status == "accepted",
                    )
                )
                .limit(1)
            )
            successor = other.scalar_one_or_none()
            if successor:
                successor.role = "admin"

    await db.delete(member)
    await db.commit()
    ws_manager.leave_conversation(current_user.id, conversation_id)
    await ws_manager.broadcast_to_conversation(
        conversation_id,
        {
            "type": "member_left",
            "conversation_id": str(conversation_id),
            "user_id": str(current_user.id),
            "username": current_user.username,
        },
    )
    await ws_manager.send_to_user(
        current_user.id,
        {"type": "conversation_deleted", "conversation_id": str(conversation_id)},
    )
    return {"detail": "Left group"}


@router.get("/{conversation_id}/pending-invitations")
async def pending_invitations(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    admin = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == current_user.id,
                ConversationMember.role == "admin",
            )
        )
    )
    if not admin.scalars().first():
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.role == "member",
                ConversationMember.status == "pending",
            )
        )
    )
    members = result.scalars().all()
    user_ids = [m.user_id for m in members]
    users_map: dict = {}
    if user_ids:
        u_res = await db.execute(select(User).where(User.id.in_(user_ids)))
        users_map = {u.id: u for u in u_res.scalars().all()}

    return {
        "invitations": [
            {
                "user_id": m.user_id,
                "username": users_map[m.user_id].username if m.user_id in users_map else "unknown",
                "status": m.status,
            }
            for m in members
        ]
    }


# ── Member management ──────────────────────────────────────────────────────────

@router.post("/{conversation_id}/members", status_code=201)
async def add_member(
    conversation_id: UUID,
    member_in: MemberAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Direct-add without invitation flow (admin only)."""
    admin = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == current_user.id,
                ConversationMember.role == "admin",
                ConversationMember.deleted_at.is_(None),
            )
        )
    )
    if not admin.scalars().first():
        raise HTTPException(status_code=403, detail="Admin access required")

    count_result = await db.execute(
        select(func.count()).select_from(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.deleted_at.is_(None),
            )
        )
    )
    if (count_result.scalar() or 0) >= 50:
        raise HTTPException(status_code=400, detail="Group is at capacity (50 members)")

    existing = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == member_in.user_id,
            )
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="User already in group or pending")

    color = await _pick_color(db, conversation_id)
    db.add(ConversationMember(
        conversation_id=conversation_id, user_id=member_in.user_id,
        role="member", status="accepted", color=color,
    ))
    await db.commit()
    return {"detail": "Member added"}


@router.delete("/{conversation_id}/members/{user_id}", status_code=204)
async def remove_member(
    conversation_id: UUID,
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    admin = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == current_user.id,
                ConversationMember.role == "admin",
                ConversationMember.deleted_at.is_(None),
            )
        )
    )
    if not admin.scalars().first():
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user_id,
            )
        )
    )
    if member := result.scalar_one_or_none():
        await db.delete(member)
        await db.commit()


# ── Preferences & media ────────────────────────────────────────────────────────

@router.patch("/{conversation_id}/preferences")
async def update_conversation_preferences(
    conversation_id: UUID,
    prefs: ConversationPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await require_member(db, conversation_id, current_user)
    member.is_muted = prefs.is_muted
    await db.commit()
    return {"conversation_id": str(conversation_id), "is_muted": member.is_muted}


@router.get("/{conversation_id}/media", response_model=MediaHistoryOut)
async def get_conversation_media(
    conversation_id: UUID,
    limit: int = Query(30, ge=1, le=50),
    before: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await require_member(db, conversation_id, current_user)

    query = select(Message).where(
        and_(
            Message.conversation_id == conversation_id,
            Message.image_url.isnot(None),
            Message.image_url != "",
        )
    )
    query = apply_message_visibility(query, member)
    if before:
        query = query.where(Message.cursor_key < before)
    query = query.order_by(desc(Message.cursor_key)).limit(limit + 1)

    result = await db.execute(query)
    messages = list(result.scalars().all())

    has_more = len(messages) > limit
    page = messages[:limit]

    sender_ids = list({m.sender_id for m in page})
    users_map: dict = {}
    if sender_ids:
        u_res = await db.execute(select(User).where(User.id.in_(sender_ids)))
        users_map = {u.id: u for u in u_res.scalars().all()}

    media_items: list[MediaItemOut] = []
    for m in page:
        u = users_map.get(m.sender_id)
        media_items.append(
            MediaItemOut(
                id=m.id,
                image_url=m.image_url,
                created_at=m.created_at,
                sender={
                    "id": u.id,
                    "username": u.username,
                    "avatar_url": u.avatar_url,
                }
                if u
                else {"id": m.sender_id, "username": "unknown", "avatar_url": None},
            )
        )

    next_cursor = page[-1].cursor_key if page and has_more else None
    return MediaHistoryOut(
        media=media_items,
        pagination={"next_cursor": next_cursor, "prev_cursor": None, "has_more": has_more},
    )


# ── Message history ────────────────────────────────────────────────────────────

@router.get("/{conversation_id}/messages", response_model=MessageHistoryOut)
async def get_messages(
    conversation_id: UUID,
    limit: int = Query(30, ge=1, le=50),
    before: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await require_member(db, conversation_id, current_user)

    query = select(Message).where(Message.conversation_id == conversation_id)
    query = apply_message_visibility(query, member)
    if before:
        query = query.where(Message.cursor_key < before)
    query = query.order_by(desc(Message.cursor_key)).limit(limit + 1)

    result = await db.execute(query)
    messages = list(result.scalars().all())

    has_more = len(messages) > limit
    messages_page = messages[:limit]

    sender_ids = list({m.sender_id for m in messages_page})
    users_map: dict = {}
    if sender_ids:
        u_res = await db.execute(select(User).where(User.id.in_(sender_ids)))
        users_map = {u.id: u for u in u_res.scalars().all()}

    msg_ids = [m.id for m in messages_page]
    receipts_map = await get_receipts_for_messages(db, msg_ids)

    response_messages: list[MessageOut] = []
    for m in messages_page:
        u = users_map.get(m.sender_id)
        recs = receipts_map.get(m.id, [])
        status = (
            aggregate_status_for_sender(recs, current_user.id)
            if m.sender_id == current_user.id
            else None
        )
        response_messages.append(
            MessageOut(
                id=m.id,
                sender={
                    "id": u.id, "username": u.username, "avatar_url": u.avatar_url
                } if u else {"id": m.sender_id, "username": "unknown", "avatar_url": None},
                body=m.body,
                image_url=m.image_url,
                cursor_key=m.cursor_key,
                created_at=m.created_at,
                edited_at=m.edited_at,
                status=status,
                receipts=[
                    {"recipient_id": r.recipient_id, "status": status_upper(r.status), "updated_at": r.updated_at}
                    for r in recs
                ],
            )
        )

    next_cursor = messages_page[-1].cursor_key if messages_page and has_more else None
    prev_cursor = messages_page[0].cursor_key if messages_page else None

    return MessageHistoryOut(
        messages=response_messages,
        pagination=PaginationOut(next_cursor=next_cursor, prev_cursor=prev_cursor, has_more=has_more),
    )
