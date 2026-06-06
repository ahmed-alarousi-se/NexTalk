import uuid
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index, UniqueConstraint, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from src.db.base_class import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type = Column(String(10), nullable=False)  # 'direct' or 'group'
    name = Column(String(100), nullable=True)
    description = Column(String(500), nullable=True)  # group description / purpose
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    max_members = Column(Integer, nullable=False, default=50)
    has_messages = Column(Boolean, nullable=False, default=False)  # true once first message sent
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class ConversationMember(Base):
    __tablename__ = "conversation_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role = Column(String(10), nullable=False, default="member")  # 'admin' or 'member'
    # invitation status: 'pending' | 'accepted' | 'rejected'
    # admin/creator always 'accepted'; invited users start 'pending'
    status = Column(String(10), nullable=False, default="accepted")
    color = Column(String(7), nullable=True)  # hex color like #4f8ef7
    joined_at = Column(DateTime, nullable=False, server_default=func.now())
    last_read_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint('conversation_id', 'user_id', name='uq_conv_member'),
        Index('idx_conv_members_conv_user', 'conversation_id', 'user_id'),
    )
