from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from .user import UserSearchOut


class ContactCreate(BaseModel):
    username: str


class ContactOut(BaseModel):
    id: UUID
    user: UserSearchOut
    added_at: datetime

    class Config:
        from_attributes = True


class MessageRequestOut(BaseModel):
    id: UUID
    from_user: UserSearchOut
    created_at: datetime

    class Config:
        from_attributes = True
