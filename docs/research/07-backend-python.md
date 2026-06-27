# FastAPI/Python backend — accuracy review (June 2026)

## Summary

**Checked: 31 claims** across FastAPI, Pydantic v2, SQLModel, Alembic/SQLAlchemy 2.x, uv,
Ruff, pyright, psycopg3 + Supabase pooler, slowapi, structlog, RFC 9457 problem+json,
polyfactory, UUIDv7, and cursor pagination.

- ✅ Correct / current: **19**
- ⚠️ Imprecise, risky, or needs a tweak: **9**
- ❌ Wrong / will break as written: **3**
- ❓ Unverifiable from public docs (deployment-specific): **0** (all OPEN items resolved below)

**Headline:** The architecture is sound and the versioned tooling choices (FastAPI lifespan,
Pydantic v2 strict, uv multi-stage Docker, Ruff, pyright strict, slowapi, structlog,
polyfactory, RFC 9457) are essentially all current and correct. **Three concrete code bugs
will break at runtime/typecheck as written**: (1) the UUIDv7 import (`from uuid_extensions
import uuid7`) targets a package that has been unmaintained since 2021 and is the wrong dist
name; (2) `session.exec(delete(...))` is not supported by SQLModel and fails pyright strict
*and* lacks `.rowcount`; (3) the "Supabase session mode removed 2025" justification in Key
ruling #4 is factually wrong (session mode still exists on 5432) — though the *remedy*
(psycopg3 + `prepare_threshold=None` + NullPool) is correct. Everything else is polish.

**Verdict: APPROVE WITH CHANGES.** The plan is buildable; fix the three ❌ items before
stamping `demo`, and apply the ⚠️ tweaks for robustness.

---

## Findings

### 1. FastAPI version + lifespan + exception handlers
- **Location:** PHILOSOPHY.md L34, L52; phase-3 Step 4, Step 16; phase-8 (a).
- **Claim:** FastAPI with Pydantic v2; `register_exception_handlers`; (phase-8) request-id
  middleware. The guides use `@app.exception_handler(...)` and never use deprecated
  `@app.on_event`.
- **Status:** ✅
- **Finding:** Current stable FastAPI is **0.124.4** (released 2025-12-12). `@app.on_event`
  is deprecated in favor of `lifespan`; the guides correctly avoid `on_event`. The exception
  handler pattern (`@app.exception_handler(ExcType)` returning a `JSONResponse`) is current
  and correct. One minor gap: **neither guide actually defines a `lifespan`** — Phase 3
  builds the app with `create_app()` and no startup/shutdown hook. That is fine (nothing
  needs startup yet; the engine is lazily created), but if a product later needs warm-up
  (e.g. JWKS prefetch, engine disposal), use the `lifespan=` async context manager, not
  `on_event`.
- **Recommended change:** None required. Optionally note in the api CLAUDE.md that any
  startup/shutdown logic must use `lifespan`, never `on_event`.
- **Sources:** FastAPI release notes / PyPI; FastAPI "Lifespan Events" docs.

### 2. Pydantic v2 strict mode via `ConfigDict(strict=True)`
- **Location:** phase-3 Step 5, Step 8 (`StrictDTO`, `Problem`, `Page`).
- **Claim:** `model_config = ConfigDict(strict=True, from_attributes=True)` enforces Pydantic
  strict mode.
- **Status:** ✅ (with one caveat → see Finding 3)
- **Finding:** `ConfigDict(strict=True)` is the correct, current way to enable strict mode
  model-wide in Pydantic v2; field-level `Field(strict=False)` overrides are supported. The
  pattern is right.
- **Recommended change:** None.
- **Sources:** Pydantic "Strict Mode" + "Configuration" docs.

### 3. `ItemRead.model_validate(orm_row)` under `strict=True`
- **Location:** phase-3 Step 7 (`ItemService` maps via `ItemRead.model_validate(r)`), Step 8.
- **Claim:** With `strict=True, from_attributes=True`, `model_validate()` of a SQLModel ORM
  row maps cleanly to the DTO.
- **Status:** ⚠️
- **Finding:** This works **only because** the ORM attributes are already native instances
  (`uuid.UUID`, `datetime`, `str`), and Pydantic strict mode *accepts native instances* of
  `UUID`/`datetime`/`str` from Python input. So the happy path is fine. The risk: strict mode
  is unforgiving — if any column comes back as a non-native type (e.g. a `str` UUID from a raw
  SQL row, a naive `datetime`, an `int` where `str` is annotated), `model_validate` raises.
  Strict mode "only allows instances of the type" from Python input (string→datetime coercion
  is allowed for *JSON* input only, not attribute input). Since `ItemRead` is validated from
  ORM attributes (Python input), the leniency does not apply. This is robust for the locked
  schema but is a latent footgun the api CLAUDE.md should call out.
- **Recommended change:** Add a one-line note in the DTO/ORM-separation gotcha: "strict DTOs
  validated from ORM attributes require the ORM column python-types to match the DTO
  annotations exactly (UUID instance, tz-aware datetime, str)". Consider per-field
  `Field(strict=False)` only if a coercion is ever needed.
- **Sources:** Pydantic "Strict Mode" docs (instances-only from Python input; string→date
  leniency is JSON-only).

### 4. UUIDv7 generator import — `from uuid_extensions import uuid7`
- **Location:** phase-3 Step 1 (`"uuid7"` dep), Step 6 (`from uuid_extensions import uuid7`).
- **Claim:** The PyPI `uuid7` package provides `uuid7()` importable as
  `from uuid_extensions import uuid7`, usable on Python 3.13.
- **Status:** ❌
- **Finding:** Two problems. (a) **Python 3.13 has no stdlib `uuid7`** — `uuid.uuid7()` /
  UUID versions 6/7/8 were added in **Python 3.14** (RFC 9562). On 3.13 a third-party lib is
  mandatory, which the guide knows. (b) The specific package is stale and mis-named: the dist
  that exposes `from uuid_extensions import uuid7` is the PyPI package **`uuid7`**, whose last
  release was **2021-12-29** — effectively unmaintained, and its `uuid7()` predates the final
  RFC 9562 layout. (Note: a *different* package `uuid-extension` imports as
  `from uuid_extension import uuid7` — singular — and is maintained; do not confuse them.)
  Better-maintained, RFC-9562-correct options on 3.13: **`uuid-utils`** (Rust-backed, returns
  stdlib `UUID`, actively maintained) or **`uuid6`** (`uuid6.uuid7()`).
- **Recommended change:** Replace the dependency and import. Recommended:
  `uuid-utils` (`from uuid_utils import uuid7`, returns a stdlib-compatible UUID) **or**
  `uuid6` (`from uuid6 import uuid7`). Pin exact (pre-1.0 hygiene, per the plan's own
  convention). Update the `pyproject.toml` dep `"uuid7"` → the chosen lib and the
  `models/base.py` import. Resolves the Step-1 / Step-6 OPEN flag.
- **Sources:** Python 3.14 `uuid` docs (RFC 9562, uuid6/7/8 added in 3.14); discuss.python.org
  "Add uuid7 in uuid module"; PyPI `uuid7` (2021) vs `uuid-utils` / `uuid6`.

### 5. SQLModel — version, maintenance, Pydantic v2 + SQLAlchemy 2 compatibility
- **Location:** PHILOSOPHY.md L34, L51; phase-3 deps + models.
- **Claim:** SQLModel is the table/ORM layer, compatible with Pydantic v2 + SQLAlchemy 2.
- **Status:** ✅ (maintenance is slow — see note)
- **Finding:** Latest SQLModel is **0.0.27**; it supports Pydantic v2 (since 0.0.14) and
  SQLAlchemy 2.0 (min 2.0.14). It is still **pre-1.0** and maintained at a *slow* cadence by
  the FastAPI org (tiangolo), with several long-standing rough edges (see Finding 6, and
  generic-response-model issue #1668). The choice is reasonable and current, but treat
  SQLModel as pre-1.0: pin it, and prefer SQLAlchemy-native idioms where SQLModel lags.
- **Recommended change:** Pin `sqlmodel` exact (consistent with the plan's pre-1.0 pinning
  rule). No blocker.
- **Sources:** SQLModel release notes; PyPI; fastapi/sqlmodel discussions #547/#621.

### 6. `session.exec(delete(...))` and `.rowcount` in `prune_stale` / `prune_push_tokens`
- **Location:** phase-3 Step 7 (`PushService.prune_stale`:
  `result = self.session.exec(delete(PushToken)...)` then `result.rowcount`); phase-8 (d)
  `tasks.py` (`result = session.exec(delete(PushToken)...)` then `result.rowcount`).
- **Claim:** `session.exec(delete(...))` returns a result with `.rowcount`.
- **Status:** ❌
- **Finding:** SQLModel's `Session.exec()` is **typed and designed for `select()`** — it does
  **not** support `delete()`/`update()`/`insert()` executable statements. Under **pyright
  strict** (which the plan mandates and verifies) this is a type error (`Delete` incompatible
  with the `exec` overloads — tracked as fastapi/sqlmodel #909), so Verify step 7 ("pyright
  clean in strict mode") would **fail**. At runtime you must use SQLAlchemy's
  `Session.execute(delete(...))`, whose `Result` *does* expose `.rowcount`. (Note: a plain
  `select(PushToken.expo_token)` scalar-column select via `.exec()` is fine — only the
  delete/update statements are the problem.)
- **Recommended change:** In both `prune_stale`/`prune_push_tokens`, change
  `self.session.exec(delete(...))` → `self.session.execute(delete(...))` (import nothing new;
  `Session` already exposes `execute`). Keep `.rowcount` (valid on the SQLAlchemy `Result`).
  Add the equivalent fix wherever `update()` statements appear later.
- **Sources:** fastapi/sqlmodel discussions #821 (`exec` does not support delete) + issue
  #909; SQLAlchemy 2.x "UPDATE/DELETE" docs (`Result.rowcount`).

### 7. Supabase pooler — psycopg3 + `prepare_threshold=None` + NullPool (Key ruling #4)
- **Location:** PHILOSOPHY.md L72 (Key ruling #4); phase-3 Step 3, "Gotchas".
- **Claim:** Pooler port 6543 is transaction-mode-only; **psycopg v3 + `prepare_threshold=None`
  + NullPool** is required; Alembic migrates over direct 5432.
- **Status:** ✅ (remedy correct) / ❌ (justification "session mode removed 2025" is wrong —
  Finding 8)
- **Finding:** The *technical remedy is exactly what Supabase recommends*: for psycopg3 over
  the transaction-mode pooler, "set the `prepare_threshold` to `None`" because Supavisor
  reassigns connections per-transaction and server-side prepared statements break. Pairing
  with SQLAlchemy `NullPool` (don't double-pool on top of Supavisor) is sound and commonly
  recommended. Using the direct port (5432) for Alembic DDL is correct.
- **Recommended change:** None for the engine config. (Fix the rationale per Finding 8.) Note
  the documented NullPool performance cost (≈ default-pool 200ms vs NullPool 800ms in one
  benchmark) — acceptable for the template, but worth a CLAUDE.md note for high-throughput
  products.
- **Sources:** Supabase "Using SQLAlchemy with Supabase" troubleshooting; Supabase
  discussion #28239 (Disabling Prepared Statements); Supavisor terminology doc.

### 8. "Supabase session mode removed 2025" rationale
- **Location:** PHILOSOPHY.md L72 ("session mode removed 2025"); phase-3 Step 3 comment + Gotchas
  ("Session mode was removed in 2025").
- **Claim:** Supabase session-mode pooling was removed in 2025, leaving only transaction mode
  on 6543.
- **Status:** ❌ (factually wrong; does not change the engine config)
- **Finding:** Session mode was **not** removed. Current Supabase connection options (2026):
  **direct connection** on 5432 (IPv6-only unless the IPv4 add-on); **Supavisor session mode**
  on **port 5432** (via the pooler host; IPv4-compatible, supports prepared statements, for
  persistent servers); **Supavisor transaction mode** on **6543** (for serverless/autoscaling,
  no reliable prepared statements). What *did* happen in early 2024 was **PgBouncer →
  Supavisor migration and IPv4 deprecation for direct connections** (db host → IPv6). The plan
  likely conflated those events. Practically the plan's choice still holds (a Fly-hosted API
  could use session mode, but transaction mode + the psycopg3 fix is a fine, conservative
  default), so this is a **doc-accuracy fix, not a code fix**.
- **Recommended change:** Reword Key ruling #4 and the Step-3 comment: drop "session mode
  removed 2025"; say instead "the **transaction-mode** pooler (6543) is used for serverless-
  friendly autoscaling; it does not reliably keep server-side prepared statements, so psycopg3
  `prepare_threshold=None` + NullPool are required. Session mode (5432) and direct (5432)
  remain available but are not used for runtime app traffic." Alembic-over-5432 unchanged.
- **Sources:** Supabase "Connect to your database" docs (ports/modes); Supabase changelog
  "PgBouncer and IPv4 Deprecation" (#17817); Supavisor terminology doc.

### 9. Alembic + SQLAlchemy 2.x — sync engine, `env.py`, autogenerate, hand-authored RLS
- **Location:** phase-3 Step 19, Step 20.
- **Claim:** Sync Alembic over 5432; `target_metadata = SQLModel.metadata`; initial migration
  hand-authored (autogenerate won't emit RLS); `sqlmodel.AutoString` in the migration.
- **Status:** ✅
- **Finding:** Correct. SQLAlchemy 2.x supports the sync `engine_from_config` + `NullPool`
  pattern shown; using `SQLModel.metadata` as `target_metadata` and importing the model
  modules to register tables is the standard SQLModel+Alembic recipe. Autogenerate indeed does
  not emit raw `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, so hand-authoring the RLS in the
  migration via `op.execute(...)` is correct. `sqlmodel.AutoString` is the type Alembic's
  SQLModel template emits for `str` columns — valid. `ENABLE` + `FORCE ROW LEVEL SECURITY`
  with no policy = deny-all for non-bypassing roles, which is exactly the intended behavior.
- **Recommended change:** None. (Minor: the migration uses sync; the engine in `db.py` is also
  sync — consistent. Good that the plan did not mix in async, which would complicate
  Alembic.)
- **Sources:** Alembic docs (`env.py` patterns); SQLAlchemy 2.x; SQLModel + Alembic tutorial.

### 10. uv — `uv sync --frozen --no-dev`, lockfile, `uv run`, Docker image
- **Location:** PHILOSOPHY.md L281; phase-3 Step 1, Step 21; phase-8 ci.yml.
- **Claim:** Multi-stage Docker on `ghcr.io/astral-sh/uv:python3.13-bookworm-slim`, builder
  runs `uv sync --frozen --no-install-project --no-dev` then `uv sync --frozen --no-dev`;
  `UV_COMPILE_BYTECODE=1`, `UV_LINK_MODE=copy`, cache mount `/root/.cache/uv`; runtime stage
  copies `/app`; `uv.lock` committed; `uv run` script shim.
- **Status:** ✅ (one optional optimization → note)
- **Finding:** All current and correct. uv's official Docker guide documents exactly this
  two-step sync (deps first for layer caching, then the project), `UV_COMPILE_BYTECODE=1`,
  `UV_LINK_MODE=copy` with cache mounts, and `--frozen` requiring a committed lockfile.
  `ghcr.io/astral-sh/uv:pythonX.Y-bookworm-slim` is a published, valid tag family. Latest uv
  is in the **0.11.x** line (e.g. 0.11.18) as of early-mid 2026. `uv run` for the script shim
  is correct.
- **Recommended change:** Optional only: uv's guide *also* offers the
  `COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/` binary-copy pattern (keeps your own
  base image). The plan's "FROM ghcr.io/astral-sh/uv:python3.13-... AS builder" approach is
  equally documented and fine. Consider `--no-editable` + copying only `.venv` (not all of
  `/app`) into runtime to slim the image; minor. Pin the uv image to a digest/version for
  reproducibility.
- **Sources:** uv "Using uv in Docker" docs; uv "Locking and syncing" docs.

### 11. Ruff — `ruff check` + `ruff format --check`, rule selection
- **Location:** phase-3 Step 1 (`[tool.ruff.lint] select = ["E","F","I","UP","B","ASYNC","RUF"]`),
  package.json `lint` shim.
- **Status:** ✅
- **Finding:** Current. Latest Ruff is **0.15.0** (2026-02-03). `ruff check` (lint) and
  `ruff format --check` (formatter check) are the correct commands; the selected rule families
  (E/F/I/UP/B/ASYNC/RUF) are all valid stable categories. `line-length = 100` and `src` config
  are valid.
- **Recommended change:** None. (Ruff 0.15 ships an expanded default rule set; the explicit
  `select` is fine and more predictable.)
- **Sources:** Ruff 0.15.0 release; Ruff configuration/linter/formatter docs.

### 12. pyright strict mode
- **Location:** phase-3 Step 1 (`typeCheckingMode = "strict"`), Verify 7, Gotchas.
- **Status:** ✅ (interacts with Finding 6)
- **Finding:** `typeCheckingMode = "strict"` is correct and is the documented switch that
  enables `reportUnknownMemberType`, `reportUnknownArgumentType`, `reportMissingParameterType`,
  `reportMissingTypeArgument`, etc. The note that strict overrides individual rule defaults is
  accurate. **However**, strict mode is precisely what makes Finding 6
  (`session.exec(delete(...))`) a hard failure, and it will also flag any
  `result.rowcount` access on a type pyright infers loosely — so fix Finding 6 to keep Verify
  7 green. The documented `# pyright: ignore[reportCallIssue]` for the no-arg `Settings()`
  (pydantic-settings reads from env) is the right escape hatch.
- **Recommended change:** None beyond Finding 6. Be prepared for additional strict-mode
  friction with SQLModel's loosely-typed surfaces (e.g. `.exec(...).all()` element types) —
  may need targeted `# pyright: ignore` or explicit annotations.
- **Sources:** pyright configuration docs; pylance typeCheckingMode docs.

### 13. psycopg v3 — `postgresql+psycopg://`, `prepare_threshold=None`, `psycopg[binary]`
- **Location:** PHILOSOPHY.md L283–284 (deps), phase-3 Step 3.
- **Status:** ✅
- **Finding:** `postgresql+psycopg://` is the correct SQLAlchemy URL scheme selecting psycopg3
  (not psycopg2, not asyncpg). `connect_args={"prepare_threshold": None}` is the correct
  psycopg3 knob to disable server-side prepared statements (this is a psycopg3 connection
  kwarg). Declaring both `sqlalchemy[postgresql-psycopg]` and `psycopg[binary]` is belt-and-
  suspenders but valid (the extra pulls psycopg; `[binary]` avoids needing libpq build deps —
  good for the slim Docker runtime).
- **Recommended change:** None. (Optional: `psycopg[binary]` is discouraged for production by
  the psycopg maintainers in favor of `psycopg[c]`/system libpq, but `[binary]` is the
  pragmatic, widely-used choice and fine for a template.)
- **Sources:** Supabase SQLAlchemy troubleshooting (prepare_threshold=None); psycopg3 docs.

### 14. slowapi — Limiter + `app.state.limiter` + `SlowAPIMiddleware` + RateLimitExceeded
- **Location:** PHILOSOPHY.md L45; phase-3 Step 10, Step 16, Step 4 (429 handler).
- **Status:** ✅ (one required wiring detail → ⚠️)
- **Finding:** The wiring is the documented slowapi pattern: build `Limiter(key_func=...,
  default_limits=[...])`, assign `app.state.limiter`, `app.add_middleware(SlowAPIMiddleware)`,
  and register a handler for `RateLimitExceeded` (the guide renders it as problem+json — good).
  slowapi is maintained but **still self-described as "alpha quality"**; acceptable but pin it.
  **Required detail:** for the **global `default_limits`** path via `SlowAPIMiddleware` to work,
  slowapi expects `app.state.limiter` set *before* the middleware processes requests (the guide
  does this) and the limiter's `key_func` to accept a `Request`. The guide's `_rate_key(request)`
  is compatible. One caveat: per-route `@limiter.limit(...)` decorators require the endpoint to
  take a `request: Request` parameter — the template only uses global limits, so this is fine,
  but document it for product authors.
- **Recommended change:** Pin `slowapi` exact (alpha). Note in CLAUDE.md that any per-route
  `@limiter.limit` decorator needs a `request: Request` arg.
- **Sources:** slowapi docs (examples.md, index.md); PyPI slowapi.

### 15. slowapi per-user key — token-slice vs verified `sub` (OPEN)
- **Location:** phase-3 Step 10 (`_rate_key` keys on `auth[-24:]` token slice) + its OPEN flag.
- **Status:** ⚠️
- **Finding:** Keying on the **last 24 chars of the bearer token** is fragile: (a) it does not
  identify a *user* — it identifies a *token*; the same user with a refreshed token gets a new
  bucket, and (b) JWT signatures vary, so the slice is effectively random per-token, not
  per-user. For genuine per-user limiting you need the verified `sub` claim. The plan's worry
  (decoding JWT in the limiter hot path) is overstated — slowapi calls `key_func` once per
  request and you can read an already-verified `sub` cheaply if auth runs first, or do a
  signature-skipping `jwt.decode(..., options={"verify_signature": False})` *only* to extract
  `sub` for bucketing (the actual auth still verifies elsewhere).
- **Recommended change (resolves OPEN):** Key per-user on the JWT `sub` claim (unverified
  decode for bucketing is acceptable since the real auth dependency verifies the same token on
  the protected route). Fall back to `get_remote_address` for anonymous requests. Keep the
  `100/minute` default as a sane starting value but make it env-driven (already is via
  `rate_limit_default`).
- **Sources:** slowapi docs (custom key_func); PyJWT.

### 16. structlog — JSON logs config (phase-8)
- **Location:** phase-8 (a) `logging.py`.
- **Status:** ✅ (one bogus line → ⚠️)
- **Finding:** The processor chain is correct and idiomatic for JSON logs:
  `merge_contextvars` first, then `add_log_level`, `TimeStamper(fmt="iso")`,
  `dict_tracebacks`, `JSONRenderer()` last; `make_filtering_bound_logger`,
  `PrintLoggerFactory`, `cache_logger_on_first_use=True`. The middleware's
  `clear_contextvars()` + `bind_contextvars(request_id=...)` is the documented FastAPI
  pattern. **Bug:** the line `request_id_var: structlog.contextvars` at module top is not
  valid/meaningful (it annotates a name with a *module* as its type and binds nothing) — it
  appears to be a leftover. The real binding happens in the middleware, so this line should be
  deleted.
- **Recommended change:** Delete the `request_id_var: structlog.contextvars` line. Optionally
  use `ConsoleRenderer` in local/dev and `JSONRenderer` in staging/prod (env-gated) — common
  practice, not required by PHILOSOPHY.
- **Sources:** structlog "Context Variables" + API docs; FastAPI+structlog guides.

### 17. RFC 9457 problem+json — media type + member names
- **Location:** PHILOSOPHY.md L52; phase-3 Step 4 (`PROBLEM_CONTENT_TYPE = "application/problem+json"`),
  Step 8 (`Problem` model: `type`/`title`/`status`/`detail`/`instance`).
- **Status:** ✅
- **Finding:** Fully conformant. Media type is exactly `application/problem+json` (IANA-
  registered). The five standard members are named correctly: `type` (URI ref, default
  `"about:blank"`), `title`, `status` (int), `detail`, `instance`. Defaulting `type` to
  `about:blank` is explicitly the RFC's prescribed default. The `Problem` DTO is declared so
  it lands in OpenAPI → generated client — good. The handler sets `media_type=` on the
  `JSONResponse`, which correctly emits the `Content-Type: application/problem+json` header
  (the tests assert this).
- **Recommended change:** None. (Optional RFC nicety: when you mint custom problem `type`
  URIs, host a doc at that URI; `about:blank` for generic errors is correct meanwhile.)
- **Sources:** RFC 9457 (rfc-editor.org); IANA media-types `application/problem+json`.

### 18. polyfactory — name + import path
- **Location:** PHILOSOPHY.md L48, L284; phase-3 Step 23 (`from polyfactory.factories.pydantic_factory
  import ModelFactory`).
- **Status:** ✅
- **Finding:** Correct and current. The library was renamed from **pydantic-factories →
  polyfactory** at 2.0 (to support dataclasses/TypedDict/etc., not just Pydantic).
  `ModelFactory` is exported from the namespaced module
  `polyfactory.factories.pydantic_factory` (because pydantic is an optional dep) — exactly the
  import the guide uses. Latest is in the **2.2x** line. Dist name `polyfactory`.
- **Recommended change:** None.
- **Sources:** polyfactory docs (library_factories, pydantic_factory reference); PyPI.

### 19. Cursor pagination — envelope field names + opaque base64 + keyset (OPEN)
- **Location:** PHILOSOPHY.md L52; phase-3 Step 5 (`Page{items, next_cursor}`, base64 cursor keyed
  on `id`) + its OPEN flag, Step 7 keyset query.
- **Status:** ✅ (best-practice aligned) — resolves OPEN
- **Finding:** The design matches current best practice: **opaque base64-encoded cursor** that
  clients treat as opaque, and `next_cursor` is the conventional response field name used by
  major APIs. Keyset on a **time-ordered UUIDv7 `id`** (`WHERE id > :after ORDER BY id LIMIT
  n+1`) is a valid, stable single-column keyset *precisely because* UUIDv7 is monotonic — this
  is explicitly endorsed (UUIDv7 as the monotonic keyset column). Fetching `limit+1` to detect
  `has_more` is the standard trick.
- **Recommended change (resolves OPEN):** Keep `{ items, next_cursor }` + opaque base64-on-`id`.
  Two robustness notes: (1) ensure the DB sorts UUIDs the same way Python compares them —
  Postgres `uuid` ordering is bytewise and matches UUIDv7's big-endian time ordering, so
  `ORDER BY id` is correct; (2) if a product ever changes the sort key away from `id`, the
  cursor must encode the full sort tuple (the current single-`after` cursor assumes `id`
  ordering). Document this in the api CLAUDE.md so Phase 4 `features/home` stays in lockstep.
- **Sources:** keyset/cursor pagination best-practice writeups (2025–2026): opaque base64
  cursor, `next_cursor` naming, UUIDv7 as monotonic keyset column.

### 20. `Page[T]` generic as `response_model` in OpenAPI
- **Location:** phase-3 Step 5 (`class Page(BaseModel, Generic[T])`), Step 14
  (`response_model=Page[ItemRead]`).
- **Status:** ⚠️
- **Finding:** Using a **plain Pydantic** `Generic[T]` model as `response_model=Page[ItemRead]`
  is well-supported by FastAPI/Pydantic v2 and produces a typed OpenAPI schema (a concrete
  `Page_ItemRead_` component). This is fine. The one **trap to avoid**: there is a known
  SQLModel issue (#1668) where using a *SQLModel-based* generic as `response_model` yields an
  incomplete schema. The plan correctly makes `Page` a `BaseModel` (not SQLModel), so it is in
  the clear — but the api CLAUDE.md should explicitly say "pagination/envelope DTOs are plain
  Pydantic `BaseModel`, never SQLModel" to avoid a future author tripping #1668.
- **Recommended change:** Add that one-line rule to the api CLAUDE.md. No code change.
- **Sources:** FastAPI generics + response_model; fastapi/sqlmodel #1668 (generic SQLModel in
  response_model is incomplete).

### 21. RLS deny-all + privileged/BYPASSRLS role (OPEN)
- **Location:** PHILOSOPHY.md L51; phase-3 Step 20 + its OPEN flag, Gotchas.
- **Status:** ✅ / ⚠️ (resolves OPEN)
- **Finding:** `ENABLE` + `FORCE ROW LEVEL SECURITY` with no policy denies all non-bypassing
  roles — correct for keeping the schema private from PostgREST/Realtime (anon/authenticated).
  The open question is *which role the API connects as to bypass it*. On Supabase: the
  `postgres` superuser-ish role and the `service_role` are the bypass paths. **Important
  nuance for `FORCE ROW LEVEL SECURITY`:** `FORCE` makes even the *table owner* subject to
  policies — but **`BYPASSRLS` and superuser still bypass even FORCE**. Supabase's `postgres`
  role has `BYPASSRLS`; `service_role` bypasses RLS via the API but for a *direct SQL
  connection* (psycopg) you should connect as a role with `BYPASSRLS` (the project `postgres`
  role) or RLS+FORCE will block your own service queries.
- **Recommended change (resolves OPEN):** Connect `DATABASE_URL`/`DATABASE_MIGRATION_URL` as
  the Supabase **`postgres`** role (has `BYPASSRLS`), not `authenticated`/`anon`. Verify with
  an integration test that the service can read/write `item` after the deny-all migration.
  Note: `FORCE ROW LEVEL SECURITY` is fine but redundant for a `BYPASSRLS` connection — keep
  it for defense-in-depth, just confirm the runtime role bypasses.
- **Sources:** PostgreSQL RLS docs (FORCE vs BYPASSRLS/superuser); Supabase roles
  (`postgres`/`service_role`).

### 22. JWKS via PyJWKClient + HS256 fallback (Key ruling #5)
- **Location:** PHILOSOPHY.md L75–77; phase-3 Step 9.
- **Status:** ✅ (one ⚠️ on the JWKS URL)
- **Finding:** `PyJWKClient` with `get_signing_key_from_jwt` + `jwt.decode(algorithms=
  ["ES256","RS256"], audience="authenticated")` is correct PyJWT usage and matches current
  Supabase asymmetric-JWT verification; `lru_cache` over the client (PyJWKClient also caches
  keys internally) is fine. HS256 + `SUPABASE_JWT_SECRET` fallback for the local CLI stack is
  accurate (local stack issues HS256). **⚠️:** the JWKS URL is built as
  `{supabase_url}/auth/v1/.well-known/jwks.json` — confirm the exact path against the live
  project; Supabase's discovery path has historically been `/auth/v1/.well-known/jwks.json`,
  which matches, but verify when the project exists. Also: the `pyjwt[crypto]` extra is
  required for ES256/RS256 (the plan includes it — good).
- **Recommended change:** Verify the JWKS path against the actual Supabase project at
  integration time (Phase 6). No code change otherwise.
- **Sources:** PyJWT `PyJWKClient` docs; Supabase JWT/JWKS docs.

---

## Resolved OPEN / TO CONFIRM (in-scope)

- **UUIDv7 library (Step 1/6):** ❌ as written. Use **`uuid-utils`** (`from uuid_utils import
  uuid7`, Rust-backed, returns stdlib UUID, maintained) **or `uuid6`** (`from uuid6 import
  uuid7`). Do **not** use the 2021-stale `uuid7`/`uuid_extensions` package. Python 3.13 has no
  native `uuid7` (that's 3.14); a third-party lib is mandatory. Pin exact. *(Finding 4)*
- **Cursor envelope field names (Step 5):** ✅ Keep `{ items, next_cursor }` + opaque
  base64-on-`id`. Matches best practice (`next_cursor` naming, opaque cursor, UUIDv7 monotonic
  keyset). Encode the full sort tuple if the sort key ever changes from `id`. *(Finding 19)*
- **Per-user rate-limit key (Step 10):** ⚠️ Replace the bearer-token-slice with the JWT `sub`
  claim (unverified decode for bucketing is acceptable; real auth verifies elsewhere); fall
  back to IP for anonymous. Keep `100/minute` env-driven default. *(Finding 15)*
- **Privileged/BYPASSRLS role (Step 20):** ✅ Connect as Supabase **`postgres`** (has
  `BYPASSRLS`); `FORCE ROW LEVEL SECURITY` is bypassed by `BYPASSRLS`/superuser, so service
  queries still work. Confirm credentials when the project exists; add a read-after-deny-all
  integration test. *(Finding 21)*
- **"Session mode removed 2025" (Key ruling #4):** ❌ doc fix — session mode (5432) still
  exists; the 2024 event was PgBouncer→Supavisor + IPv4 deprecation. The transaction-mode +
  psycopg3 `prepare_threshold=None` + NullPool choice remains valid; just fix the rationale.
  *(Finding 8)*

Out of domain (not resolved here): export_openapi `parents[3]` path depth, test-schema
`create_all` vs Alembic, E2E process orchestration, `--affected` base ref, tag→product
parsing, macOS signing, broadcast-failure policy, "stale" token threshold.

---

## Sources

- FastAPI release notes / PyPI (0.124.4): https://fastapi.tiangolo.com/release-notes/ ·
  https://pypi.org/project/fastapi/
- FastAPI Lifespan Events: https://fastapi.tiangolo.com/advanced/events/
- FastAPI + SQLModel generic response_model issue #1668:
  https://github.com/fastapi/sqlmodel/discussions/1668
- Pydantic Strict Mode: https://docs.pydantic.dev/latest/concepts/strict_mode/
- Pydantic Configuration (ConfigDict): https://docs.pydantic.dev/latest/api/config/
- Python 3.14 uuid (RFC 9562; uuid6/7/8): https://docs.python.org/3/library/uuid.html
- discuss.python.org "Add uuid7 in uuid module":
  https://discuss.python.org/t/add-uuid7-in-uuid-module-in-standard-library/44390
- PyPI uuid7 (2021, stale): https://pypi.org/project/uuid7/ · libraries.io/pypi/uuid7
- uuid-utils (maintained): https://pypi.org/project/uuid_utils/ ; uuid6: https://pypi.org/project/uuid6/
- SQLModel release notes / PyPI (0.0.27): https://sqlmodel.tiangolo.com/release-notes/
- SQLModel exec/delete: https://github.com/fastapi/sqlmodel/discussions/821 ·
  https://github.com/fastapi/sqlmodel/issues/909
- SQLAlchemy 2.x UPDATE/DELETE (Result.rowcount):
  https://docs.sqlalchemy.org/en/21/tutorial/data_update.html
- Supabase Connect to your database (ports/modes):
  https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase SQLAlchemy troubleshooting (prepare_threshold=None):
  https://supabase.com/docs/guides/troubleshooting/using-sqlalchemy-with-supabase-FUqebT
- Supabase Disabling Prepared Statements: https://github.com/orgs/supabase/discussions/28239
- Supabase PgBouncer/IPv4 deprecation (Supavisor migration):
  https://github.com/orgs/supabase/discussions/17817
- Supavisor terminology: https://supabase.com/docs/guides/troubleshooting/supavisor-and-connection-terminology-explained-9pr_ZO
- uv Docker guide: https://docs.astral.sh/uv/guides/integration/docker/ ·
  https://github.com/astral-sh/uv/blob/main/docs/guides/integration/docker.md
- uv Locking and syncing: https://docs.astral.sh/uv/concepts/projects/sync/
- Ruff 0.15.0 release: https://github.com/astral-sh/ruff/releases/tag/0.15.0 ·
  https://docs.astral.sh/ruff/
- pyright configuration (strict): https://github.com/microsoft/pyright/blob/main/docs/configuration.md
- pylance typeCheckingMode: https://github.com/microsoft/pylance-release/blob/main/docs/settings/python_analysis_typeCheckingMode.md
- slowapi docs / PyPI: https://slowapi.readthedocs.io/ ·
  https://github.com/laurentS/slowapi/blob/master/docs/examples.md · https://pypi.org/project/slowapi/
- structlog Context Variables / API: https://www.structlog.org/en/stable/contextvars.html ·
  https://www.structlog.org/en/stable/api.html
- RFC 9457: https://www.rfc-editor.org/rfc/rfc9457.pdf · https://www.rfc-editor.org/info/rfc9457/
- IANA application/problem+json: https://www.iana.org/assignments/media-types/application/problem+json
- polyfactory docs / PyPI: https://polyfactory.litestar.dev/latest/reference/factories/pydantic_factory.html ·
  https://github.com/litestar-org/polyfactory · https://pypi.org/project/pydantic-factories
- Keyset/cursor pagination best practice (2025–2026):
  https://www.stacksync.com/blog/keyset-cursors-postgres-pagination-fast-accurate-scalable ·
  https://oneuptime.com/blog/post/2026-02-02-keyset-pagination/view
- PostgreSQL RLS (FORCE / BYPASSRLS): https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- PyJWT PyJWKClient: https://pyjwt.readthedocs.io/en/stable/usage.html
