from fastapi import APIRouter

from ..auth import CurrentUser
from ..schemas.user import MeRead

router = APIRouter(prefix="/v1", tags=["me"])


@router.get("/me", response_model=MeRead)
def me(user: CurrentUser) -> MeRead:
    return user
