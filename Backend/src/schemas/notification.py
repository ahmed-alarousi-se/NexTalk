from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from typing import Optional, Any


class NotificationOut(BaseModel):
    id: UUID
    type: str
    title: str
    body: str
    data: Optional[Any] = None
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
