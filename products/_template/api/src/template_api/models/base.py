from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func
from sqlmodel import DateTime, Field, SQLModel
from uuid_utils import uuid7  # maintained UUIDv7 generator (returns a stdlib-compatible UUID)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _uuid7() -> UUID:
    # uuid_utils returns its own UUID type; coerce to stdlib uuid.UUID so the
    # stdlib-UUID-typed column + Pydantic strict mode accept it (guide ⚠️ REVIEW resolved).
    return UUID(str(uuid7()))


class UUIDModel(SQLModel):
    """Shared base: UUIDv7 primary key + created/updated timestamps. Persistence only.

    NOTE: a concrete `sa_column=Column(...)` is FORBIDDEN in a shared mixin — a Column
    object binds to exactly ONE Table, so the second inheriting model raises
    "Column object 'created_at' already assigned to Table 'item'". `sa_type` +
    `sa_column_kwargs` construct a fresh Column per subclass (mixin-safe form).
    """

    id: UUID = Field(default_factory=_uuid7, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_type=DateTime(timezone=True),  # pyright: ignore[reportArgumentType]  (instance OK)
        sa_column_kwargs={"server_default": func.now()},
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_type=DateTime(timezone=True),  # pyright: ignore[reportArgumentType]  (instance OK)
        sa_column_kwargs={"server_default": func.now(), "onupdate": func.now()},
    )
