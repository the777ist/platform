# demo

A cross-platform product in the platform monorepo: one Expo codebase → iOS, Android,
web (Vercel) and desktop (Electron wrapping the same web build), backed by its own
FastAPI service and Supabase project. Authoritative recipes live in
[CLAUDE.md](CLAUDE.md) and [api/CLAUDE.md](api/CLAUDE.md) — this README is the human
quickstart.

## Run it locally

```bash
# one-time, repo root: mise install && pnpm install
pnpm bootstrap                                   # starts every product's local Supabase stack
cd products/demo/api && cp ../.env.example .env   # fill the local values, then:
pnpm --filter @the777incident/demo-api dev         # FastAPI (port = 8000 + 10·portIndex)
pnpm --filter @the777incident/demo-app dev         # Expo (web on :8081, QR for device)
```

Local ports derive from `product.json`'s `portIndex` — see CLAUDE.md "Ports & infra".

## Where things live

- Screens & product logic: `app/features/<feature>/` (routes in `app/app/` stay one-liners)
- Shared components: `@the777incident/ui` (workbench: `pnpm --filter @the777incident/ui storybook`)
- API endpoints: `api/src/demo_api/` — recipe in [api/CLAUDE.md](api/CLAUDE.md)
- Generated client: `api-client/` — regen with `/typegen`, never edit

## Brand

Replace `app/assets/brand/source.svg`, run `pnpm --filter @the777incident/demo-app brand:gen`,
commit the PNGs. Token values re-theme via the product's Figma brand mode → `/sync-tokens`
(zero component edits).

## Tests

```bash
pnpm --filter @the777incident/demo-app test        # Jest + RNTL
pnpm --filter @the777incident/demo-api test        # pytest against real Postgres
pnpm --filter @the777incident/demo-app exec playwright test   # web E2E (full local stack)
maestro test app/.maestro/login.yaml             # mobile flow (dev build, local only)
```

## Ship

`main` auto-deploys staging (API → Fly, web → Vercel, OTA → staging channel).
Production is tag-driven: `/release <surface>` (api | app | ota | desktop).
