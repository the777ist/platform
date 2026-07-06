from uuid import UUID

from .common import StrictDTO


class PushTokenCreate(StrictDTO):
    device_id: str
    expo_token: str


class PushTokenRead(StrictDTO):
    id: UUID
    device_id: str
    expo_token: str
