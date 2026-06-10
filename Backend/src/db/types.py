from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator

from src.utils.datetime import ensure_utc

UTC = timezone.utc


class UTCDateTime(TypeDecorator):
    """Persist and load all datetimes as UTC-aware."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        return ensure_utc(value)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        return ensure_utc(value)
