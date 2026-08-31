# Cross-Platform Template

A multi-product, cross-platform monorepo. Each product ships to **iOS, Android, web, and
desktop from one shared React Native codebase**, backed by its own **FastAPI** service and
segregated per-environment infrastructure.

One component, authored once in `@platform/ui`, renders to every target: native via Expo, web
via react-native-web, desktop via an Electron shell wrapping the same web build. There is **no
separate web or desktop app** — it's one frontend codebase plus a Python backend.

---

## Tech stack

**Frontend** — one React Native codebase → iOS · Android · web · desktop

| Layer               | Choice                                                                           |
| ------------------- | -------------------------------------------------------------------------------- |
| Framework / runtime | **Expo SDK 57** · React Native 0.86 · React 19.2                                 |
| Navigation          | Expo Router                                                                      |
| Web                 | react-native-web (Expo web export)                                               |
| Desktop             | **Electron 44** wrapping the web build (electron-builder / -updater)             |
| Styling             | **NativeWind v4** on Tailwind CSS v3 — semantic tokens, light/dark + brand modes |
| Components          | `@platform/ui` — owned react-native-reusables primitives (`@rn-primitives/*`)    |
| Data / state        | **TanStack Query v5** (server) · **Zustand v5** (local)                          |

**Backend** — one FastAPI service per product

| Layer            | Choice                                                         |
| ---------------- | -------------------------------------------------------------- |
| Framework        | **FastAPI** · Pydantic v2 (strict)                             |
| ORM / migrations | SQLModel · Alembic                                             |
| Tooling          | Python 3.13 · uv · Ruff · pyright (strict)                     |
| Data / auth      | **Supabase** — Postgres · Auth (JWT/JWKS) · Realtime · Storage |
| IDs / limits     | UUIDv7 (`uuid-utils`) · slowapi rate limiting                  |

**Design & testing**

| Concern       | Choice                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Design system | **Storybook 10** (`react-native-web-vite`) · Figma Code Connect + Variables · Style Dictionary v5 |
| JS tests      | **jest-expo + React Native Testing Library**                                                      |
| API tests     | **pytest** (real Postgres)                                                                        |
| E2E / visual  | Playwright (web, nightly) · Maestro (mobile, local) · Storybook VR                                |

**Monorepo, CI/CD & hosting**

| Concern       | Choice                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------- |
| Monorepo      | **pnpm 11** workspaces · **Turborepo** · **mise** (Node 24 / pnpm 11 / Python 3.13 / uv) |
| Git hooks     | lefthook                                                                                 |
| CI            | GitHub Actions (affected-only)                                                           |
| Hosting       | **Vercel** (web) · **Fly.io** (API) · **EAS** (mobile) · GitHub Releases (desktop)       |
| Observability | Sentry · structlog                                                                       |

---

## Prerequisites

- **[mise](https://mise.jdx.dev/)** — pins the toolchain: **Node 24 LTS · pnpm 11 · Python
  3.13 · uv**. Run `mise install` to get them all. On a **fresh clone run `mise trust` first**:
  mise refuses to read a config it has not been told to trust, and trust is keyed to the absolute
  path, so a brand-new clone starts untrusted and `mise install` exits 1. `pnpm bootstrap` now
  does the `mise trust` for you.
- **[Supabase CLI](https://supabase.com/docs/guides/local-development)** + **Docker** — the
  local backend stack (Postgres, auth, storage) runs in Docker, so **Docker must be running**
  for `supabase start` / `pnpm bootstrap`.
- **Agentic workflow (optional but recommended):** the `ptfm-*` pipeline drives MCP servers.
  The committed root `.mcp.json` brings **Sentry, Fly, Expo, Vercel, Semgrep, Chrome DevTools**
  with the clone (authenticate the OAuth ones via `/mcp`); connect **Supabase, GitHub, Figma,
  Linear, Notion, Playwright** in Claude Code yourself — and actually sign in: a connected but
  unauthenticated server counts as absent (see **Operational stack** below).
- The git repo name is irrelevant — nothing derives from it (app/infra ids come from _product_
  names).

---

## Create a product (the everyday flow)

```bash
pnpm new-product blog
```

The generator copies `products/_template` → `products/blog`, whole-word-renames every
`template` token, assigns a non-colliding port block, runs `pnpm install`, and **prints an
infrastructure checklist**. The checklist is **deploy-time only** — nothing on it blocks
local development, so it can wait until the product ships. It covers the external accounts
the generator can't create for you:

- **2 Supabase projects** (`<org>-blog-stg|prod`)
- **Fly apps**: `fly apps create <org>-blog-api-stg|prod` + secrets
- **Vercel** project (root `products/blog/app`, output `dist`)
- **EAS**: `eas init` → paste the `projectId` into `app.config.ts`
- **`<org>/blog-desktop-releases`** repo + `GH_TOKEN` (Electron auto-update)
- **Sentry** projects + DSNs; per-product GitHub Action secrets

Then run it locally (zero cloud accounts needed):

```bash
pnpm bootstrap                        # mise -> install -> supabase start (full local stack)

# first run only — the stamped stack starts EMPTY (no api/.env, no tables, no data):
cd products/blog && supabase status   # note the service_role key
cd api && cp ../.env.example .env     # ports are already this product's local ones
#   -> paste the service_role key into SUPABASE_SERVICE_ROLE_KEY
uv run alembic upgrade head           # create the schema
uv run python -m blog_api.seed        # seed demo data (module = <name>_api)
cd ../../..                           # back to the repo root

pnpm turbo run dev --filter=*blog-*   # run the Expo app (web/native) + local API
```

The generator prints these first-run steps after stamping; the full recipe (including the
env-file traps to avoid) lives in the product's own README under "Run it locally".

Make it yours: replace brand assets (`gen-brand.mjs`, uses `sharp`), set the product's **Figma
brand mode**, then `/sync-tokens` re-themes everything with zero component edits.

To delete a product later: `pnpm remove-product <name>` — the exact inverse (stops its local
stack, removes the tree + lockfile workspaces + brand-mode entry, prints the de-provision
checklist).

---

## Repository layout

```
packages/
  ui/                   # @platform/ui — owned design system (shadcn model)
  core/                 # @platform/core — supabase client, auth, query client, env
  config/               # @platform/config — shared tsconfig/eslint/tailwind presets
devbox/                 # Fly.io persistent cloud workstation (one machine+volume per seat)
products/
  _template/            # the starter stamped by `new-product`
  <name>/
    app/                # Expo app (iOS + Android + web)
    desktop/            # thin Electron wrapper around the web build
    api/                # FastAPI service (its own uv project)
    api-client/         # generated TS client (committed, never hand-edited)
```

---

## Conventions that bite (read before writing code)

- **Components are _owned_, not dependencies** — `@platform/ui` is copied-in source you edit.
- **Semantic tokens only** (`bg-primary`, never hex). Brand = a token _mode_, never a forked
  component.
- **API is strictly layered**: `schemas/` (Pydantic DTOs) → `routers/` (thin) → `services/`
  (logic + data access) → `models/` (SQLModel). DTOs are never the ORM models.
- **Never hand-edit the generated API client** — change the endpoint, run typegen, it
  regenerates. CI fails on drift.
- **Realtime is broadcast-only** — tables are RLS-deny-all; the API broadcasts "invalidate"
  events and clients refetch through the API.
- **Promote to `packages/*` on the 2nd use**, not the first. Features start product-local.
- **Per-platform overrides** via `*.ios.tsx` / `*.web.tsx` / `*.native.tsx` extensions.
- **Git hooks are tiered, and CI re-runs all of it.** `pre-commit` (~5s) only ever runs
  auto-fixers on staged files — eslint/ruff first, then prettier/ruff-format so the formatter
  gets the last write. `commit-msg` enforces Conventional Commits. `pre-push` runs the real gate
  (lint · pyright/tsc · unit tests · the web bundle · typegen drift · one Alembic head · the
  migration lock-safety lint), scoped to
  the commits you are actually pushing. `--no-verify` skips a hook, but every one of those gates
  has a CI counterpart that runs unconditionally — so it buys you a faster local loop, not a way
  around the gate. Run it by hand any time with `/affected` or
  `node scripts/pre-push.mjs origin/main`.
- **Migrations are linted for lock-taking DDL** (`scripts/check-migration-safety.mjs` — squawk
  over `alembic upgrade head --sql`, no database needed). Migrations run against production as a
  Fly release command, and every test suite runs them against an empty idle database where any
  DDL is instantly safe — so a table-locking migration is a failure mode only this linter can see
  before the deploy does. `alembic/env.py` sets `lock_timeout` + `statement_timeout` in both
  modes; deleting those SETs fails the gate.
- **A product's pytest needs that product's stack up.** If its Postgres is unreachable, pre-push
  says so loudly and skips only that product's API tests (its ruff and pyright still run); CI runs
  them against a real Postgres regardless.

Fixed recipes (enforced, exposed as slash commands): **`/add-component`** (cli-add → story →
Code Connect map → export → VR baseline) and **`/add-feature`**
(`model → service → schema → router → openapi → typegen → hook → screen`).

---

## Operational stack (agentic-workflow integrations)

Product development here is **agentic** — driven by the `ptfm-*` slash-command pipeline (below).
That pipeline integrates external services over MCP, in two tiers:

**Committed** — the root **`.mcp.json`** declares the servers every clone gets automatically
(Claude Code offers them on first session; OAuth ones authenticate via `/mcp`):

| Service             | Role in the workflow                                                                | MCP family                |
| ------------------- | ----------------------------------------------------------------------------------- | ------------------------- |
| **Sentry**          | Runtime errors + traces — both halves of the `X-Request-Id` chain (OAuth)           | `mcp__sentry__*`          |
| **Fly.io**          | API deploys, machines, secrets, **release logs** (migrations run there) — local CLI | `mcp__fly__*`             |
| **Expo / EAS**      | Builds, workflows, TestFlight crash data (OAuth)                                    | `mcp__expo__*`            |
| **Vercel**          | Web deployments, build + runtime logs, analytics (OAuth)                            | `mcp__vercel__*`          |
| **Semgrep**         | Deterministic SAST floor under `/ptfm-review` (free OSS engine, via `uvx`)          | `mcp__semgrep__*`         |
| **Chrome DevTools** | Web perf traces — Core Web Vitals (LCP/CLS/INP) in `/ptfm-test-ui`                  | `mcp__chrome-devtools__*` |

**User-connected** — connect (and authenticate) these in Claude Code yourself; the pipeline
assumes they are live:

| Service        | Role in the workflow                                         | MCP family           |
| -------------- | ------------------------------------------------------------ | -------------------- |
| **Linear**     | Issue tracking — tickets, per-phase sub-issues, parent epics | `mcp__Linear__*`     |
| **Notion**     | Product briefs, user research, decision records              | `mcp__Notion__*`     |
| **Figma**      | Design source — frames, Code Connect, token modes            | `mcp__Figma__*`      |
| **Supabase**   | Database/auth — read-only schema introspection               | `mcp__Supabase__*`   |
| **Playwright** | Live web verification / E2E                                  | `mcp__playwright__*` |
| **GitHub**     | Repos, PRs, CI                                               | `mcp__github__*`     |

Connected-but-unauthenticated counts as absent: Figma and Supabase in particular expose only an
`authenticate` tool until you sign in, and `/sync-tokens`, `/bootstrap-design-system`, and
`/ptfm-review`'s RLS checks all silently lose their inputs when they are in that state.

Deploy surfaces: **Fly.io** (API) · **Vercel** (web) · **EAS** (mobile) · **GitHub Releases**
(desktop).

### Cloud dev workstation (`devbox/`)

A persistent Claude Code workstation on Fly.io — one machine + one volume per seat; start it,
work over `fly ssh console` + tmux, stop it, and resume the SAME box later (Claude/gh/MCP
auth, clones and caches all persist on the volume). Org-parameterized like all infra here
(`example-devbox` placeholder; the wrapper refuses to run until it's swapped). Lifecycle:
`node scripts/devbox.mjs create|up|ssh|down|deploy`. Full runbook: [`devbox/README.md`](devbox/README.md).

### Development workflow — the `ptfm-*` pipeline

Products are built via a namespaced agentic pipeline. Every command takes the **product name as
its first argument** and writes its artifact under that product's own docs tree
(`products/<product>/docs/{product,architecture,plans,implementation,reviews}/`):

```
/ptfm-product → /ptfm-architect → /ptfm-plan → /ptfm-implement → /ptfm-audit
              → /ptfm-simplify → /ptfm-commonify → /ptfm-review → /ptfm-test-ui
```

- **`product` + `architect`** are optional (new product surfaces / multi-phase features); small
  features and bug fixes enter at **`plan`**.
- **`plan → implement → audit`** is the core spine; the rest is the post-implementation quality
  cascade. `review` and `test-ui` run last so they assess the final shipped shape.
- When the optional head runs, each artifact binds the next (product brief → architecture →
  per-phase plan).
- **`/ptfm-pipeline-run <product> <ticket>`** automates the execution half end-to-end as a
  checkpointed orchestrator — a fresh subagent per stage with its full instructions, every
  human gate halts with a terminal question + push notification, and re-running the same
  command resumes any run from wherever the artifacts say it stopped.

These commands are distinct from the thin `pnpm`/`turbo` wrappers — they encode the project's
invariants as executable flows.

---

## Where to read more

| Doc                                              | What it is                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [`PHILOSOPHY.md`](PHILOSOPHY.md)                 | Architecture, locked decisions, conventions, repo spec                                                              |
| [`packages/ui/FIGMA.md`](packages/ui/FIGMA.md)   | Design-system / token contract (also the designer handover doc)                                                     |
| `CLAUDE.md` (root / `packages/ui` / per-product) | The authoritative add-a-thing recipes (root map/conventions · design-system runbook · product + nested api recipes) |
