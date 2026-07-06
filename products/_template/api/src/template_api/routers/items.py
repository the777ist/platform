from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from ..auth import CurrentUser
from ..pagination import DEFAULT_LIMIT, Page
from ..schemas.common import Problem
from ..schemas.item import ItemCreate, ItemRead, ItemUpdate
from ..services.item_service import ItemService

router = APIRouter(
    prefix="/v1/items",
    tags=["items"],
    responses={404: {"model": Problem}, 401: {"model": Problem}},
)

# Annotated dependency (FastAPI-recommended; a bare `= Depends()` default violates ruff B008).
ItemSvc = Annotated[ItemService, Depends()]


@router.get("", response_model=Page[ItemRead])
def list_items(
    user: CurrentUser,
    svc: ItemSvc,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> Page[ItemRead]:
    return svc.list(owner_id=user.id, cursor=cursor, limit=limit)


@router.post("", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
async def create_item(user: CurrentUser, data: ItemCreate, svc: ItemSvc) -> ItemRead:
    return await svc.create(owner_id=user.id, data=data)


@router.get("/{item_id}", response_model=ItemRead)
def get_item(user: CurrentUser, item_id: UUID, svc: ItemSvc) -> ItemRead:
    return svc.get(owner_id=user.id, item_id=item_id)


@router.patch("/{item_id}", response_model=ItemRead)
async def update_item(user: CurrentUser, item_id: UUID, data: ItemUpdate, svc: ItemSvc) -> ItemRead:
    return await svc.update(owner_id=user.id, item_id=item_id, data=data)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(user: CurrentUser, item_id: UUID, svc: ItemSvc) -> None:
    await svc.delete(owner_id=user.id, item_id=item_id)
