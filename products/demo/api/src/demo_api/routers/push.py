from typing import Annotated

from fastapi import APIRouter, Depends, status

from ..auth import CurrentUser
from ..schemas.push import PushTokenCreate, PushTokenRead
from ..services.push_service import PushService

router = APIRouter(prefix="/v1/push-tokens", tags=["push"])

# Annotated dependency (FastAPI-recommended; a bare `= Depends()` default violates ruff B008).
PushSvc = Annotated[PushService, Depends()]


@router.post("", response_model=PushTokenRead, status_code=status.HTTP_201_CREATED)
def register_token(user: CurrentUser, data: PushTokenCreate, svc: PushSvc) -> PushTokenRead:
    return svc.register(user_id=user.id, data=data)
