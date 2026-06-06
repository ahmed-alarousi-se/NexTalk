from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from typing import Optional, List
from .user import UserSearchOut


class ConversationCreateGroup(BaseModel):
    type: str = "group"
    name: str
    description: Optional[str] = None
    participant_ids: List[UUID] = []


class ConversationCreateDirect(BaseModel):
    type: str = "direct"
    participant_id: UUID


class GroupInviteCreate(BaseModel):
    user_ids: List[UUID]


class ConversationMemberOut(BaseModel):
    id: UUID
    username: str
    role: str
    status: str
    color: Optional[str] = None
    joined_at: datetime

    class Config:
        from_attributes = True


class GroupMemberDetailOut(BaseModel):
    user_id: UUID
    username: str
    role: str
    status: str
    color: Optional[str] = None
    joined_at: datetime
    is_contact: bool = False

    class Config:
        from_attributes = True


class GroupDetailsOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    creator_username: str
    created_at: datetime
    member_count: int
    members: List[GroupMemberDetailOut]


class ConversationOut(BaseModel):
    id: UUID
    type: str
    name: Optional[str] = None
    description: Optional[str] = None
    created_by: UUID
    members: Optional[List[ConversationMemberOut]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationListOut(BaseModel):
    id: UUID
    type: str
    name: Optional[str] = None
    other_user: Optional[UserSearchOut] = None
    last_message: Optional[dict] = None
    unread_count: int = 0

    class Config:
        from_attributes = True


class MemberAdd(BaseModel):
    user_id: UUID
