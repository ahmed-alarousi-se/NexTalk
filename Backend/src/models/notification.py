import uuid
from sqlalchemy import Column, String, ForeignKey, Index
from src.db.types import UTCDateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from src.db.base_class import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(50), nullable=False)   # group_invitation, contact_request, invitation_accepted, invitation_rejected, system
    title = Column(String(255), nullable=False)
    body = Column(String(1000), nullable=False, default="")
    data = Column(JSONB, nullable=True)          # extra context e.g. {group_id, from_user_id}
    read_at = Column(UTCDateTime, nullable=True)    # null = unread
    created_at = Column(UTCDateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        Index('idx_notifications_user_read', 'user_id', 'read_at'),
    )
