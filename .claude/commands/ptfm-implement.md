---
description: Implement a feature / bug fix end-to-end against an existing plan — builds the feature across the Expo app + FastAPI API, regenerates the typed client, adds mandatory RNTL + pytest tests, keeps an implementation log
argument-hint: "<product> <ticket-id> [slug] [user-instruction]"
---

Args: $ARGUMENTS

Expected shape: `<product> <TICKET-ID> [slug-or-title] [primary user instruction]`

- **`<product>`** — first token (e.g. `blog`). **Required.** The product directory under `products/`. If absent, infer it from cwd when the session is inside `products/<name>/...`; otherwise STOP and ASK. Validate `products/<product>/` exists; if it does not, STOP and ASK. EVERYTHING this command does — the codebase walk, every glob, every save path — is scoped to `products/<product>/`.
- **`<TICKET-ID>`** — second token (e.g. `PTFM-145`). **Required.** If not passed, the resolve block below auto-infers from the current branch; if it can't, STOP and ask.
- **`[slug-or-title]`** — optional next token (kebab-case slug or quoted title). Overrides the auto-inferred slug. If absent, the resolve block globs `plans/` and `implementation/` to recover it.
- **`[primary user instruction]`** — anything after the slug (or after the ticket ID if no slug-shaped token follows). Freeform guidance for THIS specific invocation — adjust scope, focus, or emphasis as instructed. **It does NOT override the absolute rules below** — if it conflicts with a rule, prefer the rule and surface the conflict to the user.

---

We need to implement the full fix / feature for Linear ticket `<TICKET-ID>` (in product `<product>`) exactly as laid out in its plan doc. Fetch the ticket from Linear, load the plan doc, walk the relevant codebase in great depth, think hard, go step by step, create as many to-dos as needed, build the feature, then add comprehensive tests in the SAME pass, then keep the implementation log up to date.

**Resolve `<product>`, `<TICKET-ID>` and `<slug>` BEFORE doing anything else.**

1. **`<product>`** — if a first token was provided in `$ARGUMENTS`, use it. Otherwise, if the session is inside `products/<name>/...`, infer `<name>`. Validate `products/<product>/` exists. If you cannot resolve a valid product, STOP and ASK — do NOT guess.
2. **`<TICKET-ID>`** — if a ticket-shaped token was provided in `$ARGUMENTS`, use it. Otherwise run `git branch --show-current` and extract the `<TEAM>-<NUMBER>` portion (e.g. `PTFM-145` from `feature/PTFM-145-d2c-bulk-edit`). If neither yields a ticket, STOP and ASK — do NOT guess.
3. **`<slug>`** — if a slug-shaped token was provided, use it. Otherwise `Glob products/<product>/docs/plans/<TICKET-ID>*_plan.md` and `products/<product>/docs/implementation/<TICKET-ID>*_implementation.md` to recover the canonical slug (the segment between `<TICKET-ID>-` and the `_plan.md` / `_implementation.md` suffix).

Reference docs (read these first, in full, in this order):

- @PHILOSOPHY.md — the architecture/decision GOSPEL: locked decisions, conventions, invariants, the layered-API contract, the design-system token contract, the build-then-test workflow, Definition-of-Done.
- @CLAUDE.md (repo root) — monorepo map + conventions.
- @products/<product>/CLAUDE.md — the product's structure, ports, infra names.
- the nested **API** `CLAUDE.md` under `products/<product>/api/` — the add-an-endpoint recipe.
- @packages/ui/CLAUDE.md + @packages/ui/FIGMA.md — design-system runbook + token contract.

(These CLAUDE.md/FIGMA.md files are produced when the monorepo is built; if one is absent, fall back to `PHILOSOPHY.md`.)

---

## Step 1 — Fetch the ticket and the plan

1. Use the Linear MCP (`mcp__Linear__*`, e.g. `get_issue`) to fetch the ticket: title, full description, comments, blockers, linked docs. Capture context.
2. Find the plan doc: `Glob products/<product>/docs/plans/<TICKET-ID>*_plan.md`. Read it in full — every section. The plan is the source of truth for what to build.
3. If no plan exists at that path, STOP and surface to the user — direct them to run `/ptfm-plan <product> <TICKET-ID>` first. Do NOT improvise an implementation without a plan.
4. If multiple plan candidates match, ask the user which one to follow.
5. Note the implementation log path: `products/<product>/docs/implementation/<TICKET-ID>-<slug>_implementation.md`. Use the same `<slug>` the plan file uses. If a log already exists from a prior session, READ it and continue from where it left off; do not overwrite.

## Step 2 — Build complete depth-of-understanding

Before writing any code, internalise both the plan AND the codebase:

1. Re-read `PHILOSOPHY.md` core principles in full, especially: the build-then-test workflow, Definition-of-Done, the design-system token contract, the layered-API contract (schemas → routers → services → models), the contracts/typegen pipeline, errors (RFC 9457 problem+json), realtime (broadcast-only), and rate limiting.
2. For every file the plan touches (`## File-by-file changes` section): READ it before changing it. Architecture decisions made without reading current code usually go wrong.
3. Walk every dependency the change pulls in, scoped to `products/<product>/`:
   - **Frontend** — primitives composed from **`@platform/ui`** (`packages/ui/src/components/ui/*`), shared plumbing from **`packages/core`** (the subscribe-and-invalidate helper, shared hooks/clients), the **generated typed client** at `products/<product>/api-client/` (+ its TanStack Query hooks), screens/features under `products/<product>/app/features/<feature>/`.
   - **Backend** — the FastAPI layered stack under `products/<product>/api/`: `schemas/` (Pydantic v2 DTOs) → `routers/` → `services/` (one class per aggregate) → `models/` (SQLModel tables), plus Alembic versions under the API's `alembic/versions/`.
4. For backend changes, inspect the relevant Supabase schema with the Supabase MCP (`mcp__Supabase__list_tables`, `mcp__Supabase__list_migrations`, `mcp__Supabase__execute_sql` for read-only schema queries) so Alembic migrations target the actual current state, not the plan's assumed state. **Schema changes go via Alembic, never raw `apply_migration`.**
5. If the plan calls for any external integration (Notion, Figma, etc.), fetch the source-of-truth content via the relevant MCP. For any UI surface, pull the design + tokens from Figma (`mcp__Figma__*` — Code Connect + variable defs) so the build matches the design contract.

If the plan and the current codebase disagree on anything load-bearing (schema drift, a renamed primitive, a changed contract), STOP, surface the disagreement to the user, and wait for direction. The plan may need an amendment before proceeding.

## Step 3 — Walk the plan's Implementation sequence with TDD per step

The plan's `## Implementation sequence` section is dependency-ordered — follow it strictly, top to bottom, never skipping ahead. For EACH numbered step in that sequence, run a full TDD red → green cycle scoped to just that step's surfaces:

1. **Mark the TodoWrite todo for this sequence step `in_progress`.**
2. **Write the failing tests for THIS step FIRST** — per the plan's `## Test plan` section, scoped to the surfaces this step touches. Include every applicable edge case from the plan's edge-case enumeration (boundary inputs, character-set inputs, concurrency races, auth / ownership boundaries, rate-limit hits, network failures, external-service failures, state persistence, cross-target rendering). Cover the layers as relevant:
   - **API unit / service** (`pytest`) — service methods, Pydantic schema validation, cursor-pagination helpers, problem+json mapping. Run against a **real Postgres** with per-test isolation (SQLAlchemy `join_transaction_mode="create_savepoint"`); httpx `ASGITransport(app=app)`; polyfactory factories. Assert on the actual side effect (DB row content, the problem+json `type`/error code raised), not just call counts.
   - **API integration** (`pytest`) — cross-layer seams: router → service → DB round-trips, the **broadcast-and-invalidate** seam (mutation fires the per-product channel event), cursor-pagination round-trips.
   - **UI** (RNTL, `*.test.tsx`) — every form (validation + happy submit), every error display (the problem+json **translated message** renders via the typed client, not a raw error string), every non-trivial component interaction. RNTL v14: `render` / `fireEvent` / `renderHook` are **async** — await them. Mock at module boundaries with **`jest.mock(...)`**. Do NOT use `@testing-library/jest-native` (deprecated; matchers are built into RNTL ≥ 12.4).

   **Every test you write must be meaningful** (per `PHILOSOPHY.md` § testing discipline). NEVER write `expect(screen.getByText("X")).toBeTruthy()` as the only assertion. NEVER write "renders without crashing". NEVER write snapshot-only tests. NEVER assert on class names, inline styles, or internal component state. Each test MUST verify functionality, business logic, or a contract: which **service method** is called with what payload; which **problem+json `type` / error code** surfaces; which **TanStack Query** state transition fires (idle → loading → success / error / retry); which side effect happens (DB row content, **broadcast fired**, navigation, toast, autosave); the data shape after a Pydantic round-trip or a generated-client call. Before writing a test, ask "what real bug would this test catch?" — if the answer is "nothing", do not write it.
3. **Run the new tests and confirm the baseline:**
   - **New-feature tests** should go RED — proving the feature isn't there yet and giving the implementation a precise target.
   - **Bug-fix regression tests** should first run GREEN against today's broken code (proving the test captures current reality), then have their assertions edited to describe the corrected behaviour — they then go RED until the fix lands.
4. **Implement the changes per the plan** to turn the new tests RED → GREEN. For an endpoint, follow the canonical add-an-endpoint recipe in order: **model → service → schema → router → openapi → typegen → hook → screen**. Watch each test transition; if a test refuses to go green, the implementation is wrong — fix it before moving on.
5. **Add edge-case tests as the implementation surfaces them.** Building often reveals cases the plan didn't anticipate — write the new test in this step (not later), watch it fail, then make it pass.
6. **Honour every approval gate** the plan calls out — **Alembic migrations**, env-var additions, anything explicitly flagged. If the plan says "show migration to user before applying", you SHOW the generated Alembic migration and WAIT for explicit approval before running it; you do not auto-apply. (Alembic runs over the direct 5432 connection via `DATABASE_MIGRATION_URL`.)
7. **Regenerate the typed client and run a quick sanity check** before closing out the step — if the step changed the API surface, run typegen (`@hey-api/openapi-ts`) to regenerate `products/<product>/api-client/`; **NEVER hand-edit the generated client.** Then run `turbo run typecheck --filter=...<product>...` (and `pyright` for API changes).
8. **Mark the todo `completed`** only once every test for this sequence step is green.
9. **Move to the next sequence step.** Do not jump ahead, do not batch multiple sequence steps' tests up front — each step gets its own red → green cycle, in order.

Adherence rules (non-negotiable, per `PHILOSOPHY.md`):

- **Frontend STRICTLY conforms to the design system.** Every UI primitive comes from **`@platform/ui`** (compose them). Every colour, spacing, radius comes from **NativeWind semantic tokens** (`bg-background`, `bg-primary`, `text-foreground`, `border-border`, …) — **NEVER raw hex**; brand is a token **mode**, and token values come from the Figma pipeline (`theme.ts` / `global.css`), never hand-named. **NEVER modify a shared `@platform/ui` primitive to suit one feature** — add a cva variant, add an opt-in prop, or compose on top.
- **Backend STRICTLY conforms to existing patterns.** FastAPI layered services: thin routers `Depends` a service; the service owns business logic AND data access (no repository layer); models are persistence-only. **DTOs are ALWAYS separate from ORM models** — never serialize a SQLModel row to the client. User-facing errors cross the boundary as **RFC 9457 problem+json** (services raise typed errors mapped to problem+json) — **never raise a raw error string** across the boundary. **One Alembic migration per schema change** (show-before-apply gate). **slowapi** rate limits on every paid / public endpoint (key per verified JWT `sub`, fall back to IP). Validate every input with **Pydantic v2 strict mode**. DELETE/UPDATE via `session.execute(delete(...))`, never `session.exec(...)`. The **generated typed client is never hand-edited** — change the endpoint, run typegen, regenerate.
- **Cross-target + theme coverage.** For every UI surface you touch, make explicit decisions for **iOS, Android, web (react-native-web), and desktop (Electron)**, plus **light / dark**, plus **brand modes**, plus responsive on web / tablet — consistent with how similar surfaces handle it elsewhere. A change that "works on web only" or "light mode only" is INCOMPLETE.
- **Run tests frequently.** `turbo run test --filter=...<product>...` (and the targeted `pytest`) after every meaningful batch. Going from green to green is much cheaper to debug than going from red to red after 30 changes.

"I'll add the tests in a follow-up" is a rule violation. Tests come BEFORE code at every sequence step. **Edge cases are as important as test cases.**

## Step 4 — Keep the implementation log up to date AS YOU GO

Maintain `products/<product>/docs/implementation/<TICKET-ID>-<slug>_implementation.md` continuously throughout the run, not just at the end. Required structure:

### `# <TICKET-ID> Implementation Log`

### `## Final status`

Updated at the end: lint / typecheck / tests, Alembic migrations applied, typegen regenerated (no drift), env vars added.

### `## What got built`

- Tables / sub-tables of new files grouped by role (screens / routes, features, `@platform/ui` compositions, `packages/core` plumbing, schemas, routers, services, models, Alembic migrations, generated-client hooks, stores, tests). Match the plan's structure where helpful.
- One sentence per file describing what it does.

### `## Deviations from the plan`

Anywhere the implementation chose a different path than the plan called for, log it here with: what the plan said, what shipped, why the deviation was necessary. Update the plan's `## Post-ship deltas` section in the SAME pass so plan and reality stay in sync.

### `## Findings`

Anything you learned mid-implementation worth surfacing — hidden invariants, schema quirks, integration quirks, perf surprises, cross-target rendering observations.

### `## Verification`

- Manual run-through (golden path)
- `turbo run lint typecheck test build --filter=...<product>...` output (+ `ruff check && pyright && pytest` for API changes) — all gates green
- Typegen drift check (`git diff --exit-code` on the regenerated client) clean
- Any open caveats

Update the log incrementally — every batch of changes, write what you just did. Don't leave it for the end.

## Step 5 — Final gate

Before reporting done, emit the Definition-of-Done checklist from `PHILOSOPHY.md` with each line ticked or explicitly marked `N/A — <reason>`:

- [ ] Plan doc updated (`## Post-ship deltas` for any deviations)
- [ ] Implementation log updated (`products/<product>/docs/implementation/<TICKET-ID>-<slug>_implementation.md`)
- [ ] API unit + service tests added/updated (`pytest`, real Postgres, savepoint isolation)
- [ ] API integration tests added/updated (router → service → DB, broadcast-and-invalidate, cursor pagination)
- [ ] Frontend RNTL unit + component tests added/updated
- [ ] Typegen regenerated — no drift (`git diff --exit-code` on `products/<product>/api-client/`)
- [ ] `turbo run lint typecheck test build --filter=...<product>...` (JS) AND — for API changes — `ruff check && pyright && pytest` — all green (lint + typecheck + tests + the Expo web export / app build are all first-class gates; a green test suite with a red build is not done)

Run the final gate one last time and paste the output. Silent skips are rule violations. If you cannot satisfy a line, say so explicitly with a one-line justification — do not just omit. Zero `.only`, zero `.skip`, zero new ignores.

---

## ABSOLUTE, NON-NEGOTIABLE RULES

- **Follow the plan; flag deviations.** The plan is the source of truth. If you discover the plan is wrong (missed a file, wrong assumption about schema, etc.), STOP, surface the issue, propose the amendment, wait for direction. Do NOT silently improvise.
- **Frontend STRICTLY conforms to the design system.** `@platform/ui` primitives only. NativeWind semantic tokens only (never hex). Never reskin a shared primitive for one feature — cva variant / opt-in prop / compose.
- **Backend STRICTLY conforms to existing patterns.** Layered services (schemas → routers → services → models, no repository layer). DTO ≠ ORM. problem+json boundary (never a raw error). One Alembic migration per schema change. slowapi on paid / public endpoints. Pydantic-strict-validate everything. The generated client is regenerated, never hand-edited.
- **Cross-target + theme coverage.** iOS, Android, web, desktop — plus light / dark — plus brand modes — plus responsive on web / tablet. Every visual surface has explicit decisions for each.
- **Tests are MANDATORY in the same pass.** Build first, then test — but ship them together. "I'll add the tests in a follow-up" is forbidden.
- **Honour approval gates.** Alembic migrations, env-var additions, anything the plan flagged for review — show, wait, then proceed. NEVER auto-apply destructive or production-affecting changes.
- **Implementation log updated AS YOU GO.** Not at the end. Every meaningful batch records what changed.
- **Final gate is non-skippable.** `turbo run lint typecheck test build --filter=...<product>...` (+ `ruff check && pyright && pytest` for API) — all green, plus a clean typegen-drift check. Lint, typecheck, tests, and the Expo web export / app build are first-class gates; a green test suite with a red build is not done. The Definition-of-Done checklist gets emitted with every line ticked or explicitly justified.

What `/ptfm-implement` does NOT mean:

- Not a planning pass — the plan must already exist (`/ptfm-plan <product> <TICKET-ID>` first if it doesn't).
- Not an audit — that's `/ptfm-audit <product> <TICKET-ID>` after the build is in place.
- Not a UI test pass — that's `/ptfm-test-ui` after the build is in place.
- Not a refactor — simplification / commonification are separate passes (`/ptfm-simplify`, `/ptfm-commonify`) after the feature ships.

## Available MCPs (use as needed)

- **Linear** (`mcp__Linear__*`) — re-read the ticket, post a comment when the implementation is done if helpful.
- **Supabase** (`mcp__Supabase__*`) — read-only schema introspection: `list_tables`, `list_migrations`, `execute_sql`. Schema changes go via **Alembic**, not raw `apply_migration`; the MCP is for introspecting the live schema so migrations target the actual current state.
- **Figma** (`mcp__Figma__*`) — pull the design + design tokens (Code Connect + variable defs) for any UI surface so the build matches the token contract; never hand-name a colour.
- **Notion** (`mcp__Notion__*`) — fetch any Notion docs the plan or ticket references.
- **Playwright** (`mcp__playwright__*`) — only if you need to verify a web UI flow live during implementation (rare; full UI testing is `/ptfm-test-ui`'s job).

Deployment context spans the template's four surfaces — **Fly (api), EAS (mobile), Vercel (web), Electron (desktop)** — reach for the relevant one only when a step needs deploy/env context; it is not a workflow pillar here.

---

Start now. Resolve the product. Fetch the ticket. Load the plan. Walk the codebase. Build per the plan's sequence (model → service → schema → router → openapi → typegen → hook → screen). Add tests in the same pass. Keep the implementation log up to date as you go. Regenerate the typed client (no drift). Final gate green. Definition-of-Done emitted.
