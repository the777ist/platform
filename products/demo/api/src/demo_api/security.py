from collections.abc import Awaitable, Callable

import jwt
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from .errors import problem_response
from .settings import get_settings


def _rate_key(request: Request) -> str:
    # Per-user when authenticated, else per-IP (PHILOSOPHY: per-IP + per-user). Key on the verified
    # JWT `sub` claim — a token slice would key per-TOKEN (a refreshed token = a new bucket),
    # not per-USER. An unverified decode here is acceptable: the real auth dependency verifies
    # the same token on the protected route; this is only for choosing a rate-limit bucket.
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            claims = jwt.decode(auth.removeprefix("Bearer "), options={"verify_signature": False})
            sub = claims.get("sub")
            if isinstance(sub, str):
                return f"user:{sub}"
        except jwt.PyJWTError:
            pass
    return f"ip:{get_remote_address(request)}"


def build_limiter() -> Limiter:
    s = get_settings()
    # key_style="url": the default-limits check then keys on the request PATH and needs no
    # endpoint function — required for RateLimitMiddleware below (see its docstring).
    return Limiter(key_func=_rate_key, default_limits=[s.rate_limit_default], key_style="url")


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Applies the limiter's default limits to EVERY route (per-IP / per-user buckets).

    Replaces slowapi's own SlowAPIMiddleware: that middleware resolves the endpoint via
    `route.matches(scope)`, which returns Match.NONE for every route on current FastAPI
    (0.139 wraps routers in `_IncludedRouter` internals) — so it silently exempted every
    request and default limits never fired. With the limiter's `key_style="url"` the limit
    check needs no endpoint function at all, so this middleware skips handler discovery and
    calls the check directly, rendering the 429 as problem+json.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        limiter: Limiter = request.app.state.limiter
        if limiter.enabled:
            try:
                # Same private call slowapi's own middleware makes (None endpoint is fine
                # under key_style="url").
                limiter._check_request_limit(request, None, True)  # pyright: ignore[reportPrivateUsage]
            except RateLimitExceeded as exc:
                return problem_response(
                    request,
                    status=429,
                    title="Too Many Requests",
                    detail=f"Rate limit exceeded: {exc.detail}",
                    type_="about:blank",
                )
        return await call_next(request)


def install_security(app: FastAPI) -> None:
    s = get_settings()

    # Env-driven CORS allowlist: web origin + app:// desktop + mobile.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*", "Authorization", "X-Request-Id"],
        expose_headers=["X-Request-Id"],
    )

    @app.middleware("http")
    async def _security_headers(  # pyright: ignore[reportUnusedFunction]
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
        )
        return response
