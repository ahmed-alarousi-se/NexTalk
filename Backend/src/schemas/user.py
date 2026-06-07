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


class UserOut(UserBase):
    id: UUID
    avatar_url: Optional[str] = None
    auth_provider: str = "password"
    created_at: datetime
    last_seen: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserSearchOut(BaseModel):
    id: UUID
    username: str
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True
