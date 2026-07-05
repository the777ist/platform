from fastapi import FastAPI
from fastapi.routing import APIRoute

from .errors import register_exception_handlers
from .middleware import install_request_id
from .routers import hello, items, me, push
from .schemas.common import StrictDTO
from .security import RateLimitMiddleware, build_limiter, install_security


class Health(StrictDTO):
    status: str


def _operation_id(route: APIRoute) -> str:
    # operationIds drive every generated-client symbol name (hey-api: `list_items` ->
    # listItems / listItemsInfiniteOptions). FastAPI's default ids
    # (`list_items_v1_items_get`) would leak path noise into every hook name, so use the
    # route (function) name — FastAPI's documented pattern for generated clients.
    # Constraint: route function names must stay unique across ALL routers.
    return route.name


def create_app() -> FastAPI:
    app = FastAPI(title="demo_api", version="0.0.0", generate_unique_id_function=_operation_id)

    # Target onion (outermost -> innermost): request_id -> security headers/CORS -> rate
    # limit -> routes. Starlette's add_middleware is LIFO (the LAST added wraps everything),
    # so the ADD order below is the REVERSE of the onion — rate limit first, request_id
    # last. This way a 429 short-circuited by the limiter still passes back out through
    # CORS + security headers + request_id, and CORS preflights get an X-Request-Id too.
    app.state.limiter = build_limiter()
    # NOT slowapi's SlowAPIMiddleware — broken on current FastAPI (see RateLimitMiddleware).
    app.add_middleware(RateLimitMiddleware)
    install_security(app)
    install_request_id(app)

    register_exception_handlers(app)

    @app.get("/healthz", response_model=Health, tags=["health"])
    def healthz() -> Health:  # pyright: ignore[reportUnusedFunction]  (registered via decorator)
        return Health(status="ok")

    app.include_router(hello.router)
    app.include_router(me.router)
    app.include_router(items.router)
    app.include_router(push.router)
    return app


app = create_app()
