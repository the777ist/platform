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
```

(Or build manually straight from `docs/phase-N-*.md`.) After Phase 7 you have a working
`products/_template` starter — auth screens, an API-backed list (items CRUD), settings with a
theme/dark toggle, and tab navigation.

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

## Locked stack (don't "upgrade" these without a decision)

pnpm 11 · Node 24 · Python 3.13 · **Expo SDK 56** (RN 0.85) · **NativeWind v4** on Tailwind v3
· Storybook 9 · TanStack Query v5 · Zustand v5 · **Electron 42** · **FastAPI** (Pydantic v2) ·
**Supabase** (Postgres + Auth + Realtime + Storage) · Turborepo · Vercel · Fly.io.

---

## Where to read more

| Doc | What it is |
|---|---|
| [`PHILOSOPHY.md`](PHILOSOPHY.md) | Architecture, locked decisions, conventions, repo spec |
| [`docs/phase-*.md`](docs/) | Literal step-by-step build guides (one per phase) |
| [`docs/research/`](docs/research/) | The fact-check behind every stack choice, with sources |
| [`packages/ui/FIGMA.md`](packages/ui/FIGMA.md) | Design-system / token contract (also the designer handover doc) |
| `CLAUDE.md` (root / `packages/ui` / per-product) | The authoritative add-a-thing recipes — *built during implementation* |
