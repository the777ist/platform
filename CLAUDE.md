# CLAUDE.md — platform monorepo

Agent context for the whole repo. Deep rationale lives in [PHILOSOPHY.md](PHILOSOPHY.md)
(the locked decisions win every conflict); this file is the operational distillation.

## Map

- `packages/config` — eslint/prettier/tsconfig/tailwind-preset (semantic tokens → CSS vars)
- `packages/ui` — OWNED design system (shadcn model); its own [CLAUDE.md](packages/ui/CLAUDE.md)
  is the design-system runbook, [FIGMA.md](packages/ui/FIGMA.md) the designer contract
- `packages/core` — plumbing ONLY (supabase client, auth store/guards, query client +
  persistence, api-client wrapper, realtime subscribe-and-invalidate, push registration,
  Sentry, env). No screens. Product-agnostic: products pass their generated client IN.
- `products/<name>/{app,desktop,api,api-client}` — one product = Expo app (iOS+Android+web),
  Electron wrapper, FastAPI service (own uv universe), generated TS client (committed).
  `products/_template` is the live starter the generator stamps; each product carries its
  own CLAUDE.md + commands.

## Conventions (locked)

- Promote-on-2nd-use: compositions start product-local (`app/features/<x>/components/`);
  move into `packages/*` on the SECOND use, never speculatively.
- Naming derives from the PRODUCT, never the repo: `@platform/*` packages,
  `com.example.*` bundle ids, infra `<org>-<product>-<env>` (org placeholder `example`).
- Theming = semantic CSS variables. NEVER name a color in a component — tokens only
  (`bg-primary`, not hex). A brand is a token-VALUE override, never forked components.
- Figma modes ARE brand modes; each product's `theme.ts` is the export of its Figma brand
  mode (`/sync-tokens` regenerates — never hand-edit generated theme values).
- Realtime is BROADCAST-ONLY: tables stay RLS-deny-all; the API broadcasts `invalidate`
  on `<product>:realtime` (service-role HTTP); clients refetch through the API.
  No Postgres-Changes subscriptions, no RLS holes.
- Errors are RFC 9457 problem+json; cursor pagination (`useInfiniteQuery`-ready).
- The generated api-client is NEVER hand-edited — regen via `/typegen`; CI fails on drift.
- API layering is fixed: `model → service → schema → router` (no repository layer);
  DTOs are the only thing crossing HTTP. pyright strict + Pydantic strict.
- No shared Python between products — cross-product reuse happens in TS (`packages/*`)
  or by improving `_template`.

## Gotchas

- pnpm HOISTED linker (`nodeLinker: hoisted` in `pnpm-workspace.yaml` — pnpm 11's home
  for it); never set `disableHierarchicalLookups`. Root `package.json` keeps the
  `packageManager` field (eas-cli workspace-detection workaround).
- Supabase pooler 6543 = TRANSACTION mode only (psycopg3, NullPool,
  `prepare_threshold=None`); Alembic migrates over DIRECT 5432 via
  `DATABASE_MIGRATION_URL` (Fly release_command, not a CI step).
- JWT verify: JWKS/ES256 via `PyJWKClient` is the primary path EVERYWHERE, including
  local (current CLI issues ES256); HS256 secret is a genuine fallback only.
- Sentry = `@sentry/react-native` (NOT deprecated sentry-expo). Runtime init in core;
  build halves are the `@sentry/react-native/expo` config plugin + `getSentryExpoConfig`
  metro wiring per app.
- X-Request-Id: the core api wrapper mints one per request → API middleware binds it to
  structlog + echoes it back; the SAME id tags Sentry on both sides (client→API→logs).
- `SUPABASE_SERVICE_ROLE_KEY` / JWT secrets are NEVER `EXPO_PUBLIC_*` and never
  committed; committed `app/.env.*` files carry publishable values only.
- Local stacks coexist by portIndex (`product.json`): API `8000+10i`,
  Supabase block `54321+100i`. `pnpm bootstrap` starts every product's stack.
- Expo Go cannot receive push tokens — the push loop needs a dev build on a real device.
- Web deploys have NO workflow (Vercel git integration) — do not add one.

## Commands

Root (product arg unless noted): `/new-product <name>` · `/affected` ·
`/typegen <product>` · `/release <product> <surface>` — plus the shared-`packages/ui`
trio (no product arg): `/add-component <name>` · `/sync-tokens` ·
`/bootstrap-design-system`.
Product-scoped (open a session in `products/<name>/`): `/dev` · `/typegen` · `/migrate` ·
`/add-feature <name>` · `/release <surface>`.

## The ptfm-* pipeline (canonical product workflow)

Products are BUILT through the agentic lifecycle pipeline in `.claude/commands/ptfm-*.md`
(runtime surface — never deleted by cleanup): `ptfm-product → ptfm-architect → ptfm-plan →
ptfm-implement → ptfm-audit → ptfm-simplify → ptfm-commonify → ptfm-review → ptfm-test-ui`.
Each takes the product name first and writes artifacts to
`products/<product>/docs/{product,architecture,plans,implementation,reviews}/`.
It drives MCP integrations — connect **Linear, Notion, Figma, Supabase (read-only
introspection; migrations stay in Alembic), Playwright, GitHub** in Claude Code first
(see README "Operational stack").
