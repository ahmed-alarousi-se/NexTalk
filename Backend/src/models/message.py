import uuid
from sqlalchemy import Column, String, Text, ForeignKey, Index, UniqueConstraint
from src.db.types import UTCDateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from src.db.base_class import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    body = Column(Text, nullable=True)  # nullable when image-only or call log message
    image_url = Column(String(1000), nullable=True)  # optional image attachment
    message_type = Column(String(10), nullable=False, default="text")  # text | call
    call_log = Column(JSONB, nullable=True)
    cursor_key = Column(String(26), unique=True, nullable=False)  # ULID
    created_at = Column(UTCDateTime, nullable=False, server_default=func.now())
    edited_at = Column(UTCDateTime, nullable=True)

    __table_args__ = (
        Index('idx_messages_conv_cursor', 'conversation_id', 'cursor_key'),
    )


class MessageReceipt(Base):
    __tablename__ = "message_receipts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    recipient_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(10), nullable=False, default="sent")  # 'sent', 'delivered', 'read'
    updated_at = Column(UTCDateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('message_id', 'recipient_id', name='uq_receipt_pair'),
        Index('idx_receipts_recipient_status', 'recipient_id', 'status'),
        Index('idx_receipts_recipient_msg', 'recipient_id', 'message_id'),
    )
