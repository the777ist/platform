# Phase 3 — FastAPI backend (strict layered OOP)

**Goal:** Build `products/_template/api` into a working FastAPI service in the **strict
layered OOP** shape locked by PHILOSOPHY.md — `models/` (SQLModel tables, persistence only) →
`services/` (class per aggregate, holds the session via `Depends`, owns business logic
AND data access) → `schemas/` (Pydantic v2 DTOs = the API contract) ↔ `routers/` (thin,
map schema↔domain). UUIDv7 PKs on a SQLModel base; RFC 9457 problem+json errors; cursor
pagination (`useInfiniteQuery`-ready); env-driven CORS allowlist + security headers +
slowapi rate limiting; request_id middleware scaffold; `/healthz` + `/v1/hello` +
`/v1/me` stub + `/v1/items` CRUD + `/v1/push-tokens`; JWKS-based auth (primary on ALL
environments, including local — the current Supabase CLI issues ES256) with HS256 as a
genuine fallback only; psycopg3 + NullPool over the pooler (6543) with Alembic migrating over the
direct port (5432); an initial Alembic migration that creates the tables AND sets **RLS
deny-all**; `seed.py`; polyfactory factories; pyright strict + Pydantic strict; a
multi-stage uv Dockerfile; staging/production fly tomls; pytest against **real Postgres**
with per-test transaction rollback.

This is the concrete expansion of the PHILOSOPHY.md **Phase 3** row:

> `_template/api`: strict layered OOP — `models/`, `schemas/` (DTOs), `services/`
> (BaseService + ItemService/PushService, hold session), thin `routers/`; UUIDv7 base,
> problem+json, cursor pagination, security.py (CORS/headers/slowapi), middleware,
> /healthz + /v1/hello + /v1/items CRUD, auth.py, db.py, initial Alembic migration (RLS
> deny-all), seed.py, polyfactory factories, pyright-strict config, Dockerfile, fly
> tomls, pytest (real Postgres).

**Verify (restated from PHILOSOPHY.md):**
1. `turbo run dev --filter=*template-api` + `curl /healthz` returns healthy.
2. Items **CRUD + paging** round-trips.
3. **problem+json** error bodies on failures.
4. **429** returned on rate-limit breach.
5. **CORS preflight** from the web origin passes.
6. **DTOs returned (no ORM leakage)** — responses never serialize SQLModel tables.
7. `pyright` clean in **strict** mode.
8. `seed.py` **populates the DB**.
9. `turbo run test lint` green (Postgres service container).
10. `docker build` succeeds.

This guide is faithful to PHILOSOPHY.md's locked decisions: Decision Sheet bullets on Backend,
Topology, Contracts, API hardening, Background/scheduled jobs, Operational defaults, DB
conventions, "API conventions / architecture", and Realtime; Key design rulings #4
(psycopg3 + NullPool + `prepare_threshold=None`, Alembic over 5432 via
`DATABASE_MIGRATION_URL`), #5 (JWKS `PyJWKClient` ES256/RS256 cached as the primary path on
ALL environments incl. local, HS256 a genuine fallback only), #10 (strict layered OOP but Pythonic, `model → service → schema → router`); the
`api/` directory tree; the `api/db.py` / `auth.py` / `export_openapi.py` / Dockerfile /
Python-deps notes in "Config essentials & gotchas"; and the API unit + integration rows in
"Testing strategy". Anything PHILOSOPHY.md does not pin is marked **⚠️ OPEN / TO CONFIRM**.

---

## Prerequisites

- **Phase 1 complete** — root pnpm workspace, Turborepo 2.9, `tsconfig.base.json`,
  `pnpm-workspace.yaml` with `nodeLinker: hoisted`, `lefthook.yml`, and `mise.toml` pinning
  Node 24 / pnpm 11 / **Python 3.13** / **uv**. `pnpm-workspace.yaml` already globs
  `products/*/{app,desktop,api,api-client}` so the api workspace is picked up.
- **uv + Python 3.13** available via `mise install` (the api is a self-contained uv project
  per the Package management model — own `pyproject.toml`, own `uv.lock`, own `.venv`).
- **A real Postgres for tests** — Supabase local CLI stack in dev (`supabase start`, wired
  fully in Phase 6) OR a plain Postgres. CI uses a Postgres **service container**. The
  integration tests require a real database (UUIDv7 + real SQL, per-test rollback); they
  never mock the session.
- `docker` available for the `docker build` Verify step.
- This phase does NOT require Phase 2; it is the backend half and can proceed in parallel.
  Typegen (Phase 4) consumes `export_openapi.py` from here.

> Naming is **exact** throughout: Python module `template_api`, JS workspace
> `@platform/template-api`, fly staging app `example-template-api-stg`, fly production app
> `example-template-api-prod`, local API port **8000**, Supabase project id
> `example-template`. The literal product token is `template` (Key ruling #7); the
> generator whole-word-rewrites `template` / `Template` / `template_api` for stamped
> products. Paths below are **repo-relative** (e.g. `products/_template/api/...`).

---

## Definition of done

- [ ] `products/_template/api` is a self-contained uv project: `pyproject.toml`, `uv.lock`,
      `.venv`, and a `package.json` script shim (`dev` / `lint` / `test` / `openapi` via
      `uv run`) so Turborepo orchestrates it in the same task graph.
- [ ] Source lives under `src/template_api/` and is the strict-OOP layering:
      `models/` (SQLModel tables only) → `services/` (BaseService + ItemService +
      PushService, each holding the session via `Depends`) → `schemas/` (Pydantic v2 DTOs)
      ↔ `routers/` (thin: hello, me, items, push). **No repository layer.**
- [ ] Every table PK is **UUIDv7** from a shared SQLModel base; tables: `item`,
      `push_token`.
- [ ] **DTOs are always separate from DB models** — no router ever returns a SQLModel
      table instance; responses are `schemas/` types.
- [ ] Errors are **RFC 9457 problem+json** (`application/problem+json`, `type`/`title`/
      `status`/`detail`/`instance`), typed into the OpenAPI schema.
- [ ] List endpoints use **cursor pagination** returning a page envelope
      (`{ items, next_cursor }`) that is `useInfiniteQuery`-ready.
- [ ] `security.py` provides an **env-driven CORS allowlist** (web origin + `app://`
      desktop + mobile), **security-headers** middleware, and a **slowapi** limiter
      (per-IP + per-user) → returns **429** with a problem+json body.
- [ ] `middleware.py` provides a **request_id** scaffold (generate/propagate
      `X-Request-Id`); full structlog JSON binding is **Phase 8** (noted, not built here).
- [ ] `auth.py` verifies Supabase JWTs via **JWKS `PyJWKClient`** (cached, ES256/RS256,
      `audience="authenticated"`) as the **primary path on all environments incl. local**,
      with **HS256 + `SUPABASE_JWT_SECRET`** as a genuine fallback only (older CLI /
      self-hosted symmetric secret / minted test tokens); exposes a `CurrentUser` dependency.
- [ ] `db.py` builds the engine with **psycopg3 + `NullPool` + `prepare_threshold=None`**
      over the pooler (6543) and exposes a `get_session` dependency; a separate
      `DATABASE_MIGRATION_URL` (direct **5432**) is used only by Alembic.
- [ ] `alembic/` has an **initial migration** that creates `item` + `push_token` AND
      applies **RLS deny-all** on every table (the API's privileged role bypasses it).
- [ ] `seed.py` populates local dev data; `tasks.py` ships the prune-stale-push-tokens
      example (Fly scheduled machine target).
- [ ] `export_openapi.py` writes `app.openapi()` JSON with **sorted keys**, **no server**.
- [ ] `Dockerfile` is multi-stage on `ghcr.io/astral-sh/uv` (`uv sync --frozen --no-dev` →
      slim runtime). `fly.staging.toml` / `fly.production.toml` set the app names and a
      `release_command` that runs `alembic upgrade head`.
- [ ] `pyproject.toml` configures **pyright strict** + **Pydantic strict mode** + Ruff;
      `pyright` is clean.
- [ ] `tests/` runs against **real Postgres** with **per-test transaction rollback**, uses
      **polyfactory** factories, and covers items CRUD + problem+json + DTO/ORM separation
      (`test_items.py`) and JWT paths (`test_auth.py`).
- [ ] All ten Verify checks pass (see **Verification**).

---

## Build steps

> Ordered to follow the locked per-feature recipe `model → service → schema → router`
> (Key ruling #10), with project skeleton + infra (db/auth/security/errors) established
> first so the layers have something to bind to. For EACH step: **Files**, **Contents**,
> **Commands**, **Why**.

### Step 1 — Scaffold the uv project + Turborepo script shim

**Files:** `products/_template/api/pyproject.toml`, `products/_template/api/package.json`,
`products/_template/api/.python-version`, `products/_template/api/turbo.json`.

**Contents** — `pyproject.toml` (deps list verbatim from "Config essentials & gotchas"):

```toml
[project]
name = "template-api"
version = "0.0.0"
description = "Template product FastAPI service"
requires-python = ">=3.13"
dependencies = [
  "fastapi==0.124.4",              # current stable (2025-12-12); uses lifespan, not on_event
  "uvicorn[standard]",
  "pydantic-settings",
  "sqlmodel==0.0.27",              # pre-1.0 — pin exact; Pydantic v2 + SQLAlchemy 2 compatible
  "sqlalchemy[postgresql-psycopg]",
  "psycopg[binary]",
  "alembic",
  "pyjwt[crypto]",
  "httpx",
  "sentry-sdk[fastapi]",
  "structlog",
  "slowapi==0.1.9",                # ⚠️ REVIEW: pin to the current slowapi release (self-described "alpha" — pin exact)
  "uuid-utils==0.10.0",            # ⚠️ REVIEW: pin to the exact current uuid-utils release. Maintained UUIDv7 generator (Rust-backed, returns a stdlib-compatible UUID). Alt: uuid6. See note below.
]

[dependency-groups]
dev = [
  "pytest==9.0.3",                 # current (April 2026)
  "pytest-asyncio==1.4.0",         # 1.x defaults to asyncio_mode="strict" → markers required (configured below)
  "ruff==0.15.0",                  # current (2026-02-03)
  "pyright",
  "polyfactory",                   # current 2.x line — pin exact when locking
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/template_api"]

[tool.ruff]
line-length = 100
src = ["src", "tests"]

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "ASYNC", "RUF"]

[tool.pyright]
include = ["src", "tests"]
typeCheckingMode = "strict"      # no untyped defs, no implicit Any (locked)
pythonVersion = "3.13"
venvPath = "."
venv = ".venv"

[tool.pytest.ini_options]
addopts = "-ra"
testpaths = ["tests"]
asyncio_mode = "strict"          # pytest-asyncio 1.x: pin behavior; async tests need @pytest.mark.asyncio
```

> **UUIDv7 source (resolved):** Python 3.13 has **no** stdlib `uuid7` — `uuid.uuid7()` /
> UUID versions 6/7/8 (RFC 9562) only land in **Python 3.14**, so a third-party library is
> mandatory here. Use the maintained **`uuid-utils`** (`from uuid_utils import uuid7`,
> Rust-backed, returns a stdlib-compatible `UUID`, actively maintained) — pinned exact — as
> in Step 6. The alternative is **`uuid6`** (`from uuid6 import uuid7`). Do **NOT** use the
> PyPI `uuid7` package / `from uuid_extensions import uuid7`: that dist's last release was
> 2021, it is effectively unmaintained, and its `uuid7()` predates the final RFC 9562 layout.
> (A *different* maintained package `uuid-extension` imports as `from uuid_extension import
> uuid7` — singular — do not confuse the two.) Postgres 18 has native `uuidv7()` — if the
> deployment targets PG18 the DB-side default could replace the Python generator; **confirm
> the Supabase Postgres version**.

`package.json` (script shim only — Python is per-product isolated; the shim lets Turborepo
orchestrate `uv run` tasks in the same graph):

```json
{
  "name": "@platform/template-api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "uv run uvicorn template_api.main:app --reload --host 0.0.0.0 --port 8000",
    "lint": "uv run ruff check . && uv run ruff format --check . && uv run pyright",
    "test": "uv run pytest",
    "openapi": "uv run python -m template_api.export_openapi",
    "migrate": "uv run alembic upgrade head",
    "seed": "uv run python -m template_api.seed"
  }
}
```

`turbo.json` (package-level — Python `inputs` globs are **mandatory** or caching is wrong,
per the turbo.json notes; `openapi` outputs `openapi.json` which Phase 4 consumes):

```json
{
  "extends": ["//"],
  "tasks": {
    "openapi": {
      "inputs": ["src/**/*.py", "pyproject.toml", "uv.lock"],
      "outputs": ["openapi.json"]
    },
    "lint": { "inputs": ["src/**/*.py", "tests/**/*.py", "pyproject.toml"] },
    "test": { "inputs": ["src/**/*.py", "tests/**/*.py", "pyproject.toml", "uv.lock"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

**Commands:**
```bash
cd products/_template/api
echo "3.13" > .python-version
uv sync                       # creates .venv + uv.lock from pyproject.toml
```

**Why:** establishes the isolated Python universe (own venv + lockfile) while keeping the
api inside the one Turborepo task graph via the `package.json` shim. The Python `inputs`
globs are what make turbo cache the `openapi`/`lint`/`test` tasks correctly — omitting them
is a documented caching footgun.

---

### Step 2 — `settings.py` (pydantic-settings)

**Files:** `products/_template/api/src/template_api/__init__.py` (empty),
`products/_template/api/src/template_api/settings.py`.

**Contents:**
```python
from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Runtime ---
    environment: str = Field(default="local")  # local | staging | production
    api_port: int = Field(default=8000)

    # --- Database ---
    # Runtime app traffic goes over the Supabase pooler (transaction mode, 6543).
    database_url: str = Field(...)
    # Alembic migrations go over the DIRECT port (5432). Key ruling #4.
    database_migration_url: str = Field(...)

    # --- Auth (Supabase) ---
    supabase_url: AnyHttpUrl | None = Field(default=None)        # JWKS discovery base
    supabase_jwt_secret: str | None = Field(default=None)        # HS256 genuine fallback only
    jwt_audience: str = Field(default="authenticated")

    # --- CORS allowlist (comma-separated; web origin + app:// desktop + mobile) ---
    cors_origins: str = Field(default="http://localhost:8081,app://-")

    # --- Realtime broadcast (Phase 8; service-role HTTP call) ---
    supabase_service_role_key: str | None = Field(default=None)

    # --- Push (Expo Push API base) ---
    expo_push_url: str = Field(default="https://exp.host/--/api/v2/push/send")

    # --- Rate limits (slowapi) ---
    rate_limit_default: str = Field(default="100/minute")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # values from env
```

**Commands:** none (imported lazily).

**Why:** one typed config surface. The two distinct URLs encode Key ruling #4 — runtime
over the pooler, migrations over the direct port. `.env.example` (Step 24 / generator)
documents every consumed var per the Operational defaults bullet.

---

### Step 3 — `db.py` (psycopg3 engine + session dependency + migration URL)

**Files:** `products/_template/api/src/template_api/db.py`.

**Contents:**
```python
from collections.abc import Generator

from sqlalchemy import Engine
from sqlalchemy.pool import NullPool
from sqlmodel import Session, create_engine

from .settings import get_settings


def _make_engine(url: str) -> Engine:
    # Key ruling #4: runtime app traffic uses the TRANSACTION-mode pooler (6543) for
    # serverless-friendly autoscaling. Supavisor reassigns connections per-transaction, so it
    # does not reliably keep server-side prepared statements. psycopg v3 + prepare_threshold=None
    # disables them; NullPool means we don't double-pool on top of Supavisor. Session mode and
    # direct connections live on 5432 (NOT removed) but aren't used for runtime traffic; Alembic
    # uses the direct 5432 URL.
    return create_engine(
        url,
        poolclass=NullPool,
        connect_args={"prepare_threshold": None},
        echo=False,
    )


_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = _make_engine(get_settings().database_url)
    return _engine


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency: one Session per request, committed/closed at the edge."""
    with Session(get_engine()) as session:
        yield session
```

> The URL must use the psycopg3 driver, e.g.
> `postgresql+psycopg://USER:PASS@HOST:6543/postgres` for `DATABASE_URL` and the same on
> `:5432` for `DATABASE_MIGRATION_URL`. The `+psycopg` scheme selects psycopg3 (NOT
> psycopg2, NOT asyncpg).

**Commands:** none.

**Why:** centralizes the pooler-safe engine construction. The migration URL is read
separately by `alembic/env.py` (Step 19), never by request handlers.

---

### Step 4 — `errors.py` (RFC 9457 problem+json)

**Files:** `products/_template/api/src/template_api/errors.py`.

**Contents:**
```python
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


def _problem(
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
    return JSONResponse(
        status_code=status, content=body, media_type=PROBLEM_CONTENT_TYPE
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProblemException)
    async def _on_problem(request: Request, exc: ProblemException) -> JSONResponse:
        return _problem(
            request, status=exc.status, title=exc.title, detail=exc.detail, type_=exc.type_
        )

    @app.exception_handler(StarletteHTTPException)
    async def _on_http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _problem(
            request,
            status=exc.status_code,
            title=str(exc.detail),
            detail=None,
            type_="about:blank",
        )

    @app.exception_handler(RequestValidationError)
    async def _on_validation(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return _problem(
            request,
            status=422,
            title="Unprocessable Entity",
            detail=str(exc.errors()),
            type_="about:blank",
        )

    @app.exception_handler(RateLimitExceeded)
    async def _on_rate_limit(
        request: Request, exc: RateLimitExceeded
    ) -> JSONResponse:
        # slowapi raises this; we render it as problem+json (429).
        return _problem(
            request,
            status=429,
            title="Too Many Requests",
            detail=f"Rate limit exceeded: {exc.detail}",
            type_="about:blank",
        )
```

**Commands:** none.

**Why:** RFC 9457 problem+json is locked as the error contract; routing every error class
(domain `ProblemException`, HTTP exceptions, validation errors, and slowapi's 429) through
one renderer guarantees the `application/problem+json` body shape is uniform and typeable
into OpenAPI. The matching DTO model is declared in `schemas/` (Step 8) so it appears in
the generated client.

---

### Step 5 — `pagination.py` (cursor helpers)

**Files:** `products/_template/api/src/template_api/pagination.py`.

**Contents:**
```python
import base64
import json
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


def encode_cursor(value: str) -> str:
    return base64.urlsafe_b64encode(json.dumps({"after": value}).encode()).decode()


def decode_cursor(cursor: str | None) -> str | None:
    if not cursor:
        return None
    try:
        return json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())["after"]
    except (ValueError, KeyError):
        return None


def clamp_limit(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


class Page(BaseModel, Generic[T]):
    """Cursor-paginated page envelope. useInfiniteQuery-ready."""

    model_config = ConfigDict(strict=True)

    items: list[T]
    next_cursor: str | None = None
```

> **Cursor field names (resolved):** keep `{ items, next_cursor }` with an **opaque base64
> cursor keyed on `id`** — this matches current best practice (`next_cursor` is the
> conventional response field; clients treat the cursor as opaque) and UUIDv7 is the endorsed
> monotonic keyset column (`WHERE id > :after ORDER BY id LIMIT :n+1`, fetch `limit+1` to detect
> `has_more`). Postgres `uuid` ordering is bytewise and matches UUIDv7's big-endian time
> ordering, so `ORDER BY id` agrees with Python's UUID comparison. Phase 4's `features/home`
> must use these exact names. (If a product ever sorts by a key other than `id`, the cursor must
> encode the full sort tuple — the single-`after` cursor assumes `id` ordering.)

**Commands:** none.

**Why:** keyset (cursor) pagination over UUIDv7 PKs is stable under inserts and is what the
generated `useInfiniteQuery` hook consumes. `Page[T]` is a generic DTO so each list
endpoint declares its own `Page[ItemRead]` response.

---

### Step 6 — `models/` (UUIDv7 SQLModel base + Item + PushToken)

**Files:** `products/_template/api/src/template_api/models/__init__.py`,
`.../models/base.py`, `.../models/item.py`, `.../models/push_token.py`.

**Contents** — `base.py`:
```python
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func
from sqlmodel import Column, DateTime, Field, SQLModel
from uuid_utils import uuid7  # maintained UUIDv7 generator (or: from uuid6 import uuid7)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UUIDModel(SQLModel):
    """Shared base: UUIDv7 primary key + created/updated timestamps. Persistence only."""

    id: UUID = Field(default_factory=uuid7, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )
```

`item.py`:
```python
from sqlmodel import Field

from .base import UUIDModel


class Item(UUIDModel, table=True):
    __tablename__ = "item"

    title: str = Field(index=True, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    owner_id: str = Field(index=True)  # Supabase auth user id (sub claim)
```

`push_token.py`:
```python
from sqlmodel import Field, UniqueConstraint

from .base import UUIDModel


class PushToken(UUIDModel, table=True):
    __tablename__ = "push_token"
    __table_args__ = (UniqueConstraint("user_id", "device_id", name="uq_push_user_device"),)

    user_id: str = Field(index=True)         # Supabase auth user id
    device_id: str = Field(max_length=200)   # per-device identity
    expo_token: str = Field(max_length=255)  # ExponentPushToken[...]
```

`models/__init__.py`:
```python
from .base import UUIDModel
from .item import Item
from .push_token import PushToken

__all__ = ["UUIDModel", "Item", "PushToken"]
```

**Commands:** none.

**Why:** models are **persistence only** (Key ruling #10) — no business logic, no
serialization. UUIDv7 PKs are the locked DB convention (generated via the maintained
`uuid-utils`/`uuid6`, NOT the stale `uuid7`/`uuid_extensions` package — see Step 1); the
time-ordered property is what makes the cursor pagination keyset stable. ⚠️ REVIEW: confirm
`uuid_utils.uuid7()` coerces into the stdlib-`UUID`-typed `id` column under pyright strict +
Pydantic strict; if the chosen lib returns its own UUID subtype, wrap with `uuid.UUID(str(...))`
in the `default_factory` or switch to `uuid6` (which returns a stdlib `uuid.UUID`).
`push_token` carries the per-user+device row
PHILOSOPHY.md specifies for the push loop. These tables are created by the initial Alembic
migration (Step 20), never by `SQLModel.metadata.create_all` in production.

---

### Step 7 — `services/` (BaseService + ItemService + PushService, hold session)

**Files:** `products/_template/api/src/template_api/services/__init__.py`,
`.../services/base.py`, `.../services/item_service.py`, `.../services/push_service.py`.

**Contents** — `base.py`:
```python
from fastapi import Depends
from sqlmodel import Session

from ..db import get_session


class BaseService:
    """Every service holds the request Session via Depends (Key ruling #10).

    Services are real cohesive objects (NOT staticmethod buckets): each owns its
    aggregate's business logic AND data access. No repository layer — services query
    directly via self.session.
    """

    def __init__(self, session: Session = Depends(get_session)) -> None:
        self.session = session
```

`item_service.py`:
```python
from uuid import UUID

from sqlmodel import select

from ..errors import ProblemException
from ..models import Item
from ..pagination import Page, clamp_limit, decode_cursor, encode_cursor
from ..schemas.item import ItemCreate, ItemRead, ItemUpdate
from .base import BaseService


class ItemService(BaseService):
    def list(self, *, owner_id: str, cursor: str | None, limit: int) -> Page[ItemRead]:
        limit = clamp_limit(limit)
        after = decode_cursor(cursor)
        stmt = select(Item).where(Item.owner_id == owner_id).order_by(Item.id)
        if after is not None:
            stmt = stmt.where(Item.id > UUID(after))
        rows = self.session.exec(stmt.limit(limit + 1)).all()
        has_more = len(rows) > limit
        page = rows[:limit]
        next_cursor = encode_cursor(str(page[-1].id)) if has_more and page else None
        # DTO mapping — ORM models never cross the HTTP boundary.
        return Page(items=[ItemRead.model_validate(r) for r in page], next_cursor=next_cursor)

    def get(self, *, owner_id: str, item_id: UUID) -> ItemRead:
        return ItemRead.model_validate(self._require(owner_id, item_id))

    def create(self, *, owner_id: str, data: ItemCreate) -> ItemRead:
        item = Item(owner_id=owner_id, title=data.title, description=data.description)
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return ItemRead.model_validate(item)

    def update(self, *, owner_id: str, item_id: UUID, data: ItemUpdate) -> ItemRead:
        item = self._require(owner_id, item_id)
        if data.title is not None:
            item.title = data.title
        if data.description is not None:
            item.description = data.description
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return ItemRead.model_validate(item)

    def delete(self, *, owner_id: str, item_id: UUID) -> None:
        self.session.delete(self._require(owner_id, item_id))
        self.session.commit()

    def _require(self, owner_id: str, item_id: UUID) -> Item:
        item = self.session.get(Item, item_id)
        if item is None or item.owner_id != owner_id:
            raise ProblemException(status=404, title="Item not found")
        return item
```

`push_service.py`:
```python
from datetime import datetime, timedelta, timezone

import httpx
from sqlmodel import delete, select

from ..models import PushToken
from ..schemas.push import PushTokenCreate, PushTokenRead
from ..settings import get_settings
from .base import BaseService


class PushService(BaseService):
    def register(self, *, user_id: str, data: PushTokenCreate) -> PushTokenRead:
        existing = self.session.exec(
            select(PushToken).where(
                PushToken.user_id == user_id, PushToken.device_id == data.device_id
            )
        ).first()
        if existing is None:
            existing = PushToken(user_id=user_id, device_id=data.device_id, expo_token=data.expo_token)
        else:
            existing.expo_token = data.expo_token
        self.session.add(existing)
        self.session.commit()
        self.session.refresh(existing)
        return PushTokenRead.model_validate(existing)

    async def send_push(
        self, *, user_id: str, title: str, body: str, http: httpx.AsyncClient | None = None
    ) -> None:
        # A scalar-column select via .exec() is fine (only delete()/update() are unsupported).
        tokens = self.session.exec(
            select(PushToken.expo_token).where(PushToken.user_id == user_id)
        ).all()
        if not tokens:
            return
        messages = [{"to": t, "title": title, "body": body} for t in tokens]
        # Injectable client so unit tests can pass an httpx.AsyncClient(transport=MockTransport(...))
        # without monkeypatching (aligns with Phase 8 test_push.py).
        if http is not None:
            await http.post(get_settings().expo_push_url, json=messages)
        else:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(get_settings().expo_push_url, json=messages)

    def prune_stale(self, *, older_than_days: int = 60) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
        # DELETE/UPDATE go through Session.execute() — SQLModel's exec() only types select()
        # (delete()/update() break pyright strict AND don't expose .rowcount). Key ruling DB.
        result = self.session.execute(delete(PushToken).where(PushToken.updated_at < cutoff))
        self.session.commit()
        return result.rowcount or 0
```

**Commands:** none.

**Why:** services are the **only** layer that touches both business logic and data access
(no repository layer, Key ruling #10). Each takes the `Session` via `Depends` in
`__init__`, so a router declares `svc: ItemService = Depends()` and FastAPI wires the
session through. `send_push()` uses httpx exactly as PHILOSOPHY.md specifies (mockable via httpx
mock transport in unit tests); `prune_stale()` is the scheduled-job entry point.

---

### Step 8 — `schemas/` (Pydantic v2 strict DTOs + problem model + page envelope)

**Files:** `products/_template/api/src/template_api/schemas/__init__.py`,
`.../schemas/common.py`, `.../schemas/item.py`, `.../schemas/push.py`,
`.../schemas/user.py`.

**Contents** — `common.py` (strict base + problem+json DTO so it lands in OpenAPI):
```python
from pydantic import BaseModel, ConfigDict


class StrictDTO(BaseModel):
    # Pydantic strict mode (locked) + from_attributes so model_validate(orm_row) works.
    model_config = ConfigDict(strict=True, from_attributes=True)


class Problem(BaseModel):
    """RFC 9457 problem+json body — declared so it types into the OpenAPI schema."""

    model_config = ConfigDict(strict=True)

    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
```

`item.py`:
```python
from datetime import datetime
from uuid import UUID

from .common import StrictDTO


class ItemCreate(StrictDTO):
    title: str
    description: str | None = None


class ItemUpdate(StrictDTO):
    title: str | None = None
    description: str | None = None


class ItemRead(StrictDTO):
    id: UUID
    title: str
    description: str | None
    owner_id: str
    created_at: datetime
    updated_at: datetime
```

`push.py`:
```python
from uuid import UUID

from .common import StrictDTO


class PushTokenCreate(StrictDTO):
    device_id: str
    expo_token: str


class PushTokenRead(StrictDTO):
    id: UUID
    device_id: str
    expo_token: str
```

`user.py`:
```python
from .common import StrictDTO


class MeRead(StrictDTO):
    id: str
    email: str | None = None
```

**Commands:** none.

**Why:** DTOs are the API contract and the **only** thing crossing the HTTP boundary (DB
models never are). `from_attributes=True` lets `ItemRead.model_validate(orm_item)` in the
service map an ORM row to a DTO without serializing the SQLModel table itself. `strict=True`
is Pydantic strict mode (locked). `Problem` is declared here so the OpenAPI schema (and thus
the generated TS client) carries the typed error shape.

---

### Step 9 — `auth.py` (JWKS PyJWKClient cached + HS256 fallback + CurrentUser)

**Files:** `products/_template/api/src/template_api/auth.py`.

**Contents:**
```python
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, Request
from jwt import PyJWKClient

from .errors import ProblemException
from .schemas.user import MeRead
from .settings import Settings, get_settings


@lru_cache
def _jwks_client(jwks_url: str) -> PyJWKClient:
    # PyJWKClient caches keys internally; lru_cache keeps ONE client per URL. (Ruling #5)
    return PyJWKClient(jwks_url)


def _decode(token: str, settings: Settings) -> dict[str, object]:
    # PRIMARY path on ALL environments (incl. local): verify via JWKS (ES256/RS256). New
    # Supabase projects sign asymmetrically by default, and the local CLI now ALSO issues
    # ES256 by default (since CLI v2.71.1) — so point SUPABASE_URL at http://localhost:54321
    # locally and let PyJWKClient hit the local /auth/v1/.well-known/jwks.json too. (Ruling #5)
    if settings.supabase_url is not None:
        jwks_url = f"{str(settings.supabase_url).rstrip('/')}/auth/v1/.well-known/jwks.json"
        try:
            signing_key = _jwks_client(jwks_url).get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience=settings.jwt_audience,
            )
        except jwt.PyJWTError:
            pass  # fall through to the HS256 genuine fallback
    # HS256 + SUPABASE_JWT_SECRET — GENUINE FALLBACK ONLY (older CLI, self-hosted symmetric
    # secret, manually-minted test tokens). NOT the local happy path: a current CLI issues
    # ES256, so the JWKS branch above is what handles local tokens.
    if settings.supabase_jwt_secret is not None:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience=settings.jwt_audience,
        )
    raise ProblemException(status=401, title="Unauthorized", detail="No verifiable token")


def get_current_user(
    request: Request, settings: Annotated[Settings, Depends(get_settings)]
) -> MeRead:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise ProblemException(status=401, title="Unauthorized", detail="Missing bearer token")
    try:
        claims = _decode(auth.removeprefix("Bearer "), settings)
    except jwt.PyJWTError as exc:
        raise ProblemException(status=401, title="Unauthorized", detail=str(exc)) from exc
    sub = claims.get("sub")
    if not isinstance(sub, str):
        raise ProblemException(status=401, title="Unauthorized", detail="No subject claim")
    email = claims.get("email")
    return MeRead(id=sub, email=email if isinstance(email, str) else None)


CurrentUser = Annotated[MeRead, Depends(get_current_user)]
```

**Commands:** none.

**Why:** encodes Key ruling #5 exactly — JWKS `PyJWKClient` (cached) for asymmetric
ES256/RS256 with `audience="authenticated"` is the **PRIMARY path on ALL environments,
including local** (the current Supabase CLI issues ES256 by default, so point `SUPABASE_URL`
at `http://localhost:54321` and let `PyJWKClient` hit the local JWKS endpoint). HS256 +
`SUPABASE_JWT_SECRET` is a **genuine fallback only** (older CLI / self-hosted symmetric
secret / manually-minted test tokens) — it is NOT the local happy path. (A backend that
trusts only HS256 locally would 401 every request on a current CLI.) `pyjwt[crypto]` is
required for ES256/RS256. `CurrentUser` is the dependency routers attach to protected
endpoints; full auth screens + guards land in Phase 6, but the backend verification is built
here so `/v1/me` and owner-scoped items work.

> ⚠️ **REVIEW (JWKS path):** confirm the JWKS discovery path
> `{supabase_url}/auth/v1/.well-known/jwks.json` against the live project at integration time
> (Phase 6) — it has historically matched, but verify when the project exists.

---

### Step 10 — `security.py` (CORS allowlist + headers + slowapi limiter)

**Files:** `products/_template/api/src/template_api/security.py`.

**Contents:**
```python
from collections.abc import Awaitable, Callable

import jwt
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address

from .settings import get_settings


def _rate_key(request: Request) -> str:
    # Per-user when authenticated, else per-IP (PHILOSOPHY: per-IP + per-user). Key on the verified
    # JWT `sub` claim — a token slice would key per-TOKEN (a refreshed token = a new bucket),
    # not per-USER. An unverified decode here is acceptable: the real auth dependency verifies
    # the same token on the protected route; this is only for choosing a rate-limit bucket.
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            claims = jwt.decode(
                auth.removeprefix("Bearer "), options={"verify_signature": False}
            )
            sub = claims.get("sub")
            if isinstance(sub, str):
                return f"user:{sub}"
        except jwt.PyJWTError:
            pass
    return f"ip:{get_remote_address(request)}"


def build_limiter() -> Limiter:
    s = get_settings()
    return Limiter(key_func=_rate_key, default_limits=[s.rate_limit_default])


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
    async def _security_headers(
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
```

**Commands:** none.

**Why:** the API hardening bullet — env-driven CORS allowlist, security-headers middleware,
and slowapi rate limiting (per-IP + per-user) — every product inherits these defaults. The
limiter is instantiated here and attached to `app.state` in `main.py`; the 429 it raises is
rendered as problem+json by the handler in Step 4.

> **Per-user rate key (resolved):** key on the JWT **`sub`** claim, not a token slice — a
> token slice keys per-*token* (a refreshed token = a new bucket) and is effectively random
> per signature, not per user. Decoding the bearer with `options={"verify_signature": False}`
> *only to extract `sub` for bucketing* is acceptable: the real auth dependency verifies the
> same token on the protected route, so this unverified read never grants access — it just
> picks a bucket. Fall back to `get_remote_address` for anonymous requests. The `100/minute`
> `default_limits` value is a sane env-driven default (`rate_limit_default`); tune per product.

---

### Step 11 — `middleware.py` (request_id scaffold; full structlog is Phase 8)

**Files:** `products/_template/api/src/template_api/middleware.py`.

**Contents:**
```python
import uuid
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response

REQUEST_ID_HEADER = "X-Request-Id"


def install_request_id(app: FastAPI) -> None:
    @app.middleware("http")
    async def _request_id(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        request.state.request_id = request_id
        # Phase 8 will bind this into structlog contextvars + tag the Sentry scope here.
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
```

**Commands:** none.

**Why:** the Observability bullet wants a `request_id` middleware + the client wrapper
sending `X-Request-Id` for client→API→logs traceability. This phase scaffolds the
generate/propagate/echo behavior; the **structlog JSON binding and Sentry tagging are
explicitly Phase 8** — noted inline so it is not built prematurely here.

---

### Step 12 — `routers/hello.py` (thin, unauthenticated smoke)

**Files:** `products/_template/api/src/template_api/routers/__init__.py`,
`.../routers/hello.py`.

**Contents:**
```python
from fastapi import APIRouter

from ..schemas.common import StrictDTO

router = APIRouter(prefix="/v1", tags=["hello"])


class Hello(StrictDTO):
    message: str


@router.get("/hello", response_model=Hello)
def hello() -> Hello:
    return Hello(message="hello from template_api")
```

**Why:** the simplest thin router proving the layering + response-model DTO path end to
end. Routers are thin (Key ruling #10) — they declare the DTO `response_model` and return a
DTO, never a model.

---

### Step 13 — `routers/me.py` (auth-protected stub)

**Files:** `products/_template/api/src/template_api/routers/me.py`.

**Contents:**
```python
from fastapi import APIRouter

from ..auth import CurrentUser
from ..schemas.user import MeRead

router = APIRouter(prefix="/v1", tags=["me"])


@router.get("/me", response_model=MeRead)
def me(user: CurrentUser) -> MeRead:
    return user
```

**Why:** demonstrates the `CurrentUser` dependency end to end (bad/missing token → 401
problem+json; valid bearer → user id). The protected `/v1/me` is verified fully in Phase 6,
but the route + verification exist from here.

---

### Step 14 — `routers/items.py` (thin CRUD, depends on ItemService)

**Files:** `products/_template/api/src/template_api/routers/items.py`.

**Contents:**
```python
from uuid import UUID

from fastapi import APIRouter, Depends, status

from ..auth import CurrentUser
from ..pagination import DEFAULT_LIMIT, Page
from ..schemas.common import Problem
from ..schemas.item import ItemCreate, ItemRead, ItemUpdate
from ..services.item_service import ItemService

router = APIRouter(
    prefix="/v1/items",
    tags=["items"],
    responses={404: {"model": Problem}, 401: {"model": Problem}},
)


@router.get("", response_model=Page[ItemRead])
def list_items(
    user: CurrentUser,
    svc: ItemService = Depends(),
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> Page[ItemRead]:
    return svc.list(owner_id=user.id, cursor=cursor, limit=limit)


@router.post("", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
def create_item(user: CurrentUser, data: ItemCreate, svc: ItemService = Depends()) -> ItemRead:
    return svc.create(owner_id=user.id, data=data)


@router.get("/{item_id}", response_model=ItemRead)
def get_item(user: CurrentUser, item_id: UUID, svc: ItemService = Depends()) -> ItemRead:
    return svc.get(owner_id=user.id, item_id=item_id)


@router.patch("/{item_id}", response_model=ItemRead)
def update_item(
    user: CurrentUser, item_id: UUID, data: ItemUpdate, svc: ItemService = Depends()
) -> ItemRead:
    return svc.update(owner_id=user.id, item_id=item_id, data=data)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(user: CurrentUser, item_id: UUID, svc: ItemService = Depends()) -> None:
    svc.delete(owner_id=user.id, item_id=item_id)
```

**Why:** the canonical thin CRUD router. It depends on `ItemService` (FastAPI injects the
session into the service), declares DTO response models + the `Problem` responses (so
problem+json shapes are typed into OpenAPI), and returns only DTOs. `Page[ItemRead]` is the
cursor envelope Phase 4's `useInfiniteQuery` consumes.

---

### Step 15 — `routers/push.py` (thin, depends on PushService)

**Files:** `products/_template/api/src/template_api/routers/push.py`.

**Contents:**
```python
from fastapi import APIRouter, Depends, status

from ..auth import CurrentUser
from ..schemas.push import PushTokenCreate, PushTokenRead
from ..services.push_service import PushService

router = APIRouter(prefix="/v1/push-tokens", tags=["push"])


@router.post("", response_model=PushTokenRead, status_code=status.HTTP_201_CREATED)
def register_token(
    user: CurrentUser, data: PushTokenCreate, svc: PushService = Depends()
) -> PushTokenRead:
    return svc.register(user_id=user.id, data=data)
```

**Why:** the `/v1/push-tokens` registration endpoint of the templated push loop. The
`send_push()` service method and the scheduled prune are exercised in Phase 8; this router
provides token registration in the locked thin shape.

---

### Step 16 — `main.py` (app wiring)

**Files:** `products/_template/api/src/template_api/main.py`.

**Contents:**
```python
from fastapi import FastAPI
from slowapi.middleware import SlowAPIMiddleware

from .errors import register_exception_handlers
from .middleware import install_request_id
from .routers import hello, items, me, push
from .schemas.common import StrictDTO
from .security import build_limiter, install_security


class Health(StrictDTO):
    status: str


def create_app() -> FastAPI:
    app = FastAPI(title="template_api", version="0.0.0")

    # Order: request_id (outermost) -> security/CORS/headers -> rate limit.
    install_request_id(app)
    install_security(app)
    app.state.limiter = build_limiter()
    app.add_middleware(SlowAPIMiddleware)

    register_exception_handlers(app)

    @app.get("/healthz", response_model=Health, tags=["health"])
    def healthz() -> Health:
        return Health(status="ok")

    app.include_router(hello.router)
    app.include_router(me.router)
    app.include_router(items.router)
    app.include_router(push.router)
    return app


app = create_app()
```

**Commands:**
```bash
cd products/_template/api
uv run uvicorn template_api.main:app --reload --port 8000   # or: pnpm --filter @platform/template-api dev
```

**Why:** single composition root. `/healthz` is unauthenticated and rate-limit-light for
the curl Verify and Fly health checks. Middleware order matters: request_id outermost so
every response (including errors) echoes `X-Request-Id`; slowapi installed last so its 429
is caught by the registered handler and rendered problem+json.

---

### Step 17 — `export_openapi.py`

**Files:** `products/_template/api/src/template_api/export_openapi.py`.

**Contents:**
```python
import json
from pathlib import Path

from .main import app

OUTPUT = Path(__file__).resolve().parents[3] / "openapi.json"  # products/_template/api/openapi.json


def main() -> None:
    schema = app.openapi()
    OUTPUT.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
```

**Commands:**
```bash
pnpm --filter @platform/template-api openapi   # or: uv run python -m template_api.export_openapi
```

**Why:** writes `app.openapi()` JSON with **sorted keys** (stable diffs for the Phase 4
drift check), **no running server needed**. The `openapi` turbo task (Step 1) declares this
file as its output.

> ⚠️ **OPEN / TO CONFIRM (output path):** `parents[3]` resolves
> `src/template_api/export_openapi.py` → the `api/` root. Verify the depth matches the final
> layout; Phase 4's `openapi-ts.config.ts` reads `../api/openapi.json`.

---

### Step 18 — `seed.py` + `tasks.py`

**Files:** `products/_template/api/src/template_api/seed.py`,
`.../template_api/tasks.py`.

**Contents** — `seed.py`:
```python
from sqlmodel import Session

from .db import get_engine
from .models import Item

SEED_OWNER = "00000000-0000-0000-0000-000000000001"  # local dev placeholder user


def main() -> None:
    with Session(get_engine()) as session:
        for i in range(1, 26):
            session.add(Item(owner_id=SEED_OWNER, title=f"Seed item {i}", description="seeded"))
        session.commit()
    print("seeded 25 items")


if __name__ == "__main__":
    main()
```

`tasks.py`:
```python
"""Lightweight scheduled jobs run on Fly scheduled machines (no queue infra).

Phase 8 wires the Fly scheduled machine that invokes `prune-stale-tokens`.
"""

import sys

from sqlmodel import Session

from .db import get_engine
from .services.push_service import PushService


def prune_stale_tokens() -> None:
    with Session(get_engine()) as session:
        removed = PushService(session=session).prune_stale()
        print(f"pruned {removed} stale push tokens")


def main(argv: list[str]) -> int:
    if argv and argv[0] == "prune-stale-tokens":
        prune_stale_tokens()
        return 0
    print("usage: python -m template_api.tasks prune-stale-tokens")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
```

**Commands:**
```bash
pnpm --filter @platform/template-api seed
uv run python -m template_api.tasks prune-stale-tokens
```

**Why:** `seed.py` is the per-product local dev data (Operational defaults). `tasks.py` is
the lightweight `tasks` module run on **Fly scheduled machines** (Background/scheduled jobs
bullet); the template ships the prune-stale-push-tokens example. Note `PushService(session=...)`
can be constructed directly here because its `__init__` default is only a FastAPI `Depends`
marker — outside a request we pass a real session.

---

### Step 19 — `alembic.ini` + `alembic/env.py` (migrate over 5432)

**Files:** `products/_template/api/alembic.ini`,
`products/_template/api/alembic/env.py`, `.../alembic/script.py.mako`,
`.../alembic/versions/` (dir).

**Contents** — `alembic.ini` (trimmed to essentials; URL comes from env in `env.py`):
```ini
[alembic]
script_location = alembic
prepend_sys_path = src
version_path_separator = os

[loggers]
keys = root,sqlalchemy,alembic
[handlers]
keys = console
[formatters]
keys = generic
[logger_root]
level = WARNING
handlers = console
qualname =
[logger_sqlalchemy]
level = WARNING
handlers =
qualname = sqlalchemy.engine
[logger_alembic]
level = INFO
handlers =
qualname = alembic
[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic
[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
```

`alembic/env.py`:
```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

from template_api.models import Item, PushToken  # noqa: F401  (register tables on metadata)
from template_api.settings import get_settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Key ruling #4: Alembic migrates over the DIRECT port (5432), NOT the pooler.
config.set_main_option("sqlalchemy.url", get_settings().database_migration_url)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

**Commands:**
```bash
cd products/_template/api
uv run alembic init -t generic alembic   # then replace env.py/alembic.ini with the above
```

**Why:** schema changes are **Alembic-only** (DB conventions). `env.py` reads
`DATABASE_MIGRATION_URL` so migrations run over the direct **5432** port (Key ruling #4 —
the pooler breaks Alembic's DDL transactions/prepared statements). Importing the models
registers them on `SQLModel.metadata` for autogenerate.

---

### Step 20 — Initial migration (tables + RLS deny-all)

**Files:** `products/_template/api/alembic/versions/0001_initial.py`.

**Contents** (hand-authored to include the raw RLS statements — autogenerate won't emit
those):
```python
"""initial: item + push_token tables, RLS deny-all on every table"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "item",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("title", sqlmodel.AutoString(length=200), nullable=False),
        sa.Column("description", sqlmodel.AutoString(length=2000), nullable=True),
        sa.Column("owner_id", sqlmodel.AutoString(), nullable=False),
    )
    op.create_index("ix_item_owner_id", "item", ["owner_id"])
    op.create_index("ix_item_title", "item", ["title"])

    op.create_table(
        "push_token",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("user_id", sqlmodel.AutoString(), nullable=False),
        sa.Column("device_id", sqlmodel.AutoString(length=200), nullable=False),
        sa.Column("expo_token", sqlmodel.AutoString(length=255), nullable=False),
        sa.UniqueConstraint("user_id", "device_id", name="uq_push_user_device"),
    )
    op.create_index("ix_push_token_user_id", "push_token", ["user_id"])

    # RLS DENY-ALL on every table (DB conventions + Realtime bullet). The API connects
    # with a privileged role that BYPASSES RLS; PostgREST/Realtime (anon/authenticated
    # roles) get nothing until a per-table policy is added where Realtime reads are wanted.
    for table in ("item", "push_token"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")
        # No CREATE POLICY -> default deny for non-bypassing roles.


def downgrade() -> None:
    op.drop_table("push_token")
    op.drop_table("item")
```

**Commands:**
```bash
cd products/_template/api
uv run alembic upgrade head     # applies over DATABASE_MIGRATION_URL (5432)
```

**Why:** the locked DB conventions — **RLS deny-all on every table** via the template's
initial migration, schema changes only via Alembic. Enabling RLS with **no policy** denies
all access to non-bypassing roles (anon/authenticated used by PostgREST + Realtime), keeping
the schema private; the API's privileged role bypasses RLS so the service layer still reads
and writes. `FORCE ROW LEVEL SECURITY` ensures even the table owner is subject to policies
(defense in depth). This is the foundation of the broadcast-only Realtime pattern.

> **Privileged role (resolved):** connect `DATABASE_URL` / `DATABASE_MIGRATION_URL` as the
> Supabase **`postgres`** role, which has **`BYPASSRLS`**. `BYPASSRLS` (and superuser) skip RLS
> *even with* `FORCE ROW LEVEL SECURITY`, so the service layer's own queries still read/write
> `item`/`push_token` after the deny-all migration, while the anon/authenticated roles
> PostgREST + Realtime use get nothing. Do NOT connect as `authenticated`/`anon` (they would be
> blocked by the deny-all). `FORCE` is redundant for a `BYPASSRLS` connection but kept for
> defense-in-depth. Confirm the exact credentials when the Supabase project exists, and add an
> integration test that reads `item` back after the deny-all migration to prove the runtime
> role bypasses (⚠️ REVIEW: exact role/credentials are project-specific).

---

### Step 21 — `Dockerfile` (multi-stage uv)

**Files:** `products/_template/api/Dockerfile`, `products/_template/api/.dockerignore`.

**Contents** — `Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM python:3.13-slim-bookworm AS runtime
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
COPY --from=builder /app /app
EXPOSE 8000
CMD ["uvicorn", "template_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`.dockerignore`:
```
.venv
__pycache__
tests
*.pyc
.pytest_cache
.ruff_cache
```

**Commands:**
```bash
cd products/_template/api
docker build -t template-api:dev .
```

**Why:** multi-stage on `ghcr.io/astral-sh/uv` exactly as specified — `uv sync --frozen
--no-dev` in the builder, slim Python runtime. Splitting the dependency sync from the
project copy maximizes layer caching. The runtime stage carries only the resolved `.venv` +
source.

---

### Step 22 — `fly.staging.toml` + `fly.production.toml` (release_command alembic)

**Files:** `products/_template/api/fly.staging.toml`,
`products/_template/api/fly.production.toml`.

**Contents** — `fly.staging.toml`:
```toml
app = "example-template-api-stg"
primary_region = "iad"

[build]
dockerfile = "Dockerfile"

[deploy]
# Alembic runs as the Fly release command, over DATABASE_MIGRATION_URL (5432). Ruling #4.
release_command = "alembic upgrade head"

[env]
ENVIRONMENT = "staging"

[http_service]
internal_port = 8000
force_https = true
auto_stop_machines = "stop"
auto_start_machines = true
min_machines_running = 0

[[http_service.checks]]
method = "GET"
path = "/healthz"
interval = "15s"
timeout = "2s"
```

`fly.production.toml` is identical except:
```toml
app = "example-template-api-prod"
[env]
ENVIRONMENT = "production"
# production: min_machines_running = 1 under [http_service]
```

**Commands:** (deploy is Phase 8 / generator infra checklist)
```bash
flyctl deploy -c fly.staging.toml    # after `fly apps create example-template-api-stg` + secrets
```

**Why:** staging + production apps named `<org>-<product>-<env>` → `example-template-api-stg`
/ `example-template-api-prod`. The `release_command` runs `alembic upgrade head` on every
deploy (Key ruling #4) so schema migrates over the direct port before the new machines take
traffic. `DATABASE_URL` / `DATABASE_MIGRATION_URL` / JWT / service-role values are **Fly
secrets**, never committed (Env/config bullet).

---

### Step 23 — `tests/conftest.py` (real Postgres, per-test rollback, polyfactory)

**Files:** `products/_template/api/tests/__init__.py`,
`products/_template/api/tests/conftest.py`, `.../tests/factories.py`.

**Contents** — `conftest.py`:
```python
import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.pool import NullPool
from sqlmodel import Session, SQLModel, create_engine

from template_api.auth import get_current_user
from template_api.db import get_session
from template_api.main import create_app
from template_api.schemas.user import MeRead

TEST_OWNER = "11111111-1111-1111-1111-111111111111"

# Real Postgres (Supabase local in dev; postgres service container in CI). NOT sqlite.
TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/postgres",
)


@pytest.fixture(scope="session")
def engine() -> Engine:
    eng = create_engine(TEST_DB_URL, poolclass=NullPool, connect_args={"prepare_threshold": None})
    SQLModel.metadata.create_all(eng)   # tests build the schema directly (no RLS needed in test role)
    return eng


@pytest.fixture
def session(engine: Engine) -> Generator[Session, None, None]:
    # Per-test transaction rollback: open a connection + outer transaction, bind the
    # Session to it, roll back at teardown so each test sees a clean DB. Never mock the session.
    #
    # CRITICAL (SQLAlchemy 2.0): services call self.session.commit(), and in 2.0 commit()
    # commits the OUTERMOST transaction — so without join_transaction_mode the service's
    # commit() would commit the outer `trans` the fixture means to roll back, the teardown
    # rollback would undo nothing, and rows would leak across tests (e.g. the 25-item cursor
    # test pollutes later tests). Binding with join_transaction_mode="create_savepoint" makes
    # each application-level commit() land on a SAVEPOINT inside the outer transaction, so the
    # outer rollback discards everything. (Alternative: begin_nested() + an after_transaction_end
    # restart listener.)
    connection = engine.connect()
    trans = connection.begin()
    with Session(bind=connection, join_transaction_mode="create_savepoint") as s:
        yield s
    trans.rollback()
    connection.close()


@pytest.fixture
def client(session: Session) -> Generator[TestClient, None, None]:
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def auth_client(session: Session) -> Generator[TestClient, None, None]:
    # Override auth to a fixed test user so router tests don't need a real JWT.
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_current_user] = lambda: MeRead(id=TEST_OWNER, email="t@example.com")
    yield TestClient(app)
    app.dependency_overrides.clear()
```

`factories.py` (polyfactory):
```python
from polyfactory.factories.pydantic_factory import ModelFactory

from template_api.schemas.item import ItemCreate
from template_api.schemas.push import PushTokenCreate


class ItemCreateFactory(ModelFactory[ItemCreate]):
    __model__ = ItemCreate


class PushTokenCreateFactory(ModelFactory[PushTokenCreate]):
    __model__ = PushTokenCreate
```

**Commands:**
```bash
# dev: bring up real Postgres (Phase 6 wires the full Supabase stack)
supabase start            # or: docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/postgres \
  pnpm --filter @platform/template-api test
```

**Why:** the Testing strategy rows — API integration runs **pytest + httpx against real
Postgres** (Supabase local in dev, **postgres service container** in CI) with **per-test
transaction rollback**, exercising UUIDv7 + real SQL; **polyfactory** supplies test data.
The session is overridden into a rollback-bound transaction (with
`join_transaction_mode="create_savepoint"`, so service `commit()` calls land on a savepoint
the outer rollback discards — see the inline note) and is **never mocked** for integration.
The `auth_client` override lets router tests run without minting JWTs (real JWT paths are
tested directly in `test_auth.py`).

> **Sync `TestClient` is correct here** — it is built on httpx and is unaffected by the
> deprecation of the `app=` shortcut. If a future test needs to drive an `async def` router
> over HTTP, use `httpx.AsyncClient(transport=ASGITransport(app=app))` (the `AsyncClient(app=...)`
> shortcut was removed in httpx 0.27 — never `AsyncClient(app=app)`), under
> `@pytest.mark.asyncio`. `send_push()` is already covered by calling the coroutine directly
> with an injected mock-transport client (Phase 8 `test_push.py`).

> **Test schema build (resolved):** `SQLModel.metadata.create_all(engine)` for the test DB is
> fine and faster than running Alembic per session, since the test role owns/bypasses RLS.
> **But `create_all` silently skips the RLS deny-all** — those are raw `op.execute(...)`
> statements in the migration, not in the metadata — so the migration's most important effect
> goes untested. Add **one** dedicated test that runs `alembic upgrade head` against the test
> URL and asserts RLS is on, e.g.
> `SELECT relrowsecurity FROM pg_class WHERE relname IN ('item','push_token')` returns true for
> both. Keep `create_all` for all other tests.

---

### Step 24 — `tests/test_items.py` + `tests/test_auth.py`

**Files:** `products/_template/api/tests/test_items.py`,
`products/_template/api/tests/test_auth.py`.

**Contents** — `test_items.py` (CRUD + paging + problem+json + DTO/ORM separation):
```python
from fastapi.testclient import TestClient

from tests.factories import ItemCreateFactory


def test_create_then_get_returns_dto(auth_client: TestClient) -> None:
    payload = ItemCreateFactory.build().model_dump()
    created = auth_client.post("/v1/items", json=payload)
    assert created.status_code == 201
    body = created.json()
    # DTO shape only — owner_id is set server-side; NO SQLModel internals leak.
    assert set(body) == {"id", "title", "description", "owner_id", "created_at", "updated_at"}
    got = auth_client.get(f"/v1/items/{body['id']}")
    assert got.status_code == 200
    assert got.json()["id"] == body["id"]


def test_list_is_cursor_paginated(auth_client: TestClient) -> None:
    for _ in range(25):
        auth_client.post("/v1/items", json=ItemCreateFactory.build().model_dump())
    first = auth_client.get("/v1/items?limit=20").json()
    assert len(first["items"]) == 20
    assert first["next_cursor"] is not None
    second = auth_client.get(f"/v1/items?limit=20&cursor={first['next_cursor']}").json()
    assert len(second["items"]) == 5
    assert second["next_cursor"] is None
    ids = {i["id"] for i in first["items"]} | {i["id"] for i in second["items"]}
    assert len(ids) == 25  # no overlap across pages


def test_missing_item_is_problem_json(auth_client: TestClient) -> None:
    resp = auth_client.get("/v1/items/00000000-0000-0000-0000-0000000000ff")
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/problem+json")
    body = resp.json()
    assert body["status"] == 404 and body["title"] and body["instance"]


def test_unauthenticated_is_401_problem_json(client: TestClient) -> None:
    resp = client.get("/v1/items")
    assert resp.status_code == 401
    assert resp.headers["content-type"].startswith("application/problem+json")
```

`test_auth.py` (JWT paths — unit-level, mock external HTTP per mocking conventions). NOTE:
these mint HS256 tokens directly to exercise the fallback branch; they stay valid but no
longer mirror the live local stack (a current Supabase CLI issues ES256 → the JWKS branch):
```python
import datetime as dt

import jwt
import pytest
from fastapi import Request

from template_api.auth import get_current_user
from template_api.errors import ProblemException
from template_api.settings import Settings

SECRET = "local-test-secret"


def _request_with(token: str | None) -> Request:
    headers = [(b"authorization", f"Bearer {token}".encode())] if token else []
    return Request({"type": "http", "headers": headers, "path": "/v1/me"})


def _hs256_settings() -> Settings:
    return Settings(
        database_url="postgresql+psycopg://x", database_migration_url="postgresql+psycopg://x",
        supabase_url=None, supabase_jwt_secret=SECRET,
    )  # pyright: ignore[reportCallIssue]


def test_hs256_local_fallback_accepts_valid_token() -> None:
    token = jwt.encode(
        {"sub": "user-123", "email": "a@b.c", "aud": "authenticated",
         "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1)},
        SECRET, algorithm="HS256",
    )
    user = get_current_user(_request_with(token), _hs256_settings())
    assert user.id == "user-123"


def test_missing_bearer_raises_401() -> None:
    with pytest.raises(ProblemException) as exc:
        get_current_user(_request_with(None), _hs256_settings())
    assert exc.value.status == 401


def test_bad_signature_raises_401() -> None:
    token = jwt.encode({"sub": "x", "aud": "authenticated"}, "wrong-secret", algorithm="HS256")
    with pytest.raises(ProblemException) as exc:
        get_current_user(_request_with(token), _hs256_settings())
    assert exc.value.status == 401
```

**Commands:**
```bash
pnpm --filter @platform/template-api test
```

**Why:** covers the Testing strategy API rows — service/router CRUD round-trips, cursor
paging edges, **problem+json shapes**, **401s**, and **DTO/ORM separation** (asserting the
response body keys are exactly the DTO fields). `test_auth.py` mints HS256 tokens directly
and exercises the HS256 fallback branch + failure paths; **these tests stay valid** (they
verify the fallback logic itself) but **note: they no longer mirror the live local stack** —
a current Supabase CLI issues ES256, so the real local happy path is the JWKS branch (which
needs a live/mocked JWKS endpoint — covered in Phase 6 against the Supabase local stack).
External HTTP (Expo Push) is mocked via httpx mock transport in push tests; integration tests
hit the real DB.

---

## Gotchas & pitfalls

- **Pooler 6543 is transaction-mode; use psycopg3.** Runtime app traffic goes over the
  **transaction-mode** Supavisor pooler (6543) for serverless-friendly autoscaling; it does
  not reliably keep server-side prepared statements (connections are reassigned per
  transaction), so they break. (Correction: session mode was **NOT removed** — Supavisor
  deprecated session mode *on the 6543 pooler* on 2025-02-28; session mode and direct
  connections still live on **5432**. The 2024 event was the PgBouncer→Supavisor migration +
  IPv4 deprecation for direct connections.) Runtime MUST use **psycopg v3**
  (`postgresql+psycopg://`), **`NullPool`**, and **`connect_args={"prepare_threshold": None}`**.
  Symptom if wrong: intermittent `prepared statement "..." does not exist` /
  `DuplicatePreparedStatement` errors under the pooler. NullPool has a documented latency cost
  (≈200ms default-pool vs ≈800ms NullPool in one benchmark) — acceptable for the template;
  note it for high-throughput products. (Key ruling #4.)
- **Alembic MUST use the direct 5432 URL.** Migrations run DDL in transactions that the
  transaction-mode pooler mishandles. `env.py` reads `DATABASE_MIGRATION_URL` (5432), and
  the Fly `release_command` runs over it — never point Alembic at 6543. (Key ruling #4.)
- **JWKS is primary everywhere; HS256 is a genuine fallback only.** New Supabase projects
  sign asymmetrically AND the current local CLI (v2.71.1+) issues **ES256** by default — so
  JWKS verification (`PyJWKClient`, ES256/RS256, cached) is the **primary path on ALL
  environments, including local** (point `SUPABASE_URL` at `http://localhost:54321`). HS256 +
  `SUPABASE_JWT_SECRET` is kept ONLY for older CLIs, self-hosted symmetric secrets, and
  manually-minted test tokens — it is NOT the local happy path. Always set
  `audience="authenticated"`. (Key ruling #5.)
- **DTOs never serialize ORM models.** Routers return `schemas/` DTOs only; services call
  `ItemRead.model_validate(orm_row)` (`from_attributes=True`) to map. Returning a SQLModel
  table instance from a router leaks persistence internals and lazy-load surprises across
  the HTTP boundary — forbidden by the locked architecture. The DTO/ORM-separation test
  asserts the exact response key set to catch regressions.
- **RLS deny-all + privileged-role bypass.** Enabling RLS with **no policy** denies all
  access to the anon/authenticated roles PostgREST + Realtime use, keeping the schema
  private (the broadcast-only Realtime pattern depends on this). The API connects with a
  **privileged/BYPASSRLS role** so the service layer still works. Forgetting `ENABLE ROW
  LEVEL SECURITY` on a new table silently opens it — every new table needs the deny-all in
  its migration.
- **pyright strict means no implicit `Any`.** `typeCheckingMode = "strict"` rejects untyped
  defs and implicit `Any`. Annotate every function (including test helpers); use
  `# pyright: ignore[reportCallIssue]` only where pydantic-settings pulls values from env at
  runtime (the `Settings()` no-arg construction). Pydantic strict mode (`strict=True` on the
  DTO base) similarly rejects loose coercion — send correctly typed JSON in tests.
- **Python turbo `inputs` globs are mandatory.** The `openapi`/`lint`/`test` tasks must
  declare `inputs` (`src/**/*.py`, `pyproject.toml`, `uv.lock`) or Turborepo's cache keys
  are wrong and stale results get served. (turbo.json notes.)
- **`DELETE`/`UPDATE` go through `session.execute(...)`, never `session.exec(...)`.**
  SQLModel's `Session.exec()` is typed/designed for `select()` only — passing a `delete()` or
  `update()` statement is a **pyright-strict type error** (fastapi/sqlmodel #909) so Verify 7
  would fail, and the returned object wouldn't expose `.rowcount`. Use SQLAlchemy's
  `self.session.execute(delete(...))` (already on `Session`, import nothing new); its `Result`
  exposes `.rowcount` (`PushService.prune_stale`, and any future `update()` path). A plain
  scalar-column `select(...)` via `.exec()` is fine — only `delete()`/`update()` are the issue.
  (Key ruling DB conventions.)
- **Service `__init__` default is a `Depends` marker, not a real session.** Inside a
  request, FastAPI resolves `BaseService(session=Depends(get_session))`. Outside a request
  (`seed.py`, `tasks.py`, tests constructing a service directly), pass a real `Session`
  explicitly: `PushService(session=session)`.
- **`uv sync --frozen` requires a committed `uv.lock`.** The Dockerfile and CI use
  `--frozen`; run `uv sync` (without `--frozen`) once locally to generate/refresh
  `uv.lock`, and commit it. (Package management model — own `uv.lock` per api.)

---

## Verification

Each maps to a DoD / PHILOSOPHY.md Verify item. Run from repo root unless noted.

1. **dev + /healthz (Verify 1).**
   ```bash
   pnpm --filter @platform/template-api dev &     # or: turbo run dev --filter=*template-api
   curl -s localhost:8000/healthz
   ```
   Expected: `{"status":"ok"}` (HTTP 200), response carries an `X-Request-Id` header.

2. **Items CRUD + paging (Verify 2).** With a valid bearer token — either a hand-minted HS256
   token exercising the fallback branch (no live Supabase stack needed; the real ES256/JWKS
   local path is wired in Phase 6), or via the test suite:
   ```bash
   TOKEN=...   # a hand-minted HS256 token signed with SUPABASE_JWT_SECRET, aud=authenticated
               #   (fallback branch; the live local CLI issues ES256 → JWKS, exercised in Phase 6)
   curl -s -X POST localhost:8000/v1/items -H "Authorization: Bearer $TOKEN" \
        -H 'content-type: application/json' -d '{"title":"a","description":null}'
   curl -s "localhost:8000/v1/items?limit=20" -H "Authorization: Bearer $TOKEN"
   ```
   Expected: POST → 201 with a DTO body; GET → `{"items":[...],"next_cursor":"..."|null}`;
   `?cursor=<next_cursor>` returns the next page with no overlap. (Covered by
   `test_list_is_cursor_paginated`.)

3. **problem+json errors (Verify 3).**
   ```bash
   curl -s -i localhost:8000/v1/items/00000000-0000-0000-0000-0000000000ff \
        -H "Authorization: Bearer $TOKEN"
   ```
   Expected: `HTTP/1.1 404`, `content-type: application/problem+json`, body with
   `type`/`title`/`status`/`instance`.

4. **429 on rate limit (Verify 4).**
   ```bash
   for i in $(seq 1 120); do curl -s -o /dev/null -w "%{http_code}\n" localhost:8000/v1/hello; done | sort | uniq -c
   ```
   Expected: a run of `200` then `429` once the per-IP `100/minute` default is exceeded; the
   429 body is `application/problem+json`.

5. **CORS preflight from web origin (Verify 5).**
   ```bash
   curl -s -i -X OPTIONS localhost:8000/v1/items \
        -H "Origin: http://localhost:8081" \
        -H "Access-Control-Request-Method: GET"
   ```
   Expected: `200/204` with `Access-Control-Allow-Origin: http://localhost:8081` (the web
   origin is in `CORS_ORIGINS`). An origin NOT in the allowlist gets no allow header.

6. **DTOs returned, no ORM leakage (Verify 6).** `pnpm --filter @platform/template-api test`
   → `test_create_then_get_returns_dto` passes, asserting the response key set is exactly the
   DTO fields.

7. **pyright clean strict (Verify 7).**
   ```bash
   pnpm --filter @platform/template-api lint     # ruff check + ruff format --check + pyright
   ```
   Expected: `0 errors, 0 warnings` from pyright (strict mode).

8. **seed.py populates DB (Verify 8).**
   ```bash
   pnpm --filter @platform/template-api migrate   # alembic upgrade head (5432)
   pnpm --filter @platform/template-api seed
   ```
   Expected: `seeded 25 items`; querying `/v1/items` for the seed owner returns them.

9. **turbo run test lint (Verify 9).**
   ```bash
   TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/postgres \
     turbo run test lint --filter=*template-api
   ```
   Expected: green, against a real Postgres (service container in CI).

10. **docker build (Verify 10).**
    ```bash
    cd products/_template/api && docker build -t template-api:dev .
    ```
    Expected: image builds through both stages; `docker run -e DATABASE_URL=... -p 8000:8000
    template-api:dev` then serves `/healthz`.

---

## Commits

Suggested commit sequence on a feature branch (one phase = one or a few logical commits):

1. `feat(template-api): scaffold uv project + settings + db (psycopg3/NullPool, migration URL)`
   — Steps 1–3.
2. `feat(template-api): errors (problem+json) + cursor pagination` — Steps 4–5.
3. `feat(template-api): models (UUIDv7 base, item, push_token) + services + schemas` — Steps 6–8.
4. `feat(template-api): auth (JWKS+HS256, CurrentUser) + security (CORS/headers/slowapi) + request_id` — Steps 9–11.
5. `feat(template-api): routers (hello/me/items/push) + main wiring + export_openapi` — Steps 12–17.
6. `feat(template-api): seed + tasks + alembic initial migration (RLS deny-all)` — Steps 18–20.
7. `chore(template-api): Dockerfile + fly tomls (release_command alembic)` — Steps 21–22.
8. `test(template-api): real-Postgres conftest (per-test rollback) + polyfactory + items/auth tests` — Steps 23–24.

> Hooks: pre-commit runs Ruff check+format on staged `.py` (scoped to this api); pre-push
> runs `turbo run typecheck test build --affected` plus pyright strict + pytest for the
> affected api. Ensure a real Postgres is reachable before pushing (or CI's service
> container will be the first to run the integration tests).

---

## Open questions / deferred

- **UUIDv7 generator library — RESOLVED** — use the maintained **`uuid-utils`**
  (`from uuid_utils import uuid7`, returns a stdlib-compatible UUID) or **`uuid6`**
  (`from uuid6 import uuid7`), pinned exact; NOT the stale 2021 `uuid7`/`uuid_extensions`
  package (Python 3.13 has no stdlib `uuid7` — that lands in 3.14). **App-side generation is
  the locked choice: do NOT depend on Postgres-native `uuidv7()`, so the template is
  PG-version-independent and works on any Supabase Postgres today.** The only remaining
  confirm is pinning the exact current `uuid-utils` version at install (Step 1, Step 6).
- **Cursor envelope field names — RESOLVED** — keep `{ items, next_cursor }` + opaque
  base64-on-`id`; matches best practice + UUIDv7 monotonic keyset. Phase 4 `features/home` must
  match these names (Step 5).
- **Per-user rate-limit key — RESOLVED** — key on the verified-decode JWT **`sub`** claim
  (unverified decode for bucketing only; real auth verifies elsewhere), fall back to IP for
  anonymous; `100/minute` stays the env-driven default (Step 10).
- **Privileged/BYPASSRLS role — RESOLVED** — connect as the Supabase **`postgres`** role
  (`BYPASSRLS`, bypasses even `FORCE RLS`); ⚠️ REVIEW the exact credentials when the project
  exists, and add a read-after-deny-all integration test (Step 20).
- **⚠️ export_openapi output path depth** (`parents[3]`) — verify against the final layout;
  Phase 4 reads `../api/openapi.json` (Step 17). *(Out of domain for this review.)*
- **Test schema build — RESOLVED** — keep `SQLModel.metadata.create_all` for the test DB;
  add ONE test running `alembic upgrade head` + asserting `relrowsecurity` is true for
  `item`/`push_token`, since `create_all` skips the raw RLS statements (Step 23).
- **Deferred to Phase 4** — `api-client/` generation, turbo openapi→client→app ordering,
  the contract drift check.
- **Deferred to Phase 6** — Supabase local stack wiring, real JWKS verification against the
  local stack, the protected `/v1/me` end-to-end with sign-up.
- **Deferred to Phase 8** — full structlog JSON logging + Sentry request_id tagging in
  `middleware.py`; the `send_push()` send path + realtime broadcast (service-role HTTP
  call); the Fly scheduled machine invoking `tasks.py prune-stale-tokens`; CI Postgres
  service container wiring in `ci.yml`; `deploy-api.yml` Fly deploys.
- **Deferred (PHILOSOPHY-level)** — ADRs vs ARCHITECTURE.md decision-record format.
