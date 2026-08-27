---
description: DRY and consolidate feature logic by lifting genuinely generic constructs out of a product-local feature into their shared homes (packages/ui, packages/core, packages/config, or the product API's core/common module) — pure relocation, never behaviour change
argument-hint: "<product> <ticket-id> [slug] [user-instruction]"
---

Args: $ARGUMENTS

Expected shape: `<product> <TICKET-ID> [slug-or-title] [primary user instruction]`

- **`<product>`** — first token: the product directory under `products/` (e.g. `blog`). **Required.** If absent, infer it from the cwd when the session is inside `products/<name>/...`; otherwise STOP and ASK. Validate that `products/<product>/` exists; if it doesn't, STOP and ASK — do NOT guess. EVERYTHING this command does — the codebase walk, every glob, every save path — is scoped to `products/<product>/`.
- **`<TICKET-ID>`** — second token (e.g. `CRO-412`). **Required.** If not passed, the resolve block below auto-infers from the current branch; if it can't, STOP and ask.
- **`[slug-or-title]`** — optional next token (kebab-case slug or quoted title). Overrides the auto-inferred slug. If absent, the resolve block below recovers it — an existing doc for this ticket is the authority; the branch is only a seed, used when no doc exists yet.
- **`[primary user instruction]`** — anything after the slug (or after the ticket ID if no slug-shaped token follows). Freeform guidance for THIS specific invocation — adjust scope, focus, or emphasis as instructed. **It does NOT override the absolute rules below** — if it conflicts with a rule, prefer the rule and surface the conflict to the user.

---

We need to "commonify" the entire `<FEATURE>` feature in `products/<product>`. And I mean the full feature — read each and every file one by one, go step by step, think hard, create as many to-dos as required. Your job is to **DRY and consolidate logic** by lifting constructs that have been built inside `products/<product>/app/features/<FEATURE>/**` (and the API aggregate that backs it) but that genuinely belong in shared homes out of the feature, so future features — in this product AND across the monorepo — can reuse them.

This command is the operational arm of **`PHILOSOPHY.md`'s promote-on-2nd-use rule**: _"features are **product-local** (`app/features/<feature>/`, route files stay thin one-liners); **promote to `packages/*` on 2nd use** (documented convention)."_ Commonify is where that promotion actually happens — a construct that was born inside a feature and is now wanted unchanged by a second surface gets lifted into its shared home. That rule IS this command's mandate; cite it whenever you justify (or decline) a move.

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

- @PHILOSOPHY.md — the architecture/decision GOSPEL (locked decisions, conventions, invariants). The **promote-on-2nd-use** rule and the `packages/{ui,core,config}` boundaries live here; when anything conflicts with it, it wins.
- @CLAUDE.md (repo root) — monorepo map + conventions (the shared-package boundaries, semantic-tokens-only, broadcast-only realtime, problem+json, never-edit-generated-client, promote-on-2nd-use).
- @products/<product>/CLAUDE.md — the product's structure, ports, infra names.
- the nested **API** `CLAUDE.md` under `products/<product>/api/` — the layered-services recipe. (The shared home for API helpers — a `core/`/`common/` module within the product's API — is defined by this command below.)
- @packages/ui/CLAUDE.md + @packages/ui/FIGMA.md — design-system runbook + token contract (where a promoted primitive lands and how a `cva` variant is added).
- `Glob products/<product>/docs/plans/<TICKET-ID>*_plan.md` — read the match in full. **If it returns nothing, STOP and ASK.**
- `Glob products/<product>/docs/implementation/<TICKET-ID>*_implementation.md` — read the match in full. **If it returns nothing, STOP and ASK.**

(A constructed exact path is deliberately NOT used for these two: reading a path that does not exist fails SILENTLY, and the stage then runs with no plan in context and still reports success. The glob is the same lookup that resolved `<slug>`, so it hits whenever a doc exists at all; the STOP is what makes a genuinely missing doc loud instead of invisible.)

(If a `CLAUDE.md` is absent, fall back to `PHILOSOPHY.md` — product-level ones are stamped from `products/_template`.)

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
- The full test suite MUST pass after every meaningful relocation step, not just at the end — **`turbo run test --filter=...*<product>*...`** for JS and **`pytest`** for the API. If it goes red, you revert or fix forward (by fixing the production code or import paths, NOT the assertions) before moving on.
- `turbo run lint typecheck test build --filter=...*<product>*...` (JS) AND — for any API change — `ruff check && pyright && pytest` is the final gate. All green, zero skipped, zero `.only`, zero `.skip`, zero new ignores. Where a move touches web, include `export:web`. Run the **typegen drift check** (`node scripts/check-typegen-drift.mjs`) if any relocation touched the endpoint chain.

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
   e. Run the targeted suite — `turbo run test --filter=...*<product>*...` (JS) / `pytest` (API) — confirm green before moving on. If a move touched the endpoint chain, regenerate the typed client (typegen) and confirm no drift.
5. Update both docs in the same pass (per the "docs + tests are part of every change" convention):
   - Plan doc: add a `## Post-ship deltas` entry per relocated module — old path → new shared home, why it was generic enough to promote (cite promote-on-2nd-use).
   - Implementation doc: update the file inventory section, reflect the new homes, add a "Commonification pass" subsection summarizing what moved out of the feature and what stayed (with one-sentence rationale per stayed-but-considered item).
6. Final gate: `turbo run lint typecheck test build --filter=...*<product>*...` (+ `export:web` where web is touched) AND — for API changes — `ruff check && pyright && pytest`, plus the typegen drift check, all green. Report what moved — file count relocated, LOC moved out of the feature folder, new shared primitives surfaced (and which package they landed in), primitives that other features/products can now compose against.

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

Start now, scoped to `products/<product>`. Go step by step. Do not stop until every commonification candidate has been moved or explicitly justified-as-staying (against the promote-on-2nd-use test), the public surface (`products/<product>/app/features/<FEATURE>/index.ts`, and the API aggregate boundary) reflects the new homes, the docs are updated, and the suite is green — `turbo run lint typecheck test build --filter=...*<product>*...` (+ `export:web` where web is touched), `ruff check`, `pyright`, `pytest`, and the typegen drift check. For behaviour-preserving quality cleanup that is NOT a relocation, hand off to `/ptfm-simplify`.

## Next stage

When this pass is complete, hand off to `/ptfm-review` - the staff-engineer + AppSec pass, which is a BLOCKING gate and not optional.

The full pipeline is `/ptfm-product` -> `/ptfm-architect` -> `/ptfm-plan` -> `/ptfm-implement` -> `/ptfm-audit` -> `/ptfm-simplify` -> `/ptfm-commonify` -> `/ptfm-review` -> `/ptfm-test-ui`. Stages before `/ptfm-plan` are skipped for smaller work (each says so itself); `/ptfm-review` is NOT skippable; `/ptfm-test-ui` is optional and applies only where the change touches UI.
