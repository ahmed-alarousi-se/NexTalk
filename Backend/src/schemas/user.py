from pydantic import BaseModel, EmailStr
from datetime import datetime
from uuid import UUID
from typing import Optional


class UserBase(BaseModel):
    username: str
    email: EmailStr


class UserUpdate(BaseModel):
    avatar_url: Optional[str] = None
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    show_last_seen: Optional[bool] = None
    read_receipts_enabled: Optional[bool] = None


class UserOut(UserBase):
    id: UUID
    avatar_url: Optional[str] = None
    auth_provider: str = "password"
    created_at: datetime
    last_seen: Optional[datetime] = None
    show_last_seen: bool = True
    read_receipts_enabled: bool = True


class BlockedUserOut(BaseModel):
    user_id: UUID
    username: str
    avatar_url: Optional[str] = None
    blocked_at: datetime

    class Config:
        from_attributes = True


class UserSearchOut(BaseModel):
    id: UUID
    username: str
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True
