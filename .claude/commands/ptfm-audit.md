---
description: Audit a feature in a product — close documentation gaps, ensure comprehensive RNTL + pytest coverage, and make every quality gate (turbo + Ruff/pyright/pytest + typegen) pass cleanly
argument-hint: "<product> <ticket-id> [slug] [user-instruction]"
---

Args: $ARGUMENTS

Expected shape: `<product> <TICKET-ID> [slug-or-title] [primary user instruction]`

- **`<product>`** — first token: the product directory under `products/` (e.g. `blog`). **Required.** If absent, infer it from the cwd when the session is inside `products/<name>/...`; otherwise STOP and ASK. Validate that `products/<product>/` exists; if it doesn't, STOP and ASK — do NOT guess. EVERYTHING this command does — the codebase walk, every glob, every save path — is scoped to `products/<product>/`.
- **`<TICKET-ID>`** — second token (e.g. `CRO-412`). **Required.** If not passed, the resolve block below auto-infers from the current branch; if it can't, STOP and ask.
- **`[slug-or-title]`** — optional next token (kebab-case slug or quoted title). Overrides the auto-inferred slug. If absent, the resolve block below recovers it — an existing doc for this ticket is the authority; the branch is only a seed, used when no doc exists yet.
- **`[primary user instruction]`** — anything after the slug (or after the ticket ID if no slug-shaped token follows). Freeform guidance for THIS specific invocation — adjust scope, focus, or emphasis as instructed. **It does NOT override the absolute rules below** — if it conflicts with a rule, prefer the rule and surface the conflict to the user.

---

We need to audit the entire `<FEATURE>` feature in `products/<product>`. And I mean the full feature — discover every file in the surface, read each one, go step by step, think hard, create as many to-dos as required. Three first-class deliverables:

1. **Documentation gap-fill** — the plan and implementation docs reflect WHAT ACTUALLY SHIPPED. Iterations since they were last touched, reversed decisions, new files, deleted files, behaviour shifts, schema relaxations, Pydantic strictness changes, rate-limit tuning, broadcast/realtime changes — all logged and reconciled. No drift between "the plan" and "the code".
2. **Comprehensive test coverage** — every meaningful function, surface, user flow, and error path is tested at the appropriate layer (RNTL unit/component for the app; pytest unit/integration for the API). Coverage is meaningful (assertions verify actual behaviour, not just that something was called) and complete (no important branch left untested).
3. **Quality gates pass cleanly** — for JS: `turbo run lint`, `turbo run typecheck`, `turbo run test`, `turbo run build` (+ `export:web` where the change touches web) all green; for the API: `ruff check`, `pyright`, `pytest` all green; plus the **typegen drift check**. These are not side checks; they're first-class deliverables alongside docs and tests. A feature that tests green but builds red (the turbo build / web export) is NOT audited.

**Resolve `<product>`, `<TICKET-ID>`, `<slug>`, and `<FEATURE>` BEFORE doing anything else.**

1. **`<product>`** — first token if provided; else infer from cwd (`products/<name>/...`); else STOP and ASK. Confirm `products/<product>/` exists.
2. **`<TICKET-ID>`** — if a ticket-shaped token was provided in `$ARGUMENTS` (after `<product>`), use it. Otherwise run `git branch --show-current` and match `[A-Za-z][A-Za-z0-9]{1,9}-[0-9]+` anywhere in it, CASE-INSENSITIVELY — Linear's branch format is a workspace setting, so it may emit `CRO-412`, `cro-412` or `Cro-412`. **Normalise to UPPERCASE** (`cro-412` → `CRO-412`) and use that form in every path and every filename from here on; glob case-insensitively when reading, so a doc already written in another case still resolves. If neither yields a ticket, STOP and ASK — do NOT guess.
3. **`<slug>`** — resolve in this order and STOP at the first hit:

   1. A slug-shaped token in `$ARGUMENTS`.
   2. **An existing artifact for this ticket** — `Glob products/<product>/docs/*/<TICKET-ID>*.md` (match the ticket id case-insensitively) and recover the slug from the filename: the segment between `<TICKET-ID>-` and the `_product.md` / `_architecture.md` / `_plan.md` / `_implementation.md` / `_review.md` suffix. **This is the authority.** Once ANY stage has written a doc for this ticket, that filename fixes the slug for every stage after it.
   3. The **branch** — the segment after the ticket id: `cro-412-bulk-edit-tags` → `bulk-edit-tags`; `hritt/cro-412-bulk-edit-tags` → `bulk-edit-tags`; `shop/cro-412-bulk-edit-tags` → `bulk-edit-tags`.
   4. The Linear ticket title, kebab-cased (~5–8 words, drop filler words).

   Steps 3 and 4 are SEEDS — used once, by whichever stage runs first for this ticket — and they are last on purpose, because neither is stable. Linear's branch format is a workspace setting that can be changed at any time, and it truncates long titles, so the same ticket can yield a different string tomorrow than it does today. The filename written by the first stage is what every later stage reads. NEVER re-derive a slug that step 2 already answered, and NEVER rename an existing artifact to match a freshly derived one.

4. **`<FEATURE>`** — derive from the plan / implementation docs (they reference `products/<product>/app/features/<feature>/...` extensively), or by mapping the slug to a folder under `products/<product>/app/features/`. If no clear match, ASK.

Reference docs (read these first, in full):

- @PHILOSOPHY.md — the architecture/decision GOSPEL (locked decisions, conventions, invariants). When anything conflicts with it, it wins.
- @CLAUDE.md (repo root) — monorepo map + conventions (semantic-tokens-only, broadcast-only realtime, problem+json, never-edit-generated-client, promote-on-2nd-use).
- @products/<product>/CLAUDE.md — the product's structure, ports, infra names.
- the nested **API** `CLAUDE.md` under `products/<product>/api/` — the add-an-endpoint recipe (model→service→schema→router→openapi→typegen→hook→screen).
- @packages/ui/CLAUDE.md + @packages/ui/FIGMA.md — design-system runbook + token contract.
- `Glob products/<product>/docs/plans/<TICKET-ID>*_plan.md` — read the match in full. **If it returns nothing, STOP and ASK.**
- `Glob products/<product>/docs/implementation/<TICKET-ID>*_implementation.md` — read the match in full. **If it returns nothing, STOP and ASK.**

(A constructed exact path is deliberately NOT used for these two: reading a path that does not exist fails SILENTLY, and the stage then runs with no plan in context and still reports success. The glob is the same lookup that resolved `<slug>`, so it hits whenever a doc exists at all; the STOP is what makes a genuinely missing doc loud instead of invisible.)

(If a `CLAUDE.md` is absent, fall back to `PHILOSOPHY.md` — product-level ones are stamped from `products/_template`.)

Discover the file surface yourself — do not ask the user to paste files:

1. Run `git status` to see currently staged + unstaged changes.
2. Run `git diff main...HEAD --name-only` (or whatever the base branch is) to enumerate every file that's changed since the branch diverged.
3. Glob `products/<product>/app/features/<FEATURE>/**` for the feature module itself.
4. Walk imports outward — every Expo Router route/screen, component, hook, store, and generated-client hook the feature touches; every `@platform/ui` primitive and `packages/core` helper it depends on; and across the API: every `schemas/`, `routers/`, `services/`, `models/` file the endpoint chain touches.
5. Also include any migrations under `products/<product>/api/.../alembic/versions/*` whose revisions reference the feature, and any regeneration of `products/<product>/api-client/`.

---

## Deliverable 1 — Documentation gap-fill

For both `products/<product>/docs/plans/<TICKET-ID>-<slug>_plan.md` and `products/<product>/docs/implementation/<TICKET-ID>-<slug>_implementation.md`, audit and fix:

- **File inventory drift** — files added since the docs were last updated that aren't listed; files deleted but still referenced; files renamed/moved without a log entry.
- **Behaviour shifts** — rate-limit (slowapi) values changed, schema caps relaxed/tightened, Pydantic strictness toggled, cursor-pagination page sizes tuned, new broadcast channels / invalidation events, new self-heal/retry loops, timeout changes — anything observable that's different from what the plan/log says.
- **Reversed or superseded decisions** — anywhere the implementation chose a different path than the plan called for. Mark the original plan section as superseded and add a `## Post-ship deltas` entry (create the section if missing) with: what the plan said, what shipped, why.
- **New external surfaces** — new problem+json error `type`s, new env vars (API `pydantic-settings`, or committed `EXPO_PUBLIC_*` per-env), new SDK integrations, new Alembic migrations, new public exports from the feature's `index.ts`, new generated-client endpoints in `api-client/`.
- **Removed / abandoned paths** — features the plan called for that didn't ship in v1, or experiments that were deleted. Log them in the "files planned but not shipped" / "deviations" section.
- **API contract changes** — schema (Pydantic DTO) field renames or removals, router signature / return-shape changes, error semantics, cursor-pagination shape changes. Remember: DTOs are ALWAYS separate from ORM models — flag any leakage.
- **Verification block** — confirm the "how to run", env-var requirements, and golden-path walkthrough still describe reality.

### Required: full feature file inventory at the end of the implementation doc

A core output of the audit is a **complete, exhaustive, definitive index of every file that belongs to or is relevant to this feature**, appended (or updated) as the FINAL section of `products/<product>/docs/implementation/<TICKET-ID>-<slug>_implementation.md` under the heading `## Feature file inventory`. Future contributors and future audit runs use this as the source of truth for the feature's file surface — it must be comprehensive.

Rules for the inventory:

- **Every file** discovered in the surface walk goes in. No "I'll skip this small one." If it's part of the feature, it's listed.
- **Group by role**, in roughly this order (skip groups that don't apply):
  - Routes & screens (Expo Router file-based routes under `products/<product>/app/...`; route files are thin one-liners pointing into the feature)
  - Public surface (`products/<product>/app/features/<FEATURE>/index.ts`)
  - Feature components (`products/<product>/app/features/<FEATURE>/components/*`)
  - Feature hooks / stores / lib / types (`.../hooks/*`, `.../stores/*` Zustand, `.../lib/*`, `.../types.ts`)
  - **API layers** for the endpoints this feature consumes (under `products/<product>/api/...`):
    - Schemas (Pydantic v2 DTOs = the contract): `schemas/*`
    - Routers (thin, `Depends` on a service): `routers/*`
    - Services (one class per aggregate; business logic + data access): `services/*`
    - Models (SQLModel tables, persistence only): `models/*`
  - Alembic migrations (`products/<product>/api/.../alembic/versions/*`)
  - Generated client (`products/<product>/api-client/...` — list the endpoints/hooks this feature consumes; NEVER hand-edited)
  - Shared primitives the feature DEPENDS ON (only those touched/added for this feature: `@platform/ui` components under `packages/ui/src/components/ui/*`; `packages/core` helpers — query client / persistence / auth guards / the subscribe-and-invalidate broadcast helper / env)
  - Tests, grouped by layer:
    - RNTL unit/component (`*.test.tsx` / `*.test.ts`, colocated `__tests__/` beside source)
    - pytest API unit (`tests/test_*.py` — service classes, schema round-trips)
    - pytest API integration (`tests/test_*.py` — routers over HTTP, problem+json shapes, DTO/ORM separation, broadcast seam)
- **Format as Markdown tables** (`| File | Purpose |`) per group — match the style already used in the doc's "Platform primitives" / "What got built" tables. One sentence per row describing the file's role in this feature.
- **Mark explicitly** anything that is feature-shared-with-other-code (e.g. a `packages/core` helper or `@platform/ui` primitive originally built for this feature but now reused) so the next commonification pass has a head start.
- **Exclude**: anything explicitly marked legacy (e.g. a `legacy-` filename prefix); anything that's plainly project-wide infrastructure (the root layout, `request_id` middleware, the global error boundary — unless this feature actually changed it). NEVER list anything inside `api-client/` as hand-editable.
- **Keep it current**: if the inventory section already exists from a prior audit, UPDATE it in place rather than appending a duplicate. Removed files come out, renamed files get their new path, new files go in.

The inventory section is the artifact future devs (and future Claude sessions) will read first to understand "what is this feature actually made of". Treat it as load-bearing documentation.

Output: every doc section that was edited gets called out in your final report, with a one-line summary per change. The final report explicitly confirms the `## Feature file inventory` section was written/updated and states the total file count.

---

## Deliverable 2 — Comprehensive test coverage

For every file in the discovered surface, ensure tests exist at the correct layer with meaningful assertions. Use the project's test conventions (PHILOSOPHY.md's testing strategy) — single Jest runner (jest-expo preset) + RNTL for ALL JS tests (colocated in `__tests__/` beside source; `render`/`fireEvent`/`renderHook` are **async**, await them; `jest.mock()` at the module boundary; NEVER vitest, NEVER `vi.mock`); pytest for the API (against a real Postgres, polyfactory factories, httpx `ASGITransport`).

**a) API unit tests** (pytest, `tests/test_*.py`) — required for:

- Every pure function / helper / transform / derivation.
- Every Pydantic v2 schema/DTO (round-trip golden fixtures, length caps, rejection of missing/invalid fields, strict-mode coercion edges).
- Every service method (ownership scoping, RLS round-trip over the test DB, cursor-pagination edges, atomic transitions, bulk behaviour; `DELETE`/`UPDATE` via `session.execute(delete(...))`).
- Every error path (the typed error a service raises and its mapping to a problem+json `type` / status).
- The rate-limit short-circuit (slowapi keyed on the JWT `sub`, IP fallback).

**b) API integration tests** (pytest + httpx against real Postgres, `tests/test_*.py`) — required for every cross-layer seam:

- Router → service → DB round-trip (CRUD, assert the DTO shape returned — never an ORM row).
- problem+json error responses (assert the `type`, status, and that no raw stack/string leaks).
- Auth paths (401 on missing/invalid JWT; ownership 403).
- Cursor-pagination round-trips (assert `{ items, next_cursor }`, opaque cursor stability).
- The **broadcast-and-invalidate** seam: after a mutation, assert the service-role broadcast fired on the per-product channel (mock the outbound httpx call; assert URL + payload shape).
- Rate-limit flow at the route boundary (429 with the expected problem+json).

**c) Frontend UI tests** (RNTL, `*.test.tsx`) — required for:

- Every form: validation-error path + happy-path submit (await async render/fireEvent).
- Every error display: the translated user message from the API's problem+json renders (not a raw `error.message` / raw string).
- Every non-trivial component: at least one test exercising its primary user interaction.

**Coverage standards (no exceptions) — tests must be meaningful** (the pipeline's meaningful-test rules):

- **Tests verify functionality, business logic, and contracts — NEVER trivia.** A test that doesn't fail when the implementation is wrong is noise, not coverage. Optimise for tests that catch real regressions, not coverage-percentage padding.
- **Banned patterns to FLAG and DELETE during the audit**: `expect(screen.getByText("X"))` as the only assertion, "renders without crashing", snapshot tests, asserting on constant / default / hardcoded values, wrapper-prop pass-through, "button is visible" without testing what happens on press, asserting on className / NativeWind utility strings / inline styles, asserting on internal component state. If you find these in the existing suite, surface them in the report as "low-value tests that should be replaced" and replace them with meaningful assertions.
- **Required assertions every meaningful test does several of**: service-method call shape (method, payload, return DTO) or generated-client call shape; which problem+json `type` / error code surfaces in error paths; the translated user message renders (not a raw `error.message`); TanStack Query state transitions (idle → loading → success / error / retry); side effects (mock call arguments, DB row content, the **broadcast fired** + its channel/payload, navigation, toast, autosave debounced); data shape after a Pydantic / Zod round-trip or a generated-client call.
- A mocked test that does not assert on mock call shape (URL, schema, headers, args) is testing nothing — fix it.
- A test that only asserts "it renders" without checking content/state is not enough — add behavioural assertions or delete the test.
- No real external providers, no real Supabase, no real broadcast HTTP. Mock at the module boundary (`jest.mock(...)` for JS; httpx mock / fixture for pytest); API env via pydantic-settings test overrides, frontend env via the committed `EXPO_PUBLIC_*` test values.
- Every new problem+json error path must have at least one test that exercises it and asserts the correct `type` / status (API) and the correct translated message (UI).
- Every public-surface export from `products/<product>/app/features/<FEATURE>/index.ts` must have at least one test exercising it — and that test must verify behaviour, not just import-resolution.

---

## Deliverable 3 — Quality gates (lint + typecheck + test + build, JS and API) pass cleanly

A feature isn't audit-clean unless it lints, typechecks, tests, and builds on BOTH sides. These are first-class deliverables on equal footing with docs and tests:

- **`turbo run lint`** — ESLint flat config + Prettier; zero errors. Warnings should be minimized; any new warnings get fixed or explicitly justified — and hand-check the conventions the linter does NOT enforce (raw RN primitives instead of `@platform/ui`, raw hex instead of semantic tokens).
- **`turbo run typecheck`** — `tsc` strict; zero TypeScript errors. No new `any`, no new `!` non-null-assertions, no new `// @ts-expect-error` without a one-line rationale.
- **`turbo run test`** — the RNTL suite green (jest-expo). Zero `.only`, zero `.skip`.
- **`turbo run build`** (+ `export:web` where the change touches web) — the Expo **web export / app build** must succeed. This is the "production build" gate — it catches RN-web resolution failures, New-Arch / Hermes issues, dynamic-import failures, and other production-only errors lint and tests miss. Slow but load-bearing.
- **API gates** — `ruff check` (+ `ruff format --check`) clean, **`pyright`** strict clean (no untyped defs, no implicit `Any`), Pydantic strict mode satisfied, **`pytest`** green against real Postgres.
- **Typegen drift check** — regenerate the client and run `node scripts/check-typegen-drift.mjs`. Drift = red gate. NEVER hand-edit the generated client — change the endpoint, run typegen, regenerate.

For each issue found:

1. **Classify** — pre-existing (was already broken before this audit pass) or introduced (a recent change broke it).
2. **Pre-existing** issues get logged to the implementation doc under a `## Quality-gate findings` section with: command, error message, file:line, severity, one-line proposed fix. Surface to the user for prioritization. Do NOT silently ignore.
3. **Introduced** issues get fixed as part of the audit — that's closing the loop on what shipped, not new feature work.

The audit's final report MUST include the exit status of all gates (turbo lint/typecheck/test/build, Ruff, pyright, pytest, typegen drift). A red gate = audit incomplete, not "audit done with caveats". A red build (turbo build / web export) is an incomplete audit, even if tests are green.

---

ABSOLUTE, NON-NEGOTIABLE RULES:

- **No new feature work.** This is an audit, not a development pass. If you find a bug while auditing, surface it to the user and write a regression test that reproduces it — do not silently fix the bug.
- **No simplification or commonification.** Those are separate passes (`/ptfm-simplify`, `/ptfm-commonify`). Do not consolidate, dedupe, or relocate logic during the audit. If you spot opportunities, list them in your report for the next pass.
- **No skipping for "the test would be hard".** Tests with mocks at the module boundary (`jest.mock` for JS, httpx mocks / DB fixtures for pytest) are achievable for every layer in this codebase. If you genuinely cannot write a test, surface it to the user with file + reasoning and wait — do not silently skip.
- **No silent doc skips.** If a file changed and the docs don't reflect it, the docs get updated. Period.
- **Never modify a test to pass — only to add coverage.** If you discover an existing test that's wrong (asserts against bugged behaviour), surface it and stop. Do not silently "fix" it.
- **Never hand-edit the generated `api-client/`.** Drift is fixed by regenerating from the API, never by editing the client.
- **Final gate**: for JS — `turbo run lint typecheck test build --filter=...*<product>*...` (+ `export:web` where web changed); for API changes — `ruff check && pyright && pytest`; plus the typegen drift check — all green. Zero `.only`, zero `.skip`, zero new ignores.

Process:

1. Read the plan + implementation docs in full (and the reference docs above).
2. Discover the file surface (git + Glob, as above), scoped to `products/<product>/`. Build a complete inventory.
3. **Baseline the quality gates FIRST** — run `turbo run lint`, `turbo run typecheck`, `turbo run test`, `turbo run build` (JS) and `ruff check`, `pyright`, `pytest` (API), plus the typegen drift check, and capture exit status + error counts. This tells you what's already red before you change anything (so you can distinguish pre-existing from introduced regressions).
4. For each file, classify:
   - Docs status: documented / partially documented / undocumented.
   - Test status per layer: RNTL unit (yes/no/partial), RNTL component (yes/no/N-A), pytest API unit (yes/no/N-A), pytest API integration (yes/no/N-A).
   - Quality-gate touched-by-this-file: any lint warnings, typecheck / pyright errors, ruff findings, or build failures originating here.
5. Build three to-do lists:
   - **Docs gaps**: file path, doc section affected, what's missing, severity (low/med/high).
   - **Test gaps**: target file, layer, gap type (missing test / weak assertions / dead branch), risk (low/med/high).
   - **Quality-gate findings**: command (turbo lint/typecheck/build, ruff, pyright, pytest, typegen), error, file:line, severity, pre-existing vs introduced, proposed fix.
6. Execute fixes smallest-blast-radius first. After each meaningful batch, run the relevant gate (`turbo run test`, `turbo run lint`, `turbo run typecheck`, `turbo run build` / `export:web`, or `pytest` / `ruff check` / `pyright` for API changes) and confirm green.
7. After every fix that adds new tests, updates docs, or addresses a quality-gate finding, you MUST emit the pipeline's Definition-of-Done checklist for that change (plan/impl docs updated; RNTL unit + component tests; pytest API unit + integration tests; typegen regenerated with no drift; the turbo + Ruff/pyright/pytest gates green).
8. Final report: number of doc edits made (per doc section), number of tests added per layer (RNTL unit/component, pytest unit/integration), files now at full coverage, exit status of every gate (turbo lint/typecheck/test/build, ruff, pyright, pytest, typegen drift), any open gaps explicitly justified.

Final gate: for JS — `turbo run lint typecheck test build --filter=...*<product>*...` (+ `export:web` where web changed); for API changes — `ruff check && pyright && pytest`; plus the typegen drift check — all green.

What "audit" does NOT mean:

- No simplification, deduplication, or relocation — see `/ptfm-simplify` and `/ptfm-commonify` for those.
- No new features, new endpoints, new UI affordances.
- No dependency upgrades, no config rewrites, no library substitutions (the locked versions in `PHILOSOPHY.md` stand).
- No "I added a test, the rest can wait" — comprehensive means comprehensive. Open gaps must be flagged in the final report with a one-line reason.
- No "build is red but tests are green so we're good" — every gate is first-class. A red turbo build / web export, or a red Ruff/pyright/pytest, is an incomplete audit.

## Available MCPs / CLIs (use as needed)

- **Linear** (`mcp__Linear__*`) — re-read the ticket, comments, and any linked sub-issues for context the docs should reflect.
- **Supabase** (`mcp__Supabase__*`) — read-only schema introspection: `list_tables`, `list_extensions`, `list_migrations` to verify the docs' schema inventory matches reality; `execute_sql` for read-only schema checks; `get_advisors` / `get_logs` to surface issues the audit should document. **Migrations go via Alembic, NOT `apply_migration`** — use the MCP only to introspect.
- **Figma** (`mcp__Figma__*`) — this project has a deep Figma integration (Code Connect + token modes). Use it to corroborate a doc claim about a design surface, token mode (light/dark × brand), or that a touched `@platform/ui` primitive matches its Figma component. Full UI testing is `/ptfm-test-ui`'s job.
- **Notion** (`mcp__Notion__*`) — fetch related docs the plan / implementation log references.
- **Sentry** (`mcp__sentry__*`) — baseline what is ACTUALLY failing in staging/production for this product before auditing: real errors on the feature's surface are coverage gaps by definition, and each one belongs in the audit's findings with a regression test. The `X-Request-Id` chain ties a client event to its API event and its structlog line.
- **Playwright** (`mcp__playwright__*`) — rare; only when a doc claim about UI behaviour needs a quick live web corroboration. Full UI testing is `/ptfm-test-ui`'s job.
- **Deployment context** (light mention, not a workflow pillar) — the product ships to four surfaces (Fly = api, EAS = mobile, Vercel = web, Electron = desktop). When the audit needs to validate the verification block's env-var/runtime claims, cross-check the relevant surface; don't treat any one as the central pillar.

---

## Surface the blockers BEFORE you start

Read the plan / diff / surface first, then raise every blocker you can already see in ONE message, before doing the work. A blocker found at minute forty that was legible at minute two has cost the user forty minutes AND their attention twice. The per-step "surface it and stop" rules elsewhere in this command are the safety net for what you could not have known; they are not the plan for what you could.

Scan specifically for:

- **Decisions the upstream doc does not make** — behaviour left undefined, an unhappy path with no specified outcome, a permission rule given as an example rather than as a rule.
- **Access you do not have** — a credential, an MCP that is not connected, a Figma / Notion / Slack link you cannot open, a service that is not running.
- **Preconditions that are not met** — local stack down, migrations unapplied, seed data absent, a dependency the doc assumes already exists.
- **What was ALREADY broken before you touched it** — baseline the quality gates and capture the failures that predate this run, so you neither inherit blame for them nor chase them as if you caused them.
- **Conflicts with a locked rule** — anything asked of you that `PHILOSOPHY.md` or the `CLAUDE.md` chain forbids. Say so now, not after building it.

Raise them **together and numbered**, each with what you propose to do about it. Then get on with everything that is NOT blocked — one blocked area is not a reason to down tools on the rest, and a blocker you have surfaced is the user's to answer while you keep working.

---

## Keep the docs true — and know which ones you may touch

The pipeline's artifacts sit in two tiers. Confusing them is how a decision gets quietly rewritten to match whatever happened to ship.

**WRITE — these must reflect reality by the time this command ends:**

- `products/<product>/docs/implementation/<TICKET-ID>-<slug>_implementation.md` — the running log. Record what this command ships AS it happens, not in a batch at the end. It also carries the definitive index of every file belonging to the feature, so any file you add, delete, rename or **relocate** updates that index in the same pass.
- `products/<product>/docs/plans/<TICKET-ID>-<slug>_plan.md` — update `## Post-ship deltas` whenever what shipped differs from what the plan called for: what the plan said, what shipped, why. A relocation out of the feature also invalidates the plan's `## File-by-file changes` — fix that in the same pass.

**READ-ONLY — not edited by this command, for any reason:**

- `products/<product>/docs/product/<TICKET-ID>-*_product.md` — the product brief.
- `products/<product>/docs/architecture/<TICKET-ID>-*_architecture.md` — the architecture.

Those record decisions taken BEFORE the plan existed, by stages that had their own interrogation and their own sign-off. They are the yardstick this work is measured against, and a yardstick you are allowed to bend measures nothing. **If what shipped contradicts them, that is a FINDING, not a documentation error** — surface it, do not reconcile it. Amendments go through `/ptfm-product` and `/ptfm-architect`, where the debate and the sign-off live.

Wherever this command says "docs updated" or "docs reconciled to reality", it means the plan and the implementation log. It never means the brief or the architecture.

---

## Finish the work

This command's deliverables are not a best-effort target. Run it to completion.

**A blocker is missing INFORMATION. Everything else is WORK.** That distinction is the whole rule:

- **STOP and ASK** when the thing you lack is something only the user can supply — a decision, a requirement, an intent, a credential you cannot obtain, an approval for a destructive or outward-facing action. No amount of effort produces those, and guessing is worse than asking.
- **KEEP GOING** when the thing you lack is effort. A failing test, an error you do not understand yet, a refactor bigger than expected, a flaky local stack, tedious coverage, a fourth attempt at the same fix — that is the job, not an obstacle to it.

The stages before this one have STOP gates on purpose. Do not read those as permission to stop here. They exist because a plan cannot be invented; they say nothing about work that is merely hard.

**Named ways of giving up, all of which are failures of this command:**

- Handing back partial work with "the remaining steps are straightforward" or "the pattern is established" — finish them.
- Stopping at the first failing test instead of finding out why it fails.
- Deleting, skipping or weakening a test so a gate goes green. Fix the cause.
- Labelling something "pre-existing", "unrelated" or "out of scope" to avoid it, when it is in the surface this command owns.
- Quietly shrinking the scope so the deliverables can be declared met.
- Asking the user something the codebase already answers. Read the code first.
- Stopping because the run has been long. Length is not a blocker.

**When genuinely stuck, escalate effort before escalating to the user:** re-read the failing code in full, read the ACTUAL error rather than assuming it, narrow to the smallest reproduction, check how the existing code solves the same problem, try a different approach. Come back to the user only after several real attempts — and when you do, say what you tried and what you observed, not just that it did not work.

**Report honestly.** If something truly cannot be finished, finish EVERYTHING else, then state plainly what is left and why. Never describe partial work as complete, and never let a gate you skipped go unmentioned.

---

Start now. Discover the surface yourself, scoped to `products/<product>`. Go step by step. Do not stop until ALL THREE deliverables are complete: docs reconciled to reality, every meaningful surface tested at the right layer (RNTL + pytest), and all quality gates green — `turbo run lint typecheck test build` (+ `export:web`), `ruff check`, `pyright`, `pytest`, and the typegen drift check.

## Next stage

When this pass is complete, hand off to `/ptfm-simplify` - behaviour-preserving cleanup, now that the surface is fully covered.

The full pipeline is `/ptfm-product` -> `/ptfm-architect` -> `/ptfm-plan` -> `/ptfm-implement` -> `/ptfm-audit` -> `/ptfm-simplify` -> `/ptfm-commonify` -> `/ptfm-review` -> `/ptfm-test-ui`. Stages before `/ptfm-plan` are skipped for smaller work (each says so itself); `/ptfm-review` is NOT skippable; `/ptfm-test-ui` is optional and applies only where the change touches UI.
