import time
import uuid
from collections.abc import Awaitable, Callable

import sentry_sdk
import structlog
from fastapi import FastAPI, Request, Response

REQUEST_ID_HEADER = "X-Request-Id"
log = structlog.get_logger()


def install_request_id(app: FastAPI) -> None:
    """Bind a request_id for the lifetime of the request: honour an inbound
    X-Request-Id (set by the core api-client wrapper) or mint a UUIDv4, expose it
    on structlog contextvars + the Sentry scope, echo it on the response, and emit
    the JSON access log line. Installed LAST in main.py => OUTERMOST layer, so
    even error responses carry the header and error logs keep the id.
    """

    @app.middleware("http")
    async def _request_id(  # pyright: ignore[reportUnusedFunction]
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        # Tag Sentry so server-side events carry the same id the client tagged
        # (client→API→logs). set_tag is a safe no-op when Sentry isn't initialised.
        sentry_sdk.set_tag("request_id", request_id)
        request.state.request_id = request_id
        start = time.perf_counter()
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        log.info(
            "http_request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round((time.perf_counter() - start) * 1000, 2),
        )
        return response
