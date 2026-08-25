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
- A stamped stack starts EMPTY and `api/.env` is never generated: copy the product's
  `.env.example` (ports pre-offset per product), paste the `supabase status` service_role
  key, then `alembic upgrade head` + `python -m <name>_api.seed` from `api/`. NEVER leave
  `SUPABASE_JWKS_URL=` / `SUPABASE_JWT_SECRET=` as empty-string lines — pydantic reads ""
  (not None), it passes the `is not None` checks in `auth.py`, and every authed call 401s.
- Local API tests need NO env. `tests/__init__.py` targets CI's `:5432` service container
  when `CI` is set, else THAT product's own stack — reading `db.port` from its
  `supabase/config.toml` rather than re-deriving `54322+100i` — and auto-creates a
  per-product `<module>_api_test` database on it, so
  `pnpm turbo run test` and `uv run pytest` both just work with the stack up. Never
  default to a bare `:5432` locally: it is either nothing or a FOREIGN Postgres, and the
  suite passes green against the wrong database. `TEST_DATABASE_URL` still overrides
  verbatim (turbo passes it through — root `turbo.json` declares it as `test.env`).
- `turbo.json` sets `futureFlags.affectedUsingTaskInputs` + per-task `inputs`
  (`$TURBO_DEFAULT$` minus `**/*.md`, `**/docs/**`, `**/*-snapshots/**`) so docs and
  committed VR baselines don't invalidate code tasks. Without BOTH, `--affected` selects
  every task in a touched package and `api-client#build`'s `^openapi` edge drags each
  product's Python OpenAPI export into a docs-only change.
- `deploy-api.yml` / `eas-update.yml` DERIVE their per-product `changes:` filters from
  `products/*` via `scripts/product-filters.mjs`, so a newly stamped product deploys with no
  workflow edit. (They used to hardcode the roster, which meant a new product silently never
  deployed.) The matrix key drops the leading underscore, so `_template` stays addressable as
  `template` and the deploy jobs' expressions are unchanged.
- A FRESH CLONE starts untrusted by mise: trust is keyed to the ABSOLUTE PATH, so `mise install`
  exits 1 with "Config files ... are not trusted" and the whole `pnpm bootstrap` chain dies on its
  first command. `scripts/bootstrap.mjs` runs `mise trust` first; if you invoke tools without
  bootstrapping, run `mise trust` by hand. CI is unaffected (`jdx/mise-action` trusts it).
- `core.hooksPath` SILENTLY disables every hook. If it is set (some corporate git configs and a
  few dev tools set it globally), git ignores `.git/hooks` — where lefthook installs — while
  `lefthook install` still reports "sync hooks ✔️". Verified: a commit with a deliberately invalid
  message went straight through, ungated. `pnpm prepare` now runs `scripts/verify-hooks.mjs`, which
  WARNS loudly (it does not fail the install — a deliberate org-wide hooksPath is legitimate, and
  CI re-runs every gate regardless). Fix for one repo: `git config --local core.hooksPath .git/hooks`.
- Git hooks are TIERED, and the budgets are the design constraint (`lefthook.yml`'s header is
  authoritative): pre-commit ~5s = staged-file AUTO-FIXERS only, piped semantic-fixer →
  formatter so the formatter gets the last write; commit-msg = commitlint (Conventional
  Commits, header ≤120); pre-push (seconds cached, ~83s per affected product when the web bundle rebuilds) = affected-scoped correctness; everything needing a
  container, browser or device stays in CI. Hooks are a FLOOR, not a mirror of CI.
- pre-push scopes itself from the REFS: `.lefthook/pre-push.sh` reads git's
  `<local ref> <local sha> <remote ref> <remote sha>` lines off stdin BEFORE `exec < /dev/null`
  (detaching first throws them away) and hands the remote sha to `scripts/pre-push.mjs`. That only
  works because the job sets **`use_stdin: true`** — without it lefthook swallows stdin, the read
  returns empty, and the gate silently degrades to its `@{upstream}` → `origin/main` fallback.
  When it cannot derive ONE range it sends the `__ALL__` sentinel and every package is gated —
  that covers several refs pushed at once (`git push --all`, a branch plus a tag, where the loop
  can only carry one base) and a base that never resolves (a fork whose default branch is not
  `main`, a remote that is not `origin`). A deletion-only push is the ONLY case that exits 0.
- turbo's `--affected` is MUTUALLY EXCLUSIVE with `--filter`: pass both and the filters are
  SILENTLY dropped (the selection comes back byte-identical). Since the gate needs exclusions, it
  spells out what the flag is shorthand for — `--filter=...[<base>...HEAD]` — which composes.
  Anything combining affected-ness with a filter must do the same, and must confirm it with
  `--dry=json` rather than trusting the flag.
- Per-task `inputs` overrides must be fail-SAFE (`$TURBO_DEFAULT$` plus exclusions), never an
  allowlist. An allowlist makes every unnamed file invisible to the cache key: the api packages
  listed `src/` + `tests/` + `pyproject.toml`, so editing an Alembic migration left `test` and
  `lint` hashes BYTE-IDENTICAL and replayed a stale PASS — even though `ruff check .` lints
  `alembic/` and `tests/test_migration_rls.py` applies the migrations to assert RLS deny-all.
  `uv.lock` was likewise missing from lint/typecheck, so a ruff/pyright bump reused old results.
  api `openapi` is the ONE justified allowlist: its input really is only `src/`, and `openapi.json`
  is its own output.
- `.gitattributes` pins LF in the repo AND in every working tree. Do not delete it: without it the
  behaviour depends on each developer's global git config, and `core.autocrlf=true` is the DEFAULT
  for Git for Windows — that checkout becomes CRLF, Prettier (whose `endOfLine` defaults to `lf`)
  then reports nearly every file as unformatted, and `pnpm run format:check` fails on a CLEAN clone.
- `pnpm run lint:root` covers what NO package owns — `scripts/` and root `*.{mjs,cjs,js,ts}` by
  GLOB (not a named list, so a new root config is covered the day it lands), plus `sh -n` on every
  `.lefthook/*.sh` via `scripts/lint-shell.mjs`. A syntax error in a hook script does not fail one
  test; it blocks every developer from committing at all, and nothing else in the repo reads shell.
  Both the hook and CI call this one script.
- `scripts/affected.mjs` is the SINGLE source of scope for the pre-push hook AND `ci.yml` — never
  compute "what changed" a second time anywhere. Two rules it encodes are non-obvious: a change to
  a `globalDependencies` file (`tsconfig.base.json`, `eslint.config.mjs`, `pnpm-workspace.yaml`,
  `mise.toml`) selects NO package, so the scope widens to everything; and an unresolvable base
  (all-zero `github.event.before` on a first push, or a force-push) also widens, because a gate
  must fail toward running MORE, never toward running nothing.
- `turbo.json` MUST list every root file that affects all packages under `globalDependencies`.
  Root files are otherwise invisible twice over: not in any task's cache key, and in no package
  directory. Proven before it was added — appending `noUnusedLocals` to `tsconfig.base.json` (which
  every package inherits via `@platform/config/tsconfig/*` → `packages/config/tsconfig/base.json` →
  `../../../tsconfig.base.json`) left `@platform/core#typecheck`'s hash byte-identical, so every
  task would have replayed a STALE cache hit while the gate ran zero tasks.
- pre-push runs `lint typecheck test build openapi`. `build` is the expensive one —
  `desktop#build` dependsOn `^export:web`, a full `expo export --platform web`, measured at 83s
  cold per affected product — and it is included ON PURPOSE: a Metro bundle fails in ways no type
  check sees (an import that does not resolve at bundle time, a native-only module dragged into
  web, a path-alias/metro/NativeWind break). If it ever has to go, drop `"build"` from `TASKS` in
  `scripts/pre-push.mjs`; do NOT filter instead — `--filter=!<pkg>#build` is silently ignored, and
  excluding the desktop PACKAGE takes its cheap lint/typecheck down with the expensive build.
- pyright lives in each api's `typecheck` script, NOT `lint`. That is what makes
  the pre-push `typecheck` task enforce it as PHILOSOPHY requires; while it sat
  inside `lint` (a task pre-push never ran) the strict-typing gate did nothing locally.
- pre-push SKIPS a product's pytest when that product's Supabase Postgres is unreachable
  (probed on `db.port` from its `supabase/config.toml` — same source the suite reads), prints
  which product it skipped, and lets CI run them. It never skips ruff/pyright for that api.
- Expo Go cannot receive push tokens — the push loop needs a dev build on a real device.
- Web deploys have NO workflow (Vercel git integration) — do not add one.
- `products/demo` is a STAMP of `products/_template` (snapshot, byte-derived). Never
  hand-edit demo — change `_template` and re-stamp (`rm -rf products/demo &&
pnpm new-product demo`; preserve the untracked `demo/api/.env` first). The generator
  reuses the freed portIndex, so the re-stamp keeps demo's ports even when
  higher-indexed products exist.
- The generator rewrites WHOLE-WORD tokens only — never embed `template`/`template_api`
  inside a longer identifier in `_template` files (e.g. a scratch-DB name like
  `<module>_rls_test`); keep the token word-delimited (`"template_api" + "_suffix"`).
  Audit stamps with substring `git grep -i template products/<name>`, not just `-iw`.
- Scripting pnpm/expo: set `CI=1` for non-TTY pnpm, but NEVER pass an empty `CI=` to
  expo-cli — its `getenv.boolish` throws on an empty string.
- `expo export` FORCES the production dotenv and Metro's transform cache does NOT key
  on `EXPO_PUBLIC_*` values — inject env vars directly AND pass `--clear` when the
  baked env matters (see `app/e2e/global-setup.ts`).

## Commands

```bash
pnpm bootstrap                                                # start EVERY product's local Supabase stack
pnpm turbo run lint typecheck test build openapi --affected   # the CI gate, scoped to changes
git diff --exit-code products/*/api-client products/*/api/openapi.json  # typegen drift check
node scripts/pre-push.mjs origin/main                           # run the pre-push gate by hand
pnpm run format:check                                         # prettier gate (`pnpm run format` to fix)
```

Root (product arg unless noted): `/new-product <name>` · `/remove-product <name>` ·
`/affected` ·
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
