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


class WsEditMessage(BaseModel):
    type: Literal["edit_message"]
    message_id: UUID
    body: str = Field(min_length=1, max_length=10000)


class WsPing(BaseModel):
    type: Literal["ping"]


class WsCallInvite(BaseModel):
    type: Literal["call_invite"]
    call_id: UUID
    to_user_id: UUID
    conversation_id: UUID
    call_type: Literal["audio", "video"]


class WsCallAccept(BaseModel):
    type: Literal["call_accept"]
    call_id: UUID


class WsCallReject(BaseModel):
    type: Literal["call_reject"]
    call_id: UUID


class WsCallEnd(BaseModel):
    type: Literal["call_end"]
    call_id: UUID


class WsCallOffer(BaseModel):
    type: Literal["call_offer"]
    call_id: UUID
    sdp: dict


class WsCallAnswer(BaseModel):
    type: Literal["call_answer"]
    call_id: UUID
    sdp: dict


class WsIceCandidate(BaseModel):
    type: Literal["ice_candidate"]
    call_id: UUID
    candidate: dict
