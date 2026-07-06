# CLAUDE.md — template api

FastAPI service for the template product (module `template_api`, own uv universe —
`uv run` everything from this directory).

## add-an-endpoint recipe (fixed — follow verbatim)

1. **model** — `src/template_api/models/<x>.py`: SQLModel table on the `UUIDModel` base
   (UUIDv7 PK, created/updated timestamps). New table ⇒ new Alembic migration INCLUDING
   `ALTER TABLE <x> ENABLE ROW LEVEL SECURITY` (RLS deny-all on EVERY table; the API's
   privileged role bypasses it): `uv run alembic revision --autogenerate -m "<x>"`, then
   edit, then `uv run alembic upgrade head`.
2. **service** — `src/template_api/services/<x>_service.py`: class per aggregate
   extending `BaseService` (holds the session via Depends); owns business logic AND data
   access — NO repository layer. `DELETE`/`UPDATE` go through `session.execute(...)`,
   never `session.exec(...)`.
3. **schema** — `src/template_api/schemas/<x>.py`: Pydantic v2 DTOs (StrictDTO) — the
   ONLY thing crossing HTTP; ORM models are NEVER serialized to the client.
4. **router** — `src/template_api/routers/<x>.py`: thin; depends on the service
   (Annotated form), maps schema↔domain; route function names must stay UNIQUE across
   all routers (they become the generated-client operation ids). Register in `main.py`.
5. **openapi** — `pnpm turbo run openapi --filter=@platform/template-api` (or
   `uv run python -m template_api.export_openapi`).
6. **typegen** — `pnpm turbo run build --filter=@platform/template-api-client`; commit
   the regenerated client. CI drift check fails a stale regen.
7. **hook** — use the generated TanStack options/mutations from
   `@platform/template-api-client`.
8. **screen** — wire it in `app/features/<x>/`.

If clients must react to mutations in realtime: broadcast AFTER commit via
`services/realtime.py: broadcast_invalidate("<resource>")` (broadcast-only pattern —
never Postgres-Changes, never open RLS).

## Rules

- Strict layered OOP: `schemas/` ↔ `routers/` → `services/` → `models/`.
- pyright STRICT + Pydantic STRICT — enforced in pre-push and CI. No untyped defs.
- RFC 9457 problem+json for every error (`errors.py`); cursor pagination
  (`pagination.py`, `useInfiniteQuery`-ready).
- DB: runtime over the transaction pooler 6543 (psycopg3 + NullPool +
  `prepare_threshold=None`); migrations over direct 5432 (`DATABASE_MIGRATION_URL`,
  Fly release_command). Schema changes ONLY via Alembic.
- Auth: JWKS/ES256 primary everywhere (local included); HS256 fallback only.
- External HTTP (Expo Push, Supabase broadcast) is httpx with an injectable client —
  unit tests pass `httpx.MockTransport`; integration tests hit real Postgres, never
  mock the session.
- Observability: structlog JSON only (no bare print in request paths); the request_id
  middleware binds the id — never strip the `X-Request-Id` echo.

## Scheduled jobs

`tasks.py` — one-off Fly machines (`fly machine run … [--schedule daily]`), e.g.
`python -m template_api.tasks prune-push-tokens`. Keyword schedules only (fuzzy);
precise cron ⇒ Fly Cron Manager / Supercronic.
