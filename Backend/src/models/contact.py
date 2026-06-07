import uuid
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    String,
    Index,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from src.db.base_class import Base


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    owner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    contact_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        # Prevent duplicate contact relations (A->B duplicates)
        UniqueConstraint(
            "owner_id",
            "contact_user_id",
            name="uq_contacts_owner_contact",
        ),

        # Fast lookup of a user's contacts
        Index("idx_contacts_owner_id", "owner_id"),

        # Optional reverse lookup optimization
        Index("idx_contacts_contact_user_id", "contact_user_id"),
    )


class MessageRequest(Base):
    __tablename__ = "message_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    from_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    to_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    status = Column(String(20), nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        # One request per pair (prevents spam duplicates)
        UniqueConstraint(
            "from_user_id",
            "to_user_id",
            name="uq_message_request_pair",
        ),

        # Fast inbox query
        Index(
            "idx_message_requests_to_status",
            "to_user_id",
            "status",
        ),

        # Fast sent requests lookup
        Index(
            "idx_message_requests_from_user",
            "from_user_id",
        ),

        # Optional: optimize pending filtering at DB level (PostgreSQL only)
        Index(
            "idx_message_requests_pending_only",
            "to_user_id",
            postgresql_where=text("status = 'pending'"),
        ),
    )
