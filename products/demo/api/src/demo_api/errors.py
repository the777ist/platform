from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_CONTENT_TYPE = "application/problem+json"


class ProblemException(Exception):
    """Raise inside services/routers to emit a typed problem+json response."""

    def __init__(
        self,
        *,
        status: int,
        title: str,
        detail: str | None = None,
        type_: str = "about:blank",
    ) -> None:
        self.status = status
        self.title = title
        self.detail = detail
        self.type_ = type_
        super().__init__(detail or title)


def problem_response(
    request: Request, *, status: int, title: str, detail: str | None, type_: str
) -> JSONResponse:
    body: dict[str, object] = {
        "type": type_,
        "title": title,
        "status": status,
        "instance": str(request.url.path),
    }
    if detail is not None:
        body["detail"] = detail
    return JSONResponse(status_code=status, content=body, media_type=PROBLEM_CONTENT_TYPE)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProblemException)
    async def _on_problem(  # pyright: ignore[reportUnusedFunction]  (registered via decorator)
        request: Request, exc: ProblemException
    ) -> JSONResponse:
        return problem_response(
            request, status=exc.status, title=exc.title, detail=exc.detail, type_=exc.type_
        )

    @app.exception_handler(StarletteHTTPException)
    async def _on_http(  # pyright: ignore[reportUnusedFunction]
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        return problem_response(
            request,
            status=exc.status_code,
            title=str(exc.detail),
            detail=None,
            type_="about:blank",
        )

    @app.exception_handler(RequestValidationError)
    async def _on_validation(  # pyright: ignore[reportUnusedFunction]
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return problem_response(
            request,
            status=422,
            title="Unprocessable Entity",
            detail=str(exc.errors()),
            type_="about:blank",
        )

    @app.exception_handler(RateLimitExceeded)
    async def _on_rate_limit(  # pyright: ignore[reportUnusedFunction]
        request: Request, exc: RateLimitExceeded
    ) -> JSONResponse:
        # slowapi raises this; we render it as problem+json (429).
        return problem_response(
            request,
            status=429,
            title="Too Many Requests",
            detail=f"Rate limit exceeded: {exc.detail}",
            type_="about:blank",
        )
