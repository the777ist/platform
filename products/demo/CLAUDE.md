# CLAUDE.md — demo product

Agent context for `products/demo`. Monorepo-wide conventions live in the root
CLAUDE.md (loads hierarchically); this file is what's specific to THIS product.

## Structure

- `app/` — `@platform/demo-app`: ONE Expo app for iOS + Android + web
  (`expo export --platform web` → `dist/`). Routes in `app/app/` are thin one-liners;
  real screens/logic live in `app/features/<feature>/` (auth, home, settings).
- `desktop/` — `@platform/demo-desktop`: Electron shell serving the exported web
  `dist/` over the privileged `app://` protocol. appId `com.example.demo.desktop`;
  publishes to `<org>/demo-desktop-releases` (org placeholder `example`).
- `api/` — `@platform/demo-api`: FastAPI, its own uv universe (module
  `demo_api`). See [api/CLAUDE.md](api/CLAUDE.md) for the add-an-endpoint recipe.
- `api-client/` — `@platform/demo-api-client`: GENERATED (hey-api) from
  `api/openapi.json`, committed, never hand-edited.
- `supabase/` — this product's own local stack + migrations context
  (project_id `example-demo`).

## Ports & infra (derived from product.json — the single source of truth)

`product.json` holds `{"name": "demo", "portIndex": i}`. All local ports derive
from portIndex, so every product's stack coexists:

- API: `8000 + 10·i` (see `api/package.json` dev script for the literal value)
- Supabase block: `54321 + 100·i` (API URL; +1 db, +2 studio, +3 mailpit — see
  `supabase/config.toml`)
- Expo dev server: 8081 for every product (Expo auto-offers the next port when busy)

Infra names derive from the PRODUCT name: Fly `example-demo-api-stg|prod`,
Supabase projects `example-demo-stg|prod`, Sentry `example-demo`, EAS project
via `TODO-EAS-PROJECT-ID` in `app/app.config.ts`. (`example` = org placeholder.)

## Conventions that apply here

- Compositions start in `app/features/<feature>/components/` — promote into
  `packages/ui` on the SECOND use (never speculatively).
- This product's `app/theme.ts` + `app/global.css` token values ARE the export of its
  Figma brand mode (`/sync-tokens` regenerates them — never hand-edit).
- Committed `app/.env.development/.staging/.production` carry PUBLISHABLE values only
  (`EXPO_PUBLIC_*`); server secrets live in `api/.env` (gitignored, demo at
  `.env.example`) and each platform's native store.
- Realtime: the api broadcasts `invalidate` on the `demo:realtime` channel after
  items mutations; `features/home/use-items-realtime.ts` subscribes.

## Everyday commands (product-scoped, run from this directory)

`/dev` · `/typegen` · `/migrate` · `/add-feature <name>` · `/release <surface>` — see
`.claude/commands/`.

## Agentic pipeline artifacts

The `ptfm-*` pipeline (root commands; the canonical build workflow for this product)
writes its artifacts to `docs/{product,architecture,plans,implementation,reviews}/`
inside this product — created on first write.
