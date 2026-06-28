---
description: Plan a feature / bug fix end-to-end for one product from a Linear ticket — saves a comprehensive, cross-target implementation plan to the product's docs/plans/
argument-hint: "<product> <ticket-id> [slug] [user-instruction]"
---

Args: $ARGUMENTS

Expected shape: `<product> <TICKET-ID> [slug-or-title] [primary user instruction]`

- **`<product>`** — **first token, required.** The product directory under `products/` (e.g. `blog`). If absent: infer from cwd when the session is inside `products/<name>/...`; else STOP and ASK. Validate `products/<product>/` exists; if not, STOP and ASK. EVERYTHING this command does — codebase walk, globs, save paths, architecture lookups — is scoped to `products/<product>/`.
- **`<TICKET-ID>`** — second token (e.g. `BLOG-145`). **Required.** If not passed, the resolve block below auto-infers from the current branch; if it can't, STOP and ask.
- **`[slug-or-title]`** — optional next token (kebab-case slug or quoted title). Overrides the auto-inferred slug. If absent, the resolve block globs the product's `docs/plans/` and `docs/implementation/` to recover it.
- **`[primary user instruction]`** — anything after the slug (or after the ticket ID if no slug-shaped token follows). Freeform guidance for THIS specific invocation — adjust scope, focus, or emphasis as instructed. **It does NOT override the absolute rules below** — if it conflicts with a rule, prefer the rule and surface the conflict to the user.

---

We need to plan the full implementation for Linear ticket `<TICKET-ID>` in product `<product>`. Fetch the ticket from Linear, walk the relevant codebase in great depth, think hard, go step by step, create as many to-dos as needed, and produce an **EXTREMELY DETAILED** plan that another agent can execute to completion.

**Resolve `<product>`, `<TICKET-ID>` and `<slug>` BEFORE doing anything else.**

1. **`<product>`** — first token. If absent, infer from cwd (`products/<name>/...`); else STOP and ASK. Confirm `products/<product>/` exists.
2. **`<TICKET-ID>`** — if a ticket token was provided in `$ARGUMENTS`, use it. Otherwise run `git branch --show-current` and extract the `<TEAM>-<NUMBER>` portion (e.g. `BLOG-145` from `feature/BLOG-145-tag-bulk-edit`). If neither yields a ticket, STOP and ASK — do NOT guess.
3. **`<slug>`** — if a slug-shaped token was provided, use it. Otherwise `Glob products/<product>/docs/plans/<TICKET-ID>*_plan.md` and `products/<product>/docs/implementation/<TICKET-ID>*_implementation.md` to recover the canonical slug (the segment between `<TICKET-ID>-` and the `_plan.md` / `_implementation.md` suffix). For new tickets with no plan yet, derive the slug from the Linear ticket title (kebab-case, ~5–8 words).

Reference docs (read these first, in full, in this order):

- @PHILOSOPHY.md — the architecture/decision GOSPEL: locked decisions, conventions, invariants, Definition-of-Done. **This is law.**
- @CLAUDE.md (repo root) — monorepo map + conventions.
- @products/<product>/CLAUDE.md — the product's structure, ports, infra names.
- the nested **API** `CLAUDE.md` under `products/<product>/api/` — the add-an-endpoint recipe.
- @packages/ui/CLAUDE.md + @packages/ui/FIGMA.md — design-system runbook + token contract.

(These CLAUDE.md files are produced as the monorepo is built; if one is absent, fall back to `PHILOSOPHY.md`.)

---

## Step 1 — Fetch the Linear ticket (and any upstream architecture doc, if one exists)

Many plans stand on their own — small features, bug fixes, isolated changes. Some larger multi-phase features have an upstream architecture doc produced by `/ptfm-architect` that decomposes the work into vertical, independently-shippable phases. **If an architecture doc exists for this work, it's the SOURCE OF TRUTH and this plan covers ONE phase from it; if not, plan the whole change directly.** Both flows are normal — don't force an architecture where one isn't needed.

1. **Fetch the current ticket from Linear** via the Linear MCP (`mcp__Linear__get_issue`). Capture title, full description (incl. acceptance criteria), comments, linked issues / blockers / parent / sub-issues, attached docs (Notion, Figma, Slack threads, GitHub PRs), status / project / team / cycle. Follow load-bearing external links. Do not skim. **Note the ticket's `parent` field** — if a parent epic exists, there might be an architecture doc on it.
2. **Resolve the upstream architecture doc.** Most often, **the user will name it in the primary user instruction** (the last arg) — this is the dominant path; check it first. The user might name it in any of these forms:
   - An epic / architecture ticket ID (e.g. `"epic BLOG-160"`, `"architecture BLOG-160"`, `"under BLOG-160"`, or just an extra ticket-shaped token in the instruction).
   - A direct file path (e.g. `"products/<product>/docs/architecture/BLOG-160-multi-channel-broadcast_architecture.md"`).
   - Prose context (e.g. `"phase 1 of the multi-channel broadcast architecture"`) — match by feature slug against existing `products/<product>/docs/architecture/*_architecture.md` files.
     Be flexible parsing this; if the user clearly meant an architecture and you can't unambiguously resolve which one, ASK rather than guess.

   **Fallbacks** (only if the user instruction doesn't reference an architecture):
   - **Linear parent traversal** — if the current ticket has a Linear parent, glob `products/<product>/docs/architecture/<PARENT-TICKET-ID>*_architecture.md`.
   - **Handoff-brief reverse lookup** — glob `products/<product>/docs/architecture/*_architecture.md` and skim each `## Handoff brief to /ptfm-plan` for the current ticket ID.
   - **Nothing matches** — that's the common case for small / medium standalone work; note "no upstream architecture" and proceed to Step 2 with direct planning. Do NOT force an architecture pass where one isn't warranted.

3. **If an architecture doc IS found, read it IN FULL** — every section: `## Context`, `## AS-IS architecture map`, `## Architectural surface area`, `## Pattern adherence checklist`, `## Phased delivery`, `## Test architecture per phase`, `## Risks & open questions`, `## Handoff brief to /ptfm-plan`. The architecture is binding when present: do NOT re-architect, re-decompose phases, or challenge the pattern-adherence checklist. If you genuinely think the architecture is wrong on a load-bearing point, STOP and surface to the user — amendments happen via `/ptfm-architect`, not silently in this plan.
4. **If working under an architecture, scope this plan to ONE phase.** The handoff brief lists each phase + Linear sub-issue + slug + focus. Match the current ticket ID against a phase; if the user instruction names a phase explicitly, use that; if unclear, ASK. Plan output: `products/<product>/docs/plans/<TICKET-ID>-<phase-slug>_plan.md` where `<TICKET-ID>` is the **current phase ticket** (this branch's ticket, NOT the epic's) and `<phase-slug>` is from the handoff brief. Example: architecture at `products/blog/docs/architecture/BLOG-160-multi-channel-broadcast_architecture.md`, Phase 1 on Linear `BLOG-161` → plan at `products/blog/docs/plans/BLOG-161-multi-channel-broadcast-phase-1_plan.md`.
5. **If NOT working under an architecture, plan directly.** Plan output: `products/<product>/docs/plans/<TICKET-ID>-<slug>_plan.md` where `<slug>` is kebab-case from the Linear ticket title (~5–8 words). This is the common case for small / medium changes — do NOT hard-stop to demand an architecture pass where one isn't warranted.
6. **If a plan already exists at the chosen output path**, surface to the user and ASK whether to amend or create a revision; do NOT overwrite without explicit consent.
7. **If the ticket is sparse**, ASK the user for missing context before proceeding rather than inventing requirements.

## Step 2 — Build complete depth-of-understanding

Walk the codebase exhaustively for the scope of this plan, **scoped to `products/<product>/` plus any shared `packages/` it touches.** **Do NOT stop until you have an absolutely complete picture of ALL the moving pieces this plan will touch.** Missing pieces in the plan are bugs in the plan.

For every surface this plan will touch, identify:

- **UI** — every component (existing and new), every `@platform/ui` primitive (`packages/ui/src/components/ui/*` — copied-in source you OWN; shadcn model) you'll compose with, every **semantic token** used (`bg-background`, `bg-primary`, `text-foreground`, `border-border`, … — NEVER raw hex; brand is a token *mode*), every cross-target difference (iOS / Android / web / desktop), light + dark, every responsive (web/tablet) breakpoint that matters, every loading / error / empty state.
- **API services** — the FastAPI strict-layered slice: `schemas/` (Pydantic v2 DTOs = the contract) → `routers/` (thin; `Depends` a service) → `services/` (one class per aggregate; holds the session; owns business logic AND data access; NO repository layer) → `models/` (SQLModel tables; persistence only). Method signatures, ownership/auth checks, slowapi rate-limit keys, typed errors raised, and the **RFC 9457 problem+json** `type`/code each maps to. **DTOs are ALWAYS separate from ORM models — never serialize a SQLModel row to the client.**
- **Schemas / contracts** — Pydantic v2 DTOs (`ConfigDict(strict=True)`); the occasional frontend `zod` form schema; cursor-pagination shape (`{ items, next_cursor }`, opaque base64-on-id).
- **Generated typed client** — what the OpenAPI → `@hey-api/openapi-ts` regen at `products/<product>/api-client/` produces (TanStack Query hooks). **NEVER hand-edit the generated client** — change the endpoint, run typegen, regenerate. CI fails on typegen drift.
- **Database** — Supabase Postgres tables, columns, indexes, **RLS deny-all** policies (the API's privileged role bypasses; Realtime/PostgREST surface opened per-table only where Realtime reads are wanted), **UUIDv7 PKs** (`uuid-utils`), RPCs, triggers. Use the Supabase MCP read-only (`mcp__Supabase__list_tables`, `mcp__Supabase__execute_sql`) to introspect. DELETE/UPDATE go via `session.execute(delete(...))`, never `session.exec(...)`.
- **Migrations** — what new Alembic migration(s) are needed under `products/<product>/api/.../alembic/versions/`; revision-id plan. Schema changes ONLY via Alembic (runs over the direct 5432 `DATABASE_MIGRATION_URL`).
- **Realtime / broadcast** — which mutations must broadcast invalidation events on the product channel (service-role HTTP call from FastAPI); which clients subscribe-and-invalidate (the `packages/core` helper → TanStack `invalidateQueries`). NO Postgres-Changes subscriptions.
- **Routes** — Expo Router screens under `products/<product>/app/` (route files stay thin one-liners; logic lives in `app/features/<feature>/`); FastAPI routers + middleware impact (`request_id`, problem+json handler, CORS allowlist incl. `app://` desktop, security headers).
- **State** — TanStack Query v5 (server state; the generated hooks) + Zustand v5 (local state); URL state; autosave / draft persistence. Note which idle → loading → success/error transitions matter.
- **Errors** — new typed service errors needed and the problem+json `type`/code each maps to; how they surface through the typed client and the global error boundary (user-facing text comes from problem+json, never a raw string).
- **Env vars** — anything new needed: API env via **pydantic-settings**; frontend env = committed **`EXPO_PUBLIC_*`** per-env files (`.env.development/.staging/.production`). Secrets live in native stores (Fly / EAS / Vercel / GH Actions), never in the repo.
- **Public surface** — what gets exported from the feature's `index.ts` (`products/<product>/app/features/<feature>/index.ts`) and any shared `packages/*` entry points.

For every existing file you'll touch: read it before planning to change it. Architecture decisions made without reading the code are usually wrong.

## Step 3 — Define the test strategy (CRITICAL — TDD-first; tests come before implementation)

Per `PHILOSOPHY.md`'s TDD philosophy, the plan must define the tests BEFORE the implementation sequence. The tests ARE the spec. The implementation agent writes them first, watches them go red, then builds to green.

For every surface the plan touches:

- **Bug fix (existing behaviour wrong)**: the plan MUST include a regression-test step that LOCKS IN today's broken behaviour FIRST (run green to prove the test captures reality), then EDITS those assertions to describe the corrected behaviour (they go red until the fix lands).
- **New feature**: write the tests that describe the desired end-state behaviour. They go red until the feature is built. The plan's Implementation Sequence turns them green step by step.
- **Refactor (no behaviour change)**: the existing test suite must stay green throughout — call this out explicitly. No assertion edits permitted.

Per-surface test layers (per `PHILOSOPHY.md`):

- **JS unit + component** — single Jest runner via the **jest-expo** preset + **React Native Testing Library (RNTL)** for ALL JS tests. Pure helpers, schemas, hooks, components, forms. RNTL v14 — `render`/`fireEvent`/`renderHook` are **async** (await them). Do NOT use `@testing-library/jest-native` (deprecated; matchers built into RNTL ≥12.4). Colocated `*.test.ts(x)`. **Never vitest, never `vi.mock` — use Jest (`jest.mock`).**
- **API unit + integration** — **pytest** against a **real Postgres** (per-test isolation via SQLAlchemy `join_transaction_mode="create_savepoint"`); httpx `ASGITransport(app=app)`; **polyfactory** factories; `seed.py` for local data. Integration = API **router → service → DB** round-trips and **cursor-pagination** round-trips.
- **Broadcast / realtime seam** — assert the **broadcast-and-invalidate** path: a mutation fires the invalidation event on the product channel, and the client's subscribe-and-invalidate helper calls `invalidateQueries`.
- **UI (RNTL)** — every form (validation + happy submit), every error display (the **problem+json**-translated message renders, NOT a raw string), every non-trivial component interaction.

**Test cases in the plan must be meaningful** (per `PHILOSOPHY.md` § testing rules that matter). Every test you list must verify **functionality, business logic, or a contract** — never just text presence, "renders without crashing", or snapshots. Banned patterns to flag and replace: renders-without-crashing, snapshot-only, `getByText`-as-only-assertion, asserting class names / inline styles / internal state. For each test case in the plan, state explicitly what it asserts: which **service method** is called with what payload; which **problem+json `type`/error code** surfaces in the error path; which **TanStack Query** state transition fires (idle → loading → success/error); which side effect (DB row content, **broadcast fired**, navigation, toast, autosave) is verified; the data shape after a Pydantic / Zod round-trip or a generated-client call. Before listing a test, ask "what real bug would this test catch?" — if the answer is "nothing", do not list it.

### Edge cases are AS IMPORTANT as test cases — enumerate them ALL

A plan that doesn't enumerate edge cases per surface is INCOMPLETE. Edge cases are the spec — they catch bugs that happy-path tests miss. For every surface, list every applicable edge case explicitly. At minimum (skip categories that genuinely don't apply, but justify each skip):

- **Boundary inputs** — empty / blank / whitespace-only, max-length, over-length, single character, wrong type, null, undefined.
- **Character-set inputs** — special characters, emojis, RTL text, multi-byte, leading/trailing whitespace, HTML / script-injection-shaped strings.
- **Concurrency / races** — rapid double-clicks on submit, cancel-then-retry, navigate-away-mid-mutation, two clients of the same feature, autosave-during-explicit-save, stale-cursor pagination.
- **Auth / ownership boundaries** — anonymous vs authenticated (Supabase Auth; the API verifies JWTs via JWKS), owner vs non-owner, accessing another user's resource via direct URL / API call, share-link revocation mid-flow. (Remember RLS is deny-all; the API is the gatekeeper.)
- **Rate-limit gates** — hitting the **slowapi** limit on every key (per-user on the verified JWT `sub`, falling back to per-IP), 429 response handling, retry-after surfacing.
- **Network failures** — fetch errors, request timeouts, slow networks, dropped connections, offline (the template's offline/error UX).
- **External-service failures** — Supabase RLS denial / DB error, broadcast HTTP call failure, JWKS fetch failure, a downstream third-party SDK rejecting, a typed service error mapping to problem+json.
- **State persistence** — refresh-mid-flow, navigate-away-and-back, draft autosave conflicts, query-cache staleness after a broadcast.
- **Cross-target coverage** — every target × theme combination behaves: **iOS, Android, web, desktop** × **light/dark** × **brand modes**, plus responsive on web/tablet. (This is the equivalent of full-surface coverage — never frame it as web breakpoints alone.)

Every enumerated edge case becomes a test in the `## Test plan` section. Every test in the test plan gets a make-it-pass step in the implementation sequence.

## Step 4 — Draft and save the plan

Save the plan to `products/<product>/docs/plans/<TICKET-ID>-<phase-slug>_plan.md` where `<TICKET-ID>` is the **current phase ticket** (this branch's ticket, NOT the architecture's epic ticket) and `<phase-slug>` is the phase-scoped slug from the architecture's `## Handoff brief to /ptfm-plan` (e.g. `multi-channel-broadcast-phase-1`). Example: architecture at `products/blog/docs/architecture/BLOG-160-multi-channel-broadcast_architecture.md`, Phase 1 on Linear `BLOG-161` → plan at `products/blog/docs/plans/BLOG-161-multi-channel-broadcast-phase-1_plan.md`. If a plan already exists at this path, surface to the user and ASK whether to amend or create a revision; do NOT overwrite without consent. (The `docs/plans/` dir is created on first write — no pre-seeding.)

The plan file MUST contain these sections (in this order):

### `# <TICKET-ID> — <Linear title>` (append `— <Phase name>` if working under an architecture)

### `## Architecture reference` (only if an upstream architecture exists)

If `/ptfm-plan` is running against an upstream architecture (Step 1), this section is mandatory and acts as the binding contract. Link to `products/<product>/docs/architecture/<EPIC-TICKET-ID>-<feature-slug>_architecture.md` and copy in (verbatim from the architecture):

- The phase scope (one paragraph from the architecture doc's Phased delivery, for THIS phase).
- The phase's IN / OUT bullets.
- The seam to the next phase.
- The success criterion.
- The pattern adherence checklist.

If you ever feel the urge to diverge from the architecture, STOP and surface to the user — amendments happen via `/ptfm-architect`, not silently in this plan.

If no upstream architecture exists (the common case for small / medium changes), SKIP this section entirely — direct planning per Step 1.

### `## Context`

Linear ticket link, problem statement, business reason, related work, stakeholders.

### `## Behaviour spec`

Current behaviour (for bug fixes) and / or desired behaviour (for new features), as a user-visible end-to-end flow. Edge cases. Acceptance criteria (Given / When / Then if useful).

### `## Architecture & data flow`

The layers involved (Expo Router screen → `@platform/ui` component → generated-client hook → FastAPI router → service → SQLModel/Supabase → broadcast). A textual flow diagram (Mermaid where it clarifies). Data shapes (Pydantic DTOs / SQLModel rows / generated-client types / the occasional Zod form schema). State machines if any.

### `## File-by-file changes`

Table of every file that will be created / modified / deleted, with one sentence of "what" and "why" per file.

| Path | Change | What | Why |
| ---- | ------ | ---- | --- |

### `## Backend changes`

New / modified Supabase tables, columns, indexes, **RLS deny-all** policies, RPCs, triggers, **UUIDv7** PKs. **Alembic** migration filenames + SQL/op sketches (schema changes ONLY via Alembic). The layered slice: `models/` → `services/` (method signatures + return DTOs) → `schemas/` (Pydantic v2 DTOs) → `routers/` (thin, `Depends`). New typed service errors + their **problem+json `type`/code**. **slowapi** rate-limit keys. Which mutations **broadcast** invalidation. The **typegen** step (OpenAPI → `@hey-api/openapi-ts` regen of `api-client/`). New env vars (pydantic-settings / `EXPO_PUBLIC_*`).

### `## Frontend changes`

New / modified components and the `@platform/ui` primitives they compose from (NEVER modify a shared primitive for one feature — add a cva variant / opt-in prop, or compose). Forms (RHF + Zod where needed). Expo Router routes affected (thin route files). The generated-client hooks consumed (TanStack Query) + Zustand local state. Loading / error / empty states. Toast + inline error wiring — user-facing text from the **problem+json**-typed error via the global error boundary, never a raw string. **Semantic tokens** used (never raw hex). Accessibility (keyboard / focus on web+desktop, screen-reader labels, focus management).

#### Cross-target plan (mandatory)

For every UI surface the change introduces or touches, document the EXPLICIT behaviour on **iOS, Android, web, and desktop**, plus **light/dark**, plus **brand modes**, plus **responsive on web/tablet**. State per-target and per-theme differences explicitly (platform-specific gestures / safe-area / keyboard avoidance, web vs native navigation, desktop window chrome, column counts and type sizes at tablet/desktop widths, what collapses or hides, sticky/fixed positioning, token-mode swaps). "Works on web only" or "light mode only" is INCOMPLETE. NEVER frame this as web breakpoints alone. A plan without this section is incomplete.

### `## Test plan`

- **Pre-change regression tests** (bug fixes only): files + what they lock in.
- **New tests for the change**: file paths + assertions per layer — RNTL (JS unit + component), pytest (API unit + integration), and the broadcast/realtime seam.
- **Run order** through the implementation sequence.

### `## Implementation sequence`

Numbered, dependency-ordered build steps following the canonical add-an-endpoint recipe where relevant: **model → service → schema → router → openapi → typegen → hook → screen**. Each step specifies:

- One narrow concern.
- Files it touches.
- Tests it adds / makes pass.
- Any user-approval gates (e.g. "show Alembic migration to user before applying", "show new env var to user before adding to pydantic-settings / `EXPO_PUBLIC_*` file").

### `## Risks & open questions`

Ambiguities, tradeoffs, production failure modes, dependencies, blockers.

### `## Definition of Done`

Lift the checklist from `PHILOSOPHY.md` so the executing agent has it inline:

- [ ] Plan doc updated (this file)
- [ ] Implementation log created (`products/<product>/docs/implementation/<TICKET-ID>-<slug>_implementation.md`)
- [ ] RNTL JS unit + component tests added/updated
- [ ] pytest API unit + integration tests added/updated
- [ ] Broadcast / realtime seam test added/updated (where the change broadcasts)
- [ ] Typegen regenerated, no drift (`git diff --exit-code` on `api-client/`)
- [ ] `turbo run lint typecheck test build --filter=...<product>...` green (+ `export:web` where the change touches web) — lint + typecheck + tests + the Expo web export / app build are all first-class gates
- [ ] For API changes: `ruff check && ruff format --check && pyright && pytest` all green (Ruff + pyright strict + Pydantic strict + pytest)
- [ ] Zero `.only`, zero `.skip`, zero new ignores

---

## ABSOLUTE, NON-NEGOTIABLE RULES

- **If an upstream architecture doc exists, it's the SOURCE OF TRUTH and BINDING.** Read it in full, treat its phasing / pattern-adherence checklist / seams as fixed, scope this plan to ONE phase from it, and never re-architect silently. Epic ticket ≠ phase ticket — the architecture lives on the parent epic; this plan lives on the current phase sub-issue. If the architecture is genuinely wrong, STOP and surface; amendments happen via `/ptfm-architect`, not in this plan. **For most work (small features, bug fixes, isolated changes), no architecture exists — direct planning is fine and expected; do NOT force an architecture pass where one isn't warranted.**
- **NO CODE CHANGES during this run.** This is a planning pass. The only file written is the plan markdown. No migrations applied, no typegen run, no env vars set, no git operations. Implementation happens in a separate session that executes against the plan.
- **Frontend changes STRICTLY conform to the design system.** Every colour / font / spacing / radius comes from **semantic tokens** (`bg-background`, `bg-primary`, `text-foreground`, `border-border`, …) via NativeWind — token values come from the Figma pipeline (`theme.ts` / `global.css`); NEVER raw hex, never hand-name a colour. Brand is a token **mode**; light + dark from day one (runtime-switchable). Every primitive comes from `@platform/ui` (`packages/ui/src/components/ui/*`). NEVER modify a shared primitive to suit one feature — extend with an opt-in prop, add a cva variant, or compose on top. Every UI surface needs explicit cross-target decisions (iOS / Android / web / desktop + light/dark + brand + responsive on web/tablet).
- **Backend changes STRICTLY conform to existing patterns.** Strict-layered OOP: `schemas/` → `routers/` (thin) → `services/` (one class per aggregate; owns logic AND data access; NO repository layer) → `models/` (SQLModel; persistence only). **DTOs ALWAYS separate from ORM models — never serialize a SQLModel row to the client.** Services never throw raw across the boundary — they raise typed errors mapped to **RFC 9457 problem+json**, typed into the generated client. **RLS deny-all** on every table; **UUIDv7** PKs; DELETE/UPDATE via `session.execute(delete(...))`. Schema changes ONLY via **Alembic** (show migration before applying — user-approval gate). **slowapi** rate-limit every public / authenticated endpoint. Validate every input via **Pydantic v2 strict** (`ConfigDict(strict=True)`). After mutations, **broadcast** invalidation on the product channel; clients refetch through the API (NO Postgres-Changes subscriptions, no RLS holes). After any contract change: **OpenAPI → typegen → regenerate** the client (NEVER hand-edit it; CI fails on drift).
- **Cross-target plan is MANDATORY.** A plan that doesn't give explicit per-target decisions for **iOS, Android, web, and desktop** — plus light/dark, plus brand modes, plus responsive on web/tablet — is INCOMPLETE. "Works on web only" or "light mode only" does not ship.
- **Tests-for-existing-behaviour FIRST (bug fixes).** For bug fixes, the plan must include regression tests that lock in current behaviour BEFORE the fix, run them green, and only then plan the change. This prevents silent regressions.
- **Exhaustive moving-pieces inventory.** Do NOT stop researching until you have a complete picture: every file, table, RPC, component, route, type, DTO/schema, problem+json error code, env var, rate-limit key, Alembic migration, broadcast event, generated-client hook, public export. "I think there might be more" is not done.
- **Extremely detailed plan output.** The plan is read by another agent who will execute it. Every step must specify: files to touch, code sketches / signatures, test cases to add, sequence dependencies. "Add a button" is not a step. "Add `<Button variant=\"cta\">Save</Button>` (from `@platform/ui`) to `PostToolbar` between the Share and Delete buttons; on press call the generated `useSavePost()` mutation hook with `{ postId }`; on success show toast 'Post saved' and let the broadcast invalidate the list query; on failure render the problem+json-typed error through the global error boundary with fallback 'Couldn't save — please try again.'" is.
- **Save path**: `products/<product>/docs/plans/<TICKET-ID>-<slug>_plan.md`. `<TICKET-ID>` is always the current branch's ticket. `<slug>` is the phase slug from the architecture's handoff brief (when working under an architecture) or kebab-case from the Linear title (when direct planning).

What `/ptfm-plan` does NOT mean:

- **Not re-architecting an existing architecture** — when an upstream architecture exists, its phasing / pattern adherence / seams are binding. If they're wrong, surface to the user; don't silently overrule. (For direct planning where no architecture exists, this rule doesn't apply.)
- **Not planning multiple phases at once when working under an architecture** — each phase gets its own `/ptfm-plan` invocation.
- Not implementing — only planning. No code edits, no migrations applied, no typegen run, no env edits.
- Not creating / updating Linear tickets, not changing ticket status — only reading.
- Not running tests or starting dev servers.
- Not pushing to git, not creating PRs.

## Available MCPs (use as needed)

- **Linear** (`mcp__Linear__*`) — `get_issue`, `list_comments`, `get_project`, `list_issues`, `search_documentation` for context. The primary source of the ticket.
- **Notion** (`mcp__Notion__*`) — fetch any Notion docs the Linear ticket references.
- **Figma** (`mcp__Figma__*`) — deep design integration: Code Connect + design tokens. The design reference for any UI surface; pull token defs (`get_variable_defs`), screenshots, and the component-to-code mapping so the plan's tokens / primitives match the source of truth.
- **Supabase** (`mcp__Supabase__*`) — **read-only schema introspection only**: `list_tables`, `list_migrations`, `execute_sql` for read-only schema queries. Migrations go via **Alembic**, not raw `apply_migration` — the MCP introspects, it does not mutate schema here.
- **Playwright** (`mcp__playwright__*`) — only if you need to inspect existing web behaviour live (rare during planning).

Deployment context spans the project's four surfaces — **Fly** (api), **EAS** (mobile), **Vercel** (web), **Electron** (desktop) — a light reference, not a workflow pillar.

---

Start now. Resolve `<product>`, then fetch the Linear ticket. Quickly check whether an upstream architecture doc exists under `products/<product>/docs/architecture/` (parent traversal / user override / handoff-brief reverse lookup). If one does, load it in full and scope this plan to ONE phase from it. If not — the common case for small / medium changes — plan the whole change directly. Walk the codebase. Think hard. Plan exhaustively. Save the plan to `products/<product>/docs/plans/<TICKET-ID>-<slug>_plan.md`. Hand off with `/ptfm-implement <product> <TICKET-ID> ...`. Do NOT stop until every moving piece is accounted for, every target × theme has a decision, every surface has a test plan, and the implementation sequence is dependency-ordered.
