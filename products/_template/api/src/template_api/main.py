from fastapi import FastAPI

from .errors import register_exception_handlers
from .middleware import install_request_id
from .routers import hello, items, me, push
from .schemas.common import StrictDTO
from .security import RateLimitMiddleware, build_limiter, install_security


class Health(StrictDTO):
    status: str


def create_app() -> FastAPI:
    app = FastAPI(title="template_api", version="0.0.0")

    # Order: request_id (outermost) -> security/CORS/headers -> rate limit.
    install_request_id(app)
    install_security(app)
    app.state.limiter = build_limiter()
    # NOT slowapi's SlowAPIMiddleware — broken on current FastAPI (see RateLimitMiddleware).
    app.add_middleware(RateLimitMiddleware)

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
