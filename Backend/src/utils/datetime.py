from datetime import datetime, timezone

UTC = timezone.utc
UTC_MIN = datetime.min.replace(tzinfo=UTC)


def utcnow() -> datetime:
    """Return current UTC time as a timezone-aware datetime."""
    return datetime.now(UTC)


def ensure_utc(dt: datetime | None) -> datetime:
    """Normalize datetimes for safe comparison (handles legacy naive DB values)."""
    if dt is None:
        return UTC_MIN
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)
