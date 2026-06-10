import uuid

from sqlalchemy import Column, ForeignKey, UniqueConstraint
from src.db.types import UTCDateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from src.db.base_class import Base


class UserBlock(Base):
    __tablename__ = "user_blocks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blocker_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    blocked_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(UTCDateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id", name="uq_user_block_pair"),
    )
