from pydantic import BaseModel, EmailStr
from datetime import datetime
from uuid import UUID
from typing import Optional


class UserBase(BaseModel):
    username: str
    email: EmailStr


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    avatar_url: Optional[str] = None
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    new_password: Optional[str] = None
    current_password: Optional[str] = None  # required when changing password


class UserOut(UserBase):
    id: UUID
    avatar_url: Optional[str] = None
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
