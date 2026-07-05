from datetime import datetime
from uuid import UUID

from .common import StrictDTO


class ItemCreate(StrictDTO):
    title: str
    description: str | None = None


class ItemUpdate(StrictDTO):
    title: str | None = None
    description: str | None = None


class ItemRead(StrictDTO):
    id: UUID
    title: str
    description: str | None
    owner_id: str
    created_at: datetime
    updated_at: datetime
