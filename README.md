# Cross-Platform Template

A multi-product, cross-platform monorepo. Each product ships to **iOS, Android, web, and
desktop from one shared React Native codebase**, backed by its own **FastAPI** service and
segregated per-environment infrastructure.

One component, authored once in `@platform/ui`, renders to every target: native via Expo, web
via react-native-web, desktop via an Electron shell wrapping the same web build. There is **no
separate web or desktop app** — it's one frontend codebase plus a Python backend.

---

## Status

This repository currently holds the **architecture and the per-phase build guides**, not the
built template. Setting up therefore has two stages:

1. **Build the template once** (Phases 1–8) — see *Stage 1*.
2. **Stamp a product** with `pnpm new-product <name>` — see *Stage 2*. This is the everyday
   flow once the template exists.

The authoritative architecture and decisions live in **[`PHILOSOPHY.md`](PHILOSOPHY.md)**; the literal,
step-by-step build instructions live in **[`docs/`](docs/)** (`phase-1` … `phase-8`).

---

## Tech stack

**Frontend** — one React Native codebase → iOS · Android · web · desktop

| Layer | Choice |
|---|---|
| Framework / runtime | **Expo SDK 56** · React Native 0.85 · React 19.2 |
| Navigation | Expo Router |
| Web | react-native-web (Expo web export) |
| Desktop | **Electron 42** wrapping the web build (electron-builder / -updater) |
| Styling | **NativeWind v4** on Tailwind CSS v3 — semantic tokens, light/dark + brand modes |
| Components | `@platform/ui` — owned react-native-reusables primitives (`@rn-primitives/*`) |
| Data / state | **TanStack Query v5** (server) · **Zustand v5** (local) |

**Backend** — one FastAPI service per product

| Layer | Choice |
|---|---|
| Framework | **FastAPI** · Pydantic v2 (strict) |
| ORM / migrations | SQLModel · Alembic |
| Tooling | Python 3.13 · uv · Ruff · pyright (strict) |
| Data / auth | **Supabase** — Postgres · Auth (JWT/JWKS) · Realtime · Storage |
| IDs / limits | UUIDv7 (`uuid-utils`) · slowapi rate limiting |

**Design & testing**

| Concern | Choice |
|---|---|
| Design system | **Storybook 9** (`react-native-web-vite`) · Figma Code Connect + Variables · Style Dictionary v5 |
| JS tests | **jest-expo + React Native Testing Library** |
| API tests | **pytest** (real Postgres) |
| E2E / visual | Playwright (web, nightly) · Maestro (mobile, local) · Storybook VR |

**Monorepo, CI/CD & hosting**

| Concern | Choice |
|---|---|
| Monorepo | **pnpm 11** workspaces · **Turborepo** · **mise** (Node 24 / pnpm 11 / Python 3.13 / uv) |
| Git hooks | lefthook |
| CI | GitHub Actions (affected-only) |
| Hosting | **Vercel** (web) · **Fly.io** (API) · **EAS** (mobile) · GitHub Releases (desktop) |
| Observability | Sentry · structlog |

---

## Prerequisites

- **[mise](https://mise.jdx.dev/)** — pins the toolchain: **Node 24 LTS · pnpm 11 · Python
  3.13 · uv**. Run `mise install` to get them all.
- **[Supabase CLI](https://supabase.com/docs/guides/local-development)** — runs the full
  backend stack (Postgres, auth, storage) locally.
- The git repo name is irrelevant — nothing derives from it (app/infra ids come from *product*
  names).

---

## Stage 1 — build the template (one-time)

```bash
mise install            # Node 24, pnpm 11, Python 3.13, uv
```

Then execute the phases in order. Each follows its guide in `docs/` and ends with a
verification gate. With Claude Code, the `/implement` command drives a phase end-to-end:

```
/implement 1     # root tooling: pnpm workspace, Turborepo, mise, lefthook
/implement 2     # @platform/ui design system + Storybook + Figma token pipeline
/implement 3     # FastAPI backend (SQLModel, Alembic, layered services)
/implement 4     # OpenAPI -> typed client + TanStack Query hooks
/implement 5     # Electron desktop shell
/implement 6     # Supabase auth, route guards, storage
/implement 7     # the `new-product` generator
/implement 8     # CI/CD, observability, realtime, push
/implement 9     # finalize: strip build scaffolding (destructive; after 1-8 verified)
```

(Or build manually straight from `docs/phase-N-*.md`.) After Phase 7 you have a working
`products/_template` starter — auth screens, an API-backed list (items CRUD), settings with a
theme/dark toggle, and tab navigation. **Phase 9** is the graduation step: once 1–8 are built
and verified, it strips the template machinery.

---

## Stage 2 — create a product (the everyday flow)

```bash
pnpm new-product blog
```

The generator copies `products/_template` → `products/blog`, whole-word-renames every
`template` token, assigns a non-colliding port block, runs `pnpm install`, and **prints an
infrastructure checklist**. Work through that checklist (the external accounts it can't create
for you):

- **2 Supabase projects** (`<org>-blog-stg|prod`)
- **Fly apps**: `fly apps create <org>-blog-api-stg|prod` + secrets
- **Vercel** project (root `products/blog/app`, output `dist`)
- **EAS**: `eas init` → paste the `projectId` into `app.config.ts`
- **`<org>/blog-desktop-releases`** repo + `GH_TOKEN` (Electron auto-update)
- **Sentry** projects + DSNs; per-product GitHub Action secrets

Then run it locally:

```bash
pnpm bootstrap          # mise -> install -> supabase start (full local stack)
pnpm dev                # run the Expo app (web/native) + local API
```

Make it yours: replace brand assets (`gen-brand.mjs`, uses `sharp`), set the product's **Figma
brand mode**, then `/sync-tokens` re-themes everything with zero component edits.

---

## Repository layout

```
packages/
  ui/                   # @platform/ui — owned design system (shadcn model)
  core/                 # @platform/core — supabase client, auth, query client, env
  config/               # @platform/config — shared tsconfig/eslint/tailwind presets
products/
  _template/            # the starter stamped by `new-product`
  <name>/
    app/                # Expo app (iOS + Android + web)
    desktop/            # thin Electron wrapper around the web build
    api/                # FastAPI service (its own uv project)
    api-client/         # generated TS client (committed, never hand-edited)
docs/                   # phase-by-phase build guides (phase-1 … phase-8) + research/
```

---

## Conventions that bite (read before writing code)

- **Components are *owned*, not dependencies** — `@platform/ui` is copied-in source you edit.
- **Semantic tokens only** (`bg-primary`, never hex). Brand = a token *mode*, never a forked
  component.
- **API is strictly layered**: `schemas/` (Pydantic DTOs) → `routers/` (thin) → `services/`
  (logic + data access) → `models/` (SQLModel). DTOs are never the ORM models.
- **Never hand-edit the generated API client** — change the endpoint, run typegen, it
  regenerates. CI fails on drift.
- **Realtime is broadcast-only** — tables are RLS-deny-all; the API broadcasts "invalidate"
  events and clients refetch through the API.
- **Promote to `packages/*` on the 2nd use**, not the first. Features start product-local.
- **Per-platform overrides** via `*.ios.tsx` / `*.web.tsx` / `*.native.tsx` extensions.

Fixed recipes (enforced, exposed as slash commands): **`/add-component`** (cli-add → story →
Code Connect map → export → VR baseline) and **`/add-feature`**
(`model → service → schema → router → openapi → typegen → hook → screen`).

---

## Operational stack (agentic-workflow integrations)

Product development here is **agentic** — driven by the `ptfm-*` slash-command pipeline (below).
That pipeline integrates external services over MCP; connect these in Claude Code before running
it:

| Service | Role in the workflow | MCP family |
|---|---|---|
| **Linear** | Issue tracking — tickets, per-phase sub-issues, parent epics | `mcp__Linear__*` |
| **Notion** | Product briefs, user research, decision records | `mcp__Notion__*` |
| **Figma** | Design source — frames, Code Connect, token modes | `mcp__Figma__*` |
| **Supabase** | Database/auth — read-only schema introspection | `mcp__Supabase__*` |
| **Playwright** | Live web verification / E2E | `mcp__playwright__*` |
| **GitHub** | Repos, PRs, CI | `mcp__github__*` |

Deploy surfaces: **Fly.io** (API) · **Vercel** (web) · **EAS** (mobile) · **GitHub Releases**
(desktop).

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

These commands are distinct from the thin `pnpm`/`turbo` wrappers — they encode the project's
invariants as executable flows. (Not to be confused with `/implement`, the *build-time* command
that constructs the monorepo's eight phases.)

---

## Maintaining this template

`/update` keeps the template current: it re-runs **deep web research** for every surface
against current official docs, then folds the findings into the research reports,
`PHILOSOPHY.md`, the phase guides, the `ptfm-*` commands, and this README — bumping versions and
adapting to changed APIs / deprecations, every change cited to a live source. Run `/update <N>` to update a given phase of the template
(phase numbers map to the same phase as `/implement <N>`), or `/update` without args to update
the entire stack. It is **research-gated**: if live web research isn't available it stops rather
than update from stale knowledge.

---

## Where to read more

| Doc | What it is |
|---|---|
| [`PHILOSOPHY.md`](PHILOSOPHY.md) | Architecture, locked decisions, conventions, repo spec |
| [`docs/phase-*.md`](docs/) | Literal step-by-step build guides (one per phase) |
| [`docs/research/`](docs/research/) | The fact-check behind every stack choice, with sources |
| [`packages/ui/FIGMA.md`](packages/ui/FIGMA.md) | Design-system / token contract (also the designer handover doc) |
| `CLAUDE.md` (root / `packages/ui` / per-product) | The authoritative add-a-thing recipes — *built during implementation* |
