"""Broadcast-only realtime, server side (PHILOSOPHY Realtime — locked): the external
Supabase Realtime HTTP call is mocked via httpx.MockTransport (mocking conventions).
"""

import json
from collections.abc import Generator
from typing import Any

import httpx
import pytest

from template_api.services.realtime import broadcast_invalidate
from template_api.settings import get_settings


@pytest.fixture
def broadcast_creds(monkeypatch: pytest.MonkeyPatch) -> Generator[None]:
    """Give Settings realtime credentials for the duration of one test.

    get_settings() is lru_cached — clear it around the env change so the helper
    sees the patched values, and again after so other tests see the blank key
    that tests/__init__.py pinned.
    """
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.asyncio
@pytest.mark.usefixtures("broadcast_creds")
async def test_broadcast_posts_per_product_channel_with_service_role() -> None:
    seen: dict[str, Any] = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"] = str(req.url)
        seen["apikey"] = req.headers.get("apikey")
        seen["auth"] = req.headers.get("authorization")
        seen["body"] = json.loads(req.content)
        return httpx.Response(202)  # the live endpoint answers 202 Accepted

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await broadcast_invalidate("items", http=http)

    assert seen["url"] == "http://localhost:54321/realtime/v1/api/broadcast"
    assert seen["apikey"] == "service-role-test-key"
    assert seen["auth"] == "Bearer service-role-test-key"
    assert seen["body"] == {
        "messages": [
            {"topic": "template:realtime", "event": "invalidate", "payload": {"resource": "items"}}
        ]
    }


@pytest.mark.asyncio
@pytest.mark.usefixtures("broadcast_creds")
async def test_broadcast_failure_is_swallowed() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        # OPEN/TO CONFIRM default (log + swallow): a Realtime outage never raises
        # into the mutation that triggered the broadcast.
        await broadcast_invalidate("items", http=http)


@pytest.mark.asyncio
async def test_broadcast_without_credentials_is_skipped() -> None:
    def handler(req: httpx.Request) -> httpx.Response:  # pragma: no cover - must not run
        raise AssertionError("broadcast must be skipped when the service key is unset")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await broadcast_invalidate("items", http=http)
