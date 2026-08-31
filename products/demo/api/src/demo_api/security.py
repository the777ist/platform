import re
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


def _path_format_to_pattern(path_format: str) -> re.Pattern[str]:
    """`/v1/items/{item_id}` -> a regex matching any one concrete url of that route.

    `path_format` is FastAPI's own name for the parameterised form of a route's path.
    """
    parts = [
        "[^/]+" if seg.startswith("{") and seg.endswith("}") else re.escape(seg)
        for seg in path_format.split("/")
    ]
    return re.compile("^" + "/".join(parts) + "$")


def _route_patterns(app: FastAPI) -> list[tuple[re.Pattern[str], str]]:
    """Every route's path_format, compiled once per app and cached on `app.state`.

    Read out of `app.openapi()` — a PUBLIC api — rather than by walking `app.routes`: current
    FastAPI wraps included routers in `_IncludedRouter` internals, so the APIRoute objects are
    not reachable from the top level (a walk finds exactly one of them, `/healthz`). That is the
    same private-internals trap RateLimitMiddleware below already exists to work around, so this
    deliberately does not repeat it. Built lazily because routers are included AFTER the
    middleware is added.

    Sorted static-first so a literal route always wins over a parameterised one that could also
    match it — a future `/v1/items/export` must not bucket as `/v1/items/{item_id}`.
    """
    cached: list[tuple[re.Pattern[str], str]] | None = getattr(app.state, "rate_limit_routes", None)
    if cached is None:
        paths: dict[str, object] = app.openapi()["paths"]
        cached = [
            (_path_format_to_pattern(p), p) for p in sorted(paths, key=lambda p: p.count("{"))
        ]
        app.state.rate_limit_routes = cached
    return cached


def rate_limit_scope(app: FastAPI, path: str) -> str:
    """The rate-limit bucket for `path`: its ROUTE, never the concrete url.

    slowapi's `key_style="url"` scopes the limit on `request["path"]`, so without this every
    `/v1/items/<uuid>` was its own bucket and the limit never bound on ANY by-id route —
    rotate the id and even an anonymous caller was completely unlimited. Unrouted paths fall
    back to themselves, so a 404 is still bounded rather than exempt.
    """
    for pattern, path_format in _route_patterns(app):
        if pattern.match(path):
            return path_format
    return path


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Applies the limiter's default limits to EVERY route (per-IP / per-user buckets).

    Replaces slowapi's own SlowAPIMiddleware: that middleware resolves the endpoint via
    `route.matches(scope)`, which returns Match.NONE for every route on current FastAPI
    (0.139 wraps routers in `_IncludedRouter` internals) — so it silently exempted every
    request and default limits never fired. With the limiter's `key_style="url"` the limit
    check needs no endpoint function at all, so this middleware skips handler discovery and
    calls the check directly, rendering the 429 as problem+json.

    `key_style="url"` carries its own trap, which is why the check runs against a REWRITTEN
    scope. slowapi buckets on the concrete `request["path"]`, so `/v1/items/<uuid>` gave every
    id a fresh bucket and the limit never bound on a by-id route at all — measured: 20 requests
    with rotating ids drew zero 429s while the same count on a fixed path drew the expected
    refusals. `rate_limit_scope` collapses the path onto its route's path_format first, which is
    what makes the bucket one per ROUTE per user/IP rather than one per url. Both halves are pinned
    by tests/test_security.py, because a rate limiter that never fires looks exactly like one
    that is never provoked.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        limiter: Limiter = request.app.state.limiter
        if limiter.enabled:
            scope = dict(request.scope)
            scope["path"] = rate_limit_scope(request.app, request.url.path)
            try:
                # Same private call slowapi's own middleware makes (None endpoint is fine
                # under key_style="url"), but against the route-scoped path.
                limiter._check_request_limit(Request(scope), None, True)  # pyright: ignore[reportPrivateUsage]
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
