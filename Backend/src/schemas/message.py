from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from uuid import UUID
from typing import Optional, List, Any
from .user import UserSearchOut


class MessageReceiptOut(BaseModel):
    recipient_id: UUID
    status: str
    updated_at: datetime

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: UUID
    sender: UserSearchOut
    body: Optional[str] = None
    image_url: Optional[str] = None
    message_type: str = "text"
    call_log: Optional[dict[str, Any]] = None
    cursor_key: str
    created_at: datetime
    edited_at: Optional[datetime] = None
    receipts: List[MessageReceiptOut] = []
    status: Optional[str] = None

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    conversation_id: UUID
    body: Optional[str] = Field(default=None, max_length=10000)
    image_url: Optional[str] = None

    @field_validator("body")
    @classmethod
    def strip_body(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        s = v.strip()
        return s if s else None


class MessageUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)

    @field_validator("body")
    @classmethod
    def strip_body(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("body cannot be empty")
        return s


class MarkReadBody(BaseModel):
    message_id: Optional[UUID] = None


class PaginationOut(BaseModel):
    next_cursor: Optional[str] = None
    prev_cursor: Optional[str] = None
    has_more: bool


class MessageHistoryOut(BaseModel):
    messages: List[MessageOut]
    pagination: PaginationOut
