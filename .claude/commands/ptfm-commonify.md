---
description: DRY and consolidate feature logic by lifting genuinely generic constructs out of a product-local feature into their shared homes (packages/ui, packages/core, packages/config, or the product API's core/common module) — pure relocation, never behaviour change
argument-hint: "<product> <ticket-id> [slug] [user-instruction]"
---

Args: $ARGUMENTS

Expected shape: `<product> <TICKET-ID> [slug-or-title] [primary user instruction]`

- **`<product>`** — first token: the product directory under `products/` (e.g. `blog`). **Required.** If absent, infer it from the cwd when the session is inside `products/<name>/...`; otherwise STOP and ASK. Validate that `products/<product>/` exists; if it doesn't, STOP and ASK — do NOT guess. EVERYTHING this command does — the codebase walk, every glob, every save path — is scoped to `products/<product>/`.
- **`<TICKET-ID>`** — second token (e.g. `ABC-145`). **Required.** If not passed, the resolve block below auto-infers from the current branch; if it can't, STOP and ask.
- **`[slug-or-title]`** — optional next token (kebab-case slug or quoted title). Overrides the auto-inferred slug. If absent, the resolve block globs `products/<product>/docs/plans/` and `products/<product>/docs/implementation/` to recover it.
- **`[primary user instruction]`** — anything after the slug (or after the ticket ID if no slug-shaped token follows). Freeform guidance for THIS specific invocation — adjust scope, focus, or emphasis as instructed. **It does NOT override the absolute rules below** — if it conflicts with a rule, prefer the rule and surface the conflict to the user.

---

We need to "commonify" the entire `<FEATURE>` feature in `products/<product>`. And I mean the full feature — read each and every file one by one, go step by step, think hard, create as many to-dos as required. Your job is to **DRY and consolidate logic** by lifting constructs that have been built inside `products/<product>/app/features/<FEATURE>/**` (and the API aggregate that backs it) but that genuinely belong in shared homes out of the feature, so future features — in this product AND across the monorepo — can reuse them.

This command is the operational arm of **`PHILOSOPHY.md`'s promote-on-2nd-use rule**: _"features are **product-local** (`app/features/<feature>/`, route files stay thin one-liners); **promote to `packages/*` on 2nd use** (documented convention)."_ Commonify is where that promotion actually happens — a construct that was born inside a feature and is now wanted unchanged by a second surface gets lifted into its shared home. That rule IS this command's mandate; cite it whenever you justify (or decline) a move.

**Resolve `<product>`, `<TICKET-ID>`, `<slug>`, and `<FEATURE>` BEFORE doing anything else.**

1. **`<product>`** — first token if provided; else infer from cwd (`products/<name>/...`); else STOP and ASK. Confirm `products/<product>/` exists.
2. **`<TICKET-ID>`** — if a ticket-shaped token was provided in `$ARGUMENTS` (after `<product>`), use it. Otherwise run `git branch --show-current` and extract the `<TEAM>-<NUMBER>` portion (e.g. `ABC-145` from `feature/ABC-145-d2c-bulk-edit`). If neither yields a ticket, STOP and ASK — do NOT guess.
3. **`<slug>`** — if a slug-shaped token was provided, use it. Otherwise `Glob products/<product>/docs/plans/<TICKET-ID>*_plan.md` and `products/<product>/docs/implementation/<TICKET-ID>*_implementation.md` to recover the canonical slug (the segment between `<TICKET-ID>-` and the `_plan.md` / `_implementation.md` suffix).
4. **`<FEATURE>`** — derive from the plan / implementation docs (they reference `products/<product>/app/features/<feature>/...` extensively), or by mapping the slug to a folder under `products/<product>/app/features/`. If no clear match, ASK.

Reference docs (read these first, in full):

- @PHILOSOPHY.md — the architecture/decision GOSPEL (locked decisions, conventions, invariants). The **promote-on-2nd-use** rule and the `packages/{ui,core,config}` boundaries live here; when anything conflicts with it, it wins.
- @CLAUDE.md (repo root) — monorepo map + conventions (the shared-package boundaries, semantic-tokens-only, broadcast-only realtime, problem+json, never-edit-generated-client, promote-on-2nd-use).
- @products/<product>/CLAUDE.md — the product's structure, ports, infra names.
- the nested **API** `CLAUDE.md` under `products/<product>/api/` — the layered-services recipe and where shared API helpers live (`core/` / `common/`).
- @packages/ui/CLAUDE.md + @packages/ui/FIGMA.md — design-system runbook + token contract (where a promoted primitive lands and how a `cva` variant is added).
- @products/<product>/docs/plans/<TICKET-ID>-<slug>\_plan.md
- @products/<product>/docs/implementation/<TICKET-ID>-<slug>\_implementation.md

(If a `CLAUDE.md` is absent because the monorepo is mid-build, fall back to `PHILOSOPHY.md`.)

What you are looking for — logic currently sitting inside `products/<product>/app/features/<FEATURE>/**` (or duplicated inside the API aggregate) that is NOT genuinely feature-specific and should live in a shared home. Common candidate signals:

1. **Server-action / endpoint plumbing** — the **slowapi** rate-limit adapter, the **JWKS auth dependency** (`PyJWKClient` JWT verification), request-context/`request_id` helpers, the **problem+json** translation/handler, identity resolution, common service-role / Supabase-client patterns. Canonical home: a **shared module within the product's API** — `products/<product>/api/.../core/` or `.../common/`. (See the cross-PRODUCT caveat below.)
2. **Validation primitives** — Pydantic v2 strict field types and shared DTO field shapes (email, url, uuid, slug, pagination/cursor, timing, …) on the API; the occasional Zod helper for a frontend form. Generic Pydantic field types → the product API's `core/`/`common/`; a genuinely generic frontend validation helper → `packages/core`.
3. **UI primitives buried in feature components** — anything in `features/<FEATURE>/components/` that is genuinely a primitive (not feature-specific copy or layout) that other surfaces would want. **Tier-1 owned primitives live in `packages/ui/src/components/ui/`** (`@platform/ui`, shadcn-owned source you OWN). **Tier-2 product compositions** start in `products/<product>/app/features/<x>/components/` and **promote to `packages/ui` on the 2nd use**. Extend the visual contract with a **`cva` variant / opt-in prop** where it varies — NEVER fork or modify a shared primitive for one feature. Promoted UI keeps **semantic tokens only, never hex**, and its cross-target (iOS/Android/web/desktop) + light/dark + brand decisions intact.
4. **Hooks / state primitives** — generic TanStack Query patterns, the **realtime subscribe-and-invalidate** consumer, autosave debouncing, optimistic-update patterns, generated-client wrappers, Zustand store primitives that aren't feature-specific. Canonical home: **`packages/core`** (`@platform/core`).
5. **Constants / labels / configuration shapes** — anything in a feature `constants.ts` / generic enum map that is reusable across features. Generic plumbing constants → `packages/core`; **shared tooling config** (eslint/prettier/tsconfig/tailwind presets) → **`packages/config`**. Anything domain-specific to the feature STAYS in the feature.
6. **Integrations** — third-party SDK wrappers and generic client factories (the Supabase client factory, the generated-client wrapper, Sentry init, env access). Canonical home: **`packages/core`** for app-side plumbing; the product API's `core/`/`common/` for server-side SDK adapters.
7. **Error codes / user-message overrides** — feature-specific copy stays in the feature, but any generic **problem+json `type`** helpers or shared error-translation utilities that would help all features go in the product API's `core/`/`common/` (server) or `packages/core` (client mapping of problem+json → typed errors).

> **Cross-PRODUCT API sharing is NOT a locked pattern.** The shared homes above are: `packages/ui`, `packages/core`, `packages/config` for JS/TS; and a shared module **within one product's API** (`core/`/`common/`) for Python. If a construct would genuinely be reused **across products** in Python, **do NOT invent a cross-product Python package** — flag it, surface it to the user with file + reasoning, and wait for direction.

For every candidate, ask: would a HYPOTHETICAL second feature (a different surface in this product, or another product consuming the shared package) want this exact construct unchanged? If yes → commonify (this is promote-on-2nd-use). If it would want a tweaked version → extend the shared primitive with the variant point (a `cva` variant / opt-in prop for UI; a parameter for plumbing). If it would want a totally different thing → leave it where it is.

ABSOLUTE, NON-NEGOTIABLE RULES — read these twice:

- DO NOT MODIFY ANY TEST LOGIC. The assertions, the `it("...")` / `test("...")` names, the arrange/act/assert bodies, the mocked SDK call shapes, the fixtures, the polyfactory/RNTL test data, the response semantics — all OFF-LIMITS in terms of WHAT they verify. Tests are the SOURCE OF TRUTH. If a test starts failing because behaviour changed, the refactor is wrong — the rule is "moving without changing", and that includes keeping all test expectations exactly as they were.
- TESTS MAY BE RELOCATED. When you move a source file from `products/<product>/app/features/<FEATURE>/lib/foo.ts` to `packages/core/src/foo.ts` (or move an API helper into the product's `core/`/`common/`), its colocated `foo.test.ts` / `test_foo.py` moves with it to the matching new location (per project convention — RNTL `*.test.ts(x)` colocated; pytest under the relocated module's test path). Same for component tests. This is the ONLY edit you may make that touches a test file, and it MUST be limited to:
  (a) Moving the file to the new colocated path.
  (b) Updating import paths inside the test so the new locations resolve (e.g. `@/features/<FEATURE>/lib/foo` → `@platform/core`; or the Python module path for a relocated API helper).
  (c) Updating `jest.mock("…")` paths (JS) or the patched import target (pytest) if the mocked module's import specifier changed because of the move.
  Nothing else. No assertion tweaks. No "while I'm here" cleanups. No collapsing two tests into one. No deleting "obsolete" cases. **Never vitest, never `vi.mock` — this stack is Jest (`jest.mock`) for JS and pytest for the API.**
- The jest-expo config + the project's test setup (the shared `src/test/**`-equivalent setup files, jest config, conftest/factories) — content stays IDENTICAL. (Their file paths may shift only if their consumer's path shifted and the project convention requires it — prefer leaving these in place.)
- If you genuinely believe a test's expectation has to change for a refactor, STOP, surface it to me with file + line + reasoning, and wait. Do not edit it. If the answer is "the refactor would change observable behaviour", the refactor is out of scope — flag it and stop.
- The full test suite MUST pass after every meaningful relocation step, not just at the end — **`turbo run test --filter=...<product>...`** for JS and **`pytest`** for the API. If it goes red, you revert or fix forward (by fixing the production code or import paths, NOT the assertions) before moving on.
- `turbo run lint typecheck test build --filter=...<product>...` (JS) AND — for any API change — `ruff check && pyright && pytest` is the final gate. All green, zero skipped, zero `.only`, zero `.skip`, zero new ignores. Where a move touches web, include `export:web`. Run the **typegen drift check** (`git diff --exit-code` on `products/<product>/api-client/`) if any relocation touched the endpoint chain.

Process:

1. Read the plan + implementation docs in full.
2. Walk every file in the feature surface — `products/<product>/app/features/<FEATURE>/**`, then trace outward into every `packages/core` / `packages/ui` / `packages/config` helper it depends on (or duplicates), every primitive it pulls from `@platform/ui` (`packages/ui/src/components/ui/*`), every generated-client hook it consumes from `products/<product>/api-client/`, and across the API: every `schemas/`, `routers/`, `services/`, `models/` file the endpoint chain touches plus any `core/`/`common/` helper it leans on. Do not skim.
3. Build a commonification inventory as a to-do list — one entry per relocation, each tagged with:
   - source path (current home in `products/<product>/app/features/<FEATURE>/` or the API aggregate)
   - destination path (canonical shared home — `packages/ui`, `packages/core`, `packages/config`, or the product API's `core/`/`common/`)
   - generic-vs-feature-specific reasoning (one sentence — anchored on the promote-on-2nd-use test)
   - whether a colocated test moves with it (yes/no + new test path)
   - import-path blast radius (file count touched)
   - risk (low/med/high) of regression
4. Execute relocations smallest-blast-radius first. For each:
   a. Move the source file to its new home.
   b. Move the colocated test to match (logic UNCHANGED — only file path and any mock/import specifiers).
   c. Update every importing file's path (`@/features/<FEATURE>/...` → the shared specifier, e.g. `@platform/core` / `@platform/ui`, or the relocated API module path).
   d. Update the public surface in `products/<product>/app/features/<FEATURE>/index.ts` — remove the export if the consumer should now import from the shared home, OR keep a re-export only if the feature itself genuinely still owns that symbol. (For API moves, the equivalent boundary is the aggregate's `schemas/`+`routers/`+`services/`+`models/` surface vs. the shared `core/`/`common/`.)
   e. Run the targeted suite — `turbo run test --filter=...<product>...` (JS) / `pytest` (API) — confirm green before moving on. If a move touched the endpoint chain, regenerate the typed client (typegen) and confirm no drift.
5. Update both docs in the same pass (per the "docs + tests are part of every change" convention):
   - Plan doc: add a `## Post-ship deltas` entry per relocated module — old path → new shared home, why it was generic enough to promote (cite promote-on-2nd-use).
   - Implementation doc: update the file inventory section, reflect the new homes, add a "Commonification pass" subsection summarizing what moved out of the feature and what stayed (with one-sentence rationale per stayed-but-considered item).
6. Final gate: `turbo run lint typecheck test build --filter=...<product>...` (+ `export:web` where web is touched) AND — for API changes — `ruff check && pyright && pytest`, plus the typegen drift check, all green. Report what moved — file count relocated, LOC moved out of the feature folder, new shared primitives surfaced (and which package they landed in), primitives that other features/products can now compose against.

What "commonification" does NOT mean here:

- No behaviour changes. Pure relocation + path updates. If a move would force a behaviour tweak, it is out of scope — flag it and stop.
- No new abstractions invented to "make it commonifiable". Move only what is ALREADY general-purpose. If something is 80% generic and 20% feature-specific, do not split it speculatively — leave it in the feature, flag it as a candidate. (This is the promote-on-**2nd**-use rule: one use is not a promotion trigger.)
- No premature parameterization. Don't add config knobs / `cva` variants "in case other features need them later". If the second feature ever shows up and needs a knob, add it then.
- No renames during relocation unless the destination's naming convention forces it (e.g. a `<feature>-` prefix has to drop when the file moves to `packages/core`). When you must rename, do it minimally and update all callers in the same commit.
- No domain logic moves out of the feature. The product-specific schemas, copy, channel templates, business rules — and **domain logic that belongs in a service** — all STAY in `products/<product>/app/features/<FEATURE>/` (and the aggregate's service). Only the GENERIC scaffolding around them moves.
- No "while I'm in here" simplifications, dependency upgrades, or test additions. (Behaviour-preserving quality cleanup is `/ptfm-simplify`'s job; net-new tests are `/ptfm-audit`'s. Keep this pass a pure promotion.)

## Available MCPs / CLIs (use as needed)

- **Linear** (`mcp__Linear__*`) — re-read the ticket / comments for context on which constructs were always feature-specific vs. accidentally local.
- **Supabase** (`mcp__Supabase__*`) — read-only schema introspection: `list_tables`, `list_migrations`, `execute_sql` for read-only checks when a relocation involves schema-aware helpers. **Migrations go via Alembic, NOT `apply_migration`** — use the MCP only to introspect.
- **Figma** (`mcp__Figma__*`) — this project has a deep Figma integration (Code Connect + token modes). Use it when promoting a UI primitive to `packages/ui`, to confirm the lifted primitive matches its Figma component and its token modes (light/dark × brand) before it becomes shared. Full UI testing is `/ptfm-test-ui`'s job.
- **Notion** (`mcp__Notion__*`) — rare; only if a referenced doc clarifies original intent (whether a construct was always meant to be shared).
- **Playwright** (`mcp__playwright__*`) — rare; this isn't a UI-test pass.

(Deployment surfaces — Fly = api, EAS = mobile, Vercel = web, Electron = desktop — are context only here, not a workflow pillar.)

---

Start now, scoped to `products/<product>`. Go step by step. Do not stop until every commonification candidate has been moved or explicitly justified-as-staying (against the promote-on-2nd-use test), the public surface (`products/<product>/app/features/<FEATURE>/index.ts`, and the API aggregate boundary) reflects the new homes, the docs are updated, and the suite is green — `turbo run lint typecheck test build --filter=...<product>...` (+ `export:web` where web is touched), `ruff check`, `pyright`, `pytest`, and the typegen drift check. For behaviour-preserving quality cleanup that is NOT a relocation, hand off to `/ptfm-simplify`.
