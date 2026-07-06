"""Server-side Sentry init (PHILOSOPHY Observability). No-op without a DSN,
so local dev and CI need no Sentry account. The middleware tags every event
with the request_id — the same tag the client-side SDK sets, which is what
makes client→API→logs traceability work.
"""

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from .settings import get_settings


def init_sentry() -> None:
    settings = get_settings()
    if not settings.sentry_dsn:
        return  # no-op locally / in CI without a DSN
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        release=settings.release,
        integrations=[FastApiIntegration(), StarletteIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )
