from sqlmodel import Field, UniqueConstraint

from .base import UUIDModel


class PushToken(UUIDModel, table=True):
    __tablename__ = "push_token"  # pyright: ignore[reportAssignmentType]  (SQLModel friction)
    __table_args__ = (UniqueConstraint("user_id", "device_id", name="uq_push_user_device"),)

    user_id: str = Field(index=True)  # Supabase auth user id
    device_id: str = Field(max_length=200)  # per-device identity
    expo_token: str = Field(max_length=255)  # ExponentPushToken[...]
