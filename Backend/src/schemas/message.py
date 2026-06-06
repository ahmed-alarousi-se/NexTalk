from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional, List
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
    cursor_key: str
    created_at: datetime
    receipts: List[MessageReceiptOut] = []
    status: Optional[str] = None

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    conversation_id: UUID
    body: str = Field(min_length=1, max_length=10000)


class MarkReadBody(BaseModel):
    message_id: Optional[UUID] = None


class PaginationOut(BaseModel):
    next_cursor: Optional[str] = None
    prev_cursor: Optional[str] = None
    has_more: bool


class MessageHistoryOut(BaseModel):
    messages: List[MessageOut]
    pagination: PaginationOut
