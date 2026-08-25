# demo

A cross-platform product in the platform monorepo: one Expo codebase → iOS, Android,
web (Vercel) and desktop (Electron wrapping the same web build), backed by its own
FastAPI service and Supabase project. Authoritative recipes live in
[CLAUDE.md](CLAUDE.md) and [api/CLAUDE.md](api/CLAUDE.md) — this README is the human
quickstart.

## Run it locally

No cloud accounts needed — everything below runs against the local Docker Supabase stack.

```bash
# one-time, repo root: mise install && pnpm install
pnpm bootstrap                                   # starts every product's local Supabase stack

# first run only — the stack starts EMPTY (no api/.env, no tables, no data):
cd products/demo && supabase status          # note the service_role key
cd api && cp ../.env.example .env                # ports are already this product's local ones
#   -> paste the service_role key into SUPABASE_SERVICE_ROLE_KEY (realtime invalidations)
#   -> leave SUPABASE_JWKS_URL / SUPABASE_JWT_SECRET commented out (an empty value
#      is read as "", not unset, and breaks auth with 401s on every call)
uv run alembic upgrade head                      # create the schema (all migrations)
uv run python -m demo_api.seed               # seed demo data

# day-to-day:
pnpm --filter @platform/demo-api dev         # FastAPI (port = 8000 + 10·portIndex)
pnpm --filter @platform/demo-app dev         # Expo (web on :8081, QR for device)
```

Local ports derive from `product.json`'s `portIndex` — see CLAUDE.md "Ports & infra".

## Where things live

- Screens & product logic: `app/features/<feature>/` (routes in `app/app/` stay one-liners)
- Shared components: `@platform/ui` (workbench: `pnpm --filter @platform/ui storybook`)
- API endpoints: `api/src/demo_api/` — recipe in [api/CLAUDE.md](api/CLAUDE.md)
- Generated client: `api-client/` — regen with `/typegen`, never edit

## Brand

Replace `app/assets/brand/source.svg`, run `pnpm --filter @platform/demo-app brand:gen`,
commit the PNGs. Token values re-theme via the product's Figma brand mode → `/sync-tokens`
(zero component edits).

## Tests

```bash
pnpm --filter @platform/demo-app test        # Jest + RNTL
pnpm --filter @platform/demo-app exec playwright test   # web E2E (full local stack)
maestro test app/.maestro/login.yaml             # mobile flow (dev build, local only)

# API tests need no env: the suite targets CI's :5432 service container when CI is set,
# otherwise THIS product's own stack (must be running) at the db.port read from
# supabase/config.toml, auto-creating this api's own <module>_test database on it
# (the api's Python module name plus _test). TEST_DATABASE_URL wins.
cd api && uv run pytest
```

Run pytest AFTER the schema exists via Alembic (`uv run alembic upgrade head`) — its
`create_all` tolerates an Alembic-built schema, but Alembic dies with `DuplicateTable`
on a `create_all`-built one (`supabase db reset` un-wedges).

## Ship

`main` auto-deploys staging (API → Fly, web → Vercel, OTA → staging channel).
Production is tag-driven: `/release <surface>` (api | app | ota | desktop).
