from uuid import UUID

from sqlmodel import col, select

from ..errors import ProblemException
from ..models import Item
from ..pagination import Page, clamp_limit, decode_cursor, encode_cursor
from ..schemas.item import ItemCreate, ItemRead, ItemUpdate
from .base import BaseService
from .realtime import broadcast_invalidate


class ItemService(BaseService):
    def list(self, *, owner_id: str, cursor: str | None, limit: int) -> Page[ItemRead]:
        limit = clamp_limit(limit)
        after = decode_cursor(cursor)
        # col() gives the typed column expression (a bare Item.id types as UUID under
        # pyright strict — SQLModel's documented helper for exactly this).
        stmt = select(Item).where(Item.owner_id == owner_id).order_by(col(Item.id))
        if after is not None:
            stmt = stmt.where(col(Item.id) > UUID(after))
        rows = self.session.exec(stmt.limit(limit + 1)).all()
        has_more = len(rows) > limit
        page = rows[:limit]
        next_cursor = encode_cursor(str(page[-1].id)) if has_more and page else None
        # DTO mapping — ORM models never cross the HTTP boundary.
        return Page(items=[ItemRead.model_validate(r) for r in page], next_cursor=next_cursor)

    def get(self, *, owner_id: str, item_id: UUID) -> ItemRead:
        return ItemRead.model_validate(self._require(owner_id, item_id))

    async def create(self, *, owner_id: str, data: ItemCreate) -> ItemRead:
        item = Item(owner_id=owner_id, title=data.title, description=data.description)
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        # Broadcast-only realtime (PHILOSOPHY): AFTER the commit, tell clients on the
        # per-product channel to refetch through the API. Never blocks the write.
        await broadcast_invalidate("items")
        return ItemRead.model_validate(item)

    async def update(self, *, owner_id: str, item_id: UUID, data: ItemUpdate) -> ItemRead:
        item = self._require(owner_id, item_id)
        if data.title is not None:
            item.title = data.title
        if data.description is not None:
            item.description = data.description
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        await broadcast_invalidate("items")
        return ItemRead.model_validate(item)

    async def delete(self, *, owner_id: str, item_id: UUID) -> None:
        self.session.delete(self._require(owner_id, item_id))
        self.session.commit()
        await broadcast_invalidate("items")

    def _require(self, owner_id: str, item_id: UUID) -> Item:
        item = self.session.get(Item, item_id)
        if item is None or item.owner_id != owner_id:
            raise ProblemException(status=404, title="Item not found")
        return item
