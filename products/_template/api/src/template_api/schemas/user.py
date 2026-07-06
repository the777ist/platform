from .common import StrictDTO


class MeRead(StrictDTO):
    id: str
    email: str | None = None
