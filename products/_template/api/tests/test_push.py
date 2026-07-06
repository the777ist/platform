"""Push loop server side (PHILOSOPHY Push notifications; testing strategy: external
HTTP — the Expo Push API — is mocked via httpx.MockTransport, never called for real).
"""

import json
from datetime import UTC, datetime, timedelta
from typing import Any, cast

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import CursorResult, update
from sqlmodel import Session, select

from template_api.models import PushToken
from template_api.schemas.push import PushTokenCreate
from template_api.services.push_service import PushService

from .conftest import TEST_OWNER


def test_register_creates_then_updates_in_place(session: Session) -> None:
    svc = PushService(session=session)
    first = svc.register(
        user_id=TEST_OWNER,
        data=PushTokenCreate(device_id="device-1", expo_token="ExponentPushToken[a]"),
    )
    # Same user+device with a fresh token UPDATES the row (uq_push_user_device).
    second = svc.register(
        user_id=TEST_OWNER,
        data=PushTokenCreate(device_id="device-1", expo_token="ExponentPushToken[b]"),
    )
    assert second.id == first.id
    assert second.expo_token == "ExponentPushToken[b]"
    rows = session.exec(select(PushToken).where(PushToken.user_id == TEST_OWNER)).all()
    assert len(rows) == 1


def test_register_endpoint_returns_dto(auth_client: TestClient) -> None:
    resp = auth_client.post(
        "/v1/push-tokens",
        json={"device_id": "device-e2e", "expo_token": "ExponentPushToken[e2e]"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["device_id"] == "device-e2e"
    assert body["expo_token"] == "ExponentPushToken[e2e]"
    assert set(body) == {"id", "device_id", "expo_token"}  # DTO, no ORM leakage


@pytest.mark.asyncio
async def test_send_push_posts_all_user_tokens_to_expo(session: Session) -> None:
    svc = PushService(session=session)
    svc.register(
        user_id=TEST_OWNER,
        data=PushTokenCreate(device_id="phone", expo_token="ExponentPushToken[x]"),
    )
    svc.register(
        user_id=TEST_OWNER,
        data=PushTokenCreate(device_id="tablet", expo_token="ExponentPushToken[y]"),
    )
    seen: dict[str, Any] = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"] = str(req.url)
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json={"data": [{"status": "ok"}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await svc.send_push(user_id=TEST_OWNER, title="hi", body="yo", http=http)

    assert seen["url"] == "https://exp.host/--/api/v2/push/send"
    assert {m["to"] for m in seen["body"]} == {"ExponentPushToken[x]", "ExponentPushToken[y]"}
    assert all(m["title"] == "hi" and m["body"] == "yo" for m in seen["body"])


@pytest.mark.asyncio
async def test_send_push_without_tokens_never_calls_expo(session: Session) -> None:
    def handler(req: httpx.Request) -> httpx.Response:  # pragma: no cover - must not run
        raise AssertionError("Expo Push API must not be called when the user has no tokens")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await PushService(session=session).send_push(
            user_id="00000000-0000-0000-0000-000000000000", title="hi", body="yo", http=http
        )


def test_prune_stale_deletes_only_old_tokens(session: Session) -> None:
    svc = PushService(session=session)
    svc.register(
        user_id=TEST_OWNER,
        data=PushTokenCreate(device_id="old", expo_token="ExponentPushToken[old]"),
    )
    svc.register(
        user_id=TEST_OWNER,
        data=PushTokenCreate(device_id="fresh", expo_token="ExponentPushToken[new]"),
    )
    # Backdate one row past the staleness cutoff (bypass onupdate via raw UPDATE).
    cast(
        CursorResult[Any],
        session.execute(  # pyright: ignore[reportDeprecated]  (see PushService.prune_stale)
            update(PushToken)
            .where(PushToken.device_id == "old")  # pyright: ignore[reportArgumentType]
            .values(updated_at=datetime.now(UTC) - timedelta(days=120))
        ),
    )
    removed = svc.prune_stale(older_than_days=90)
    assert removed == 1
    left = session.exec(select(PushToken).where(PushToken.user_id == TEST_OWNER)).all()
    assert [t.device_id for t in left] == ["fresh"]
