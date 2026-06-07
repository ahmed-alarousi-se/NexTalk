from pydantic import BaseModel, Field


class SyncUserRequest(BaseModel):
    username: str | None = Field(default=None, min_length=2, max_length=50)
