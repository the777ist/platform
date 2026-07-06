"""Realtime broadcast helper (PHILOSOPHY Realtime — canonical, locked): broadcast-only.

Tables stay RLS-locked; after mutations the API broadcasts an invalidation event on
the PER-PRODUCT channel via Supabase Realtime's HTTP broadcast endpoint using the
service-role key. Clients refetch through the API. No Postgres-Changes subscriptions,
no RLS holes, the schema stays private.

Verified against the live local stack (Phase 8): POST {SUPABASE_URL}/realtime/v1/api/broadcast
with apikey + service-role bearer returns 202 Accepted.
"""

import httpx
import structlog

from ..settings import get_settings

log = structlog.get_logger()

# Per-product channel — products never cross-talk (the generator rewrites the token).
CHANNEL = "demo:realtime"


async def broadcast_invalidate(resource: str, *, http: httpx.AsyncClient | None = None) -> None:
    """Tell clients on the per-product channel to invalidate `resource`.

    Failure policy (⚠️ OPEN default, confirm per product): log + swallow — a
    Realtime outage must never fail the write that triggered the broadcast.
    `http` is injectable so tests use httpx.MockTransport (mocking conventions).
    """
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        # Local/test runs without Realtime credentials: skip, don't fail.
        log.debug("broadcast_skipped", resource=resource)
        return
    url = f"{str(settings.supabase_url).rstrip('/')}/realtime/v1/api/broadcast"
    payload = {
        "messages": [{"topic": CHANNEL, "event": "invalidate", "payload": {"resource": resource}}]
    }
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
    }
    try:
        if http is not None:
            resp = await http.post(url, json=payload, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        log.info("broadcast", resource=resource)
    except httpx.HTTPError:
        log.warning("broadcast_failed", resource=resource, exc_info=True)
