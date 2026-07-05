from sqlmodel import Field

from .base import UUIDModel


class Item(UUIDModel, table=True):
    # SQLModel types __tablename__ as declared_attr — a plain str literal is correct at
    # runtime but needs the ignore under pyright strict (known SQLModel typing friction).
    __tablename__ = "item"  # pyright: ignore[reportAssignmentType]

    title: str = Field(index=True, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    owner_id: str = Field(index=True)  # Supabase auth user id (sub claim)
