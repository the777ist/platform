from datetime import UTC, datetime, timedelta
from typing import Any, cast

import httpx
from sqlalchemy import CursorResult
from sqlmodel import col, delete, select

from ..models import PushToken
from ..schemas.push import PushTokenCreate, PushTokenRead
from ..settings import get_settings
from .base import BaseService


class PushService(BaseService):
    def register(self, *, user_id: str, data: PushTokenCreate) -> PushTokenRead:
        existing = self.session.exec(
            select(PushToken).where(
                PushToken.user_id == user_id, PushToken.device_id == data.device_id
            )
        ).first()
        if existing is None:
            existing = PushToken(
                user_id=user_id, device_id=data.device_id, expo_token=data.expo_token
            )
        else:
            existing.expo_token = data.expo_token
        self.session.add(existing)
        self.session.commit()
        self.session.refresh(existing)
        return PushTokenRead.model_validate(existing)

    async def send_push(
        self, *, user_id: str, title: str, body: str, http: httpx.AsyncClient | None = None
    ) -> None:
        # A scalar-column select via .exec() is fine (only delete()/update() are unsupported).
        tokens = self.session.exec(
            select(PushToken.expo_token).where(PushToken.user_id == user_id)
        ).all()
        if not tokens:
            return
        messages = [{"to": t, "title": title, "body": body} for t in tokens]
        # Injectable client so unit tests can pass an
        # httpx.AsyncClient(transport=MockTransport(...))
        # without monkeypatching (aligns with Phase 8 test_push.py).
        if http is not None:
            await http.post(get_settings().expo_push_url, json=messages)
        else:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(get_settings().expo_push_url, json=messages)

    def prune_stale(self, *, older_than_days: int = 60) -> int:
        cutoff = datetime.now(UTC) - timedelta(days=older_than_days)
        # DELETE/UPDATE go through Session.execute() — SQLModel's exec() only types select()
        # (delete()/update() break pyright strict AND don't expose .rowcount). Key ruling DB.
        # SQLModel marks .execute() deprecated in favor of .exec(), but .exec() cannot take
        # delete() (fastapi/sqlmodel#909) — so the deprecation is ignored HERE deliberately,
        # and the Result is cast to CursorResult for the typed .rowcount.
        result = cast(
            CursorResult[Any],
            self.session.execute(  # pyright: ignore[reportDeprecated]
                delete(PushToken).where(col(PushToken.updated_at) < cutoff)
            ),
        )
        self.session.commit()
        return result.rowcount or 0
