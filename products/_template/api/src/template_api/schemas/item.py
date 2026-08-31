from datetime import datetime
from uuid import UUID

from pydantic import Field

from .common import StrictDTO

# The caps MUST mirror models/item.py's Field(max_length=...) -> VARCHAR(n). Without them
# an over-long string passes Pydantic strict, reaches Postgres, and returns as a bare
# text/plain HTTP 500 (StringDataRightTruncation) instead of the locked RFC 9457
# problem+json — the same defect class as an unparseable cursor. Validate at the edge.
TITLE_MAX_LENGTH = 200
DESCRIPTION_MAX_LENGTH = 2000


class ItemCreate(StrictDTO):
    title: str = Field(max_length=TITLE_MAX_LENGTH)
    description: str | None = Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)


class ItemUpdate(StrictDTO):
    title: str | None = Field(default=None, max_length=TITLE_MAX_LENGTH)
    description: str | None = Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)


class ItemRead(StrictDTO):
    id: UUID
    title: str
    description: str | None
    owner_id: str
    created_at: datetime
    updated_at: datetime
