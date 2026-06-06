from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class WsSendMessage(BaseModel):
    type: Literal["send_message"]
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


class WsTyping(BaseModel):
    type: Literal["typing"]
    conversation_id: UUID
    is_typing: bool = True


class WsJoinConversation(BaseModel):
    type: Literal["join_conversation"]
    conversation_id: UUID


class WsLeaveConversation(BaseModel):
    type: Literal["leave_conversation"]
    conversation_id: UUID


class WsMarkRead(BaseModel):
    type: Literal["mark_read"]
    conversation_id: UUID


class WsPing(BaseModel):
    type: Literal["ping"]
