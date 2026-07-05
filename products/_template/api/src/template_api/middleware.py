import uuid
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response

REQUEST_ID_HEADER = "X-Request-Id"


def install_request_id(app: FastAPI) -> None:
    @app.middleware("http")
    async def _request_id(  # pyright: ignore[reportUnusedFunction]
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        request.state.request_id = request_id
        # Phase 8 will bind this into structlog contextvars + tag the Sentry scope here.
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
