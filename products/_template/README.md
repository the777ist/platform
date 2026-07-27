# template

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
cd products/template && supabase status          # note the service_role key
cd api && cp ../.env.example .env                # ports are already this product's local ones
#   -> paste the service_role key into SUPABASE_SERVICE_ROLE_KEY (realtime invalidations)
#   -> leave SUPABASE_JWKS_URL / SUPABASE_JWT_SECRET commented out (an empty value
#      is read as "", not unset, and breaks auth with 401s on every call)
uv run alembic upgrade head                      # create the schema (all migrations)
uv run python -m template_api.seed               # seed demo data

# day-to-day:
pnpm --filter @platform/template-api dev         # FastAPI (port = 8000 + 10·portIndex)
pnpm --filter @platform/template-app dev         # Expo (web on :8081, QR for device)
```

Local ports derive from `product.json`'s `portIndex` — see CLAUDE.md "Ports & infra".

## Where things live

- Screens & product logic: `app/features/<feature>/` (routes in `app/app/` stay one-liners)
- Shared components: `@platform/ui` (workbench: `pnpm --filter @platform/ui storybook`)
- API endpoints: `api/src/template_api/` — recipe in [api/CLAUDE.md](api/CLAUDE.md)
- Generated client: `api-client/` — regen with `/typegen`, never edit

## Brand

Replace `app/assets/brand/source.svg`, run `pnpm --filter @platform/template-app brand:gen`,
commit the PNGs. Token values re-theme via the product's Figma brand mode → `/sync-tokens`
(zero component edits).

## Tests

```bash
pnpm --filter @platform/template-app test        # Jest + RNTL
pnpm --filter @platform/template-app exec playwright test   # web E2E (full local stack)
maestro test app/.maestro/login.yaml             # mobile flow (dev build, local only)

# API tests: pytest defaults TEST_DATABASE_URL to CI's :5432 — locally, point it at
# THIS product's direct DB port and run from api/ (going through `pnpm turbo run test`
# also fails locally: turbo's strict env mode drops the variable):
cd api && TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres uv run pytest
```

Run pytest AFTER the schema exists via Alembic (`uv run alembic upgrade head`) — its
`create_all` tolerates an Alembic-built schema, but Alembic dies with `DuplicateTable`
on a `create_all`-built one (`supabase db reset` un-wedges).

## Ship

`main` auto-deploys staging (API → Fly, web → Vercel, OTA → staging channel).
Production is tag-driven: `/release <surface>` (api | app | ota | desktop).
