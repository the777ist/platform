---
description: Simplify, converge, and condense the logic in a feature within one product — same behaviour, less code, fewer concepts, one source of truth per piece of logic (no test edits, no relocation out of the feature)
argument-hint: "<product> <ticket-id> [slug] [user-instruction]"
---

Args: $ARGUMENTS

Expected shape: `<product> <TICKET-ID> [slug-or-title] [primary user instruction]`

- **`<product>`** — first token: the product directory under `products/` (e.g. `blog`). **Required.** If absent, infer it from the cwd when the session is inside `products/<name>/...`; otherwise STOP and ASK. Validate that `products/<product>/` exists; if it doesn't, STOP and ASK — do NOT guess. EVERYTHING this command does — the codebase walk, every glob, every save path — is scoped to `products/<product>/`.
- **`<TICKET-ID>`** — second token (e.g. `ABC-145`). **Required.** If not passed, the resolve block below auto-infers from the current branch; if it can't, STOP and ask.
- **`[slug-or-title]`** — optional next token (kebab-case slug or quoted title). Overrides the auto-inferred slug. If absent, the resolve block globs `products/<product>/docs/plans/` and `products/<product>/docs/implementation/` to recover it.
- **`[primary user instruction]`** — anything after the slug (or after the ticket ID if no slug-shaped token follows). Freeform guidance for THIS specific invocation — adjust scope, focus, or emphasis as instructed. **It does NOT override the absolute rules below** — if it conflicts with a rule, prefer the rule and surface the conflict to the user.

---

We need to simplify the entire `<FEATURE>` feature in `products/<product>`. And I mean the full feature — read each and every file one by one, go step by step, think hard, create as many to-dos as required. Your job is to **simplify, converge and condense the logic** WITHIN this feature: same behaviour, less code, fewer concepts, one source of truth per piece of logic. Relocating logic OUT to a shared home (`packages/ui`, `packages/core`, the product's shared API module) is the **commonification** pass (`/ptfm-commonify`) — a separate run. This pass collapses duplication that lives inside the feature.

**Resolve `<product>`, `<TICKET-ID>`, `<slug>`, and `<FEATURE>` BEFORE doing anything else.**

1. **`<product>`** — first token if provided; else infer from cwd (`products/<name>/...`); else STOP and ASK. Confirm `products/<product>/` exists.
2. **`<TICKET-ID>`** — if a ticket-shaped token was provided in `$ARGUMENTS` (after `<product>`), use it. Otherwise run `git branch --show-current` and extract the `<TEAM>-<NUMBER>` portion (e.g. `ABC-145` from `feature/ABC-145-d2c-bulk-edit`). If neither yields a ticket, STOP and ASK — do NOT guess.
3. **`<slug>`** — if a slug-shaped token was provided, use it. Otherwise `Glob products/<product>/docs/plans/<TICKET-ID>*_plan.md` and `products/<product>/docs/implementation/<TICKET-ID>*_implementation.md` to recover the canonical slug (the segment between `<TICKET-ID>-` and the `_plan.md` / `_implementation.md` suffix).
4. **`<FEATURE>`** — derive from the plan / implementation docs (they reference `products/<product>/app/features/<feature>/...` extensively), or by mapping the slug to a folder under `products/<product>/app/features/`. If no clear match, ASK.

Reference docs (read these first, in full):

- @PHILOSOPHY.md — the architecture/decision GOSPEL (locked decisions, conventions, invariants). When anything conflicts with it, it wins.
- @CLAUDE.md (repo root) — monorepo map + conventions (semantic-tokens-only, broadcast-only realtime, problem+json, never-edit-generated-client, promote-on-2nd-use).
- @products/<product>/CLAUDE.md — the product's structure, ports, infra names.
- the nested **API** `CLAUDE.md` under `products/<product>/api/` — the add-an-endpoint recipe (model→service→schema→router→openapi→typegen→hook→screen).
- @packages/ui/CLAUDE.md + @packages/ui/FIGMA.md — design-system runbook + token contract.
- @products/<product>/docs/plans/<TICKET-ID>-<slug>\_plan.md
- @products/<product>/docs/implementation/<TICKET-ID>-<slug>\_implementation.md

(If a `CLAUDE.md` is absent because the monorepo is mid-build, fall back to `PHILOSOPHY.md`.)

What you are looking for:

1. **Duplicated logic** — the same (or near-same) function/helper/transform/validation/Pydantic-or-Zod-schema/error-mapper/state-shape implemented in two or more places. Collapse to one canonical implementation and re-point all call sites.
2. **Logic that should be reused but isn't** — an inline transform in a service method that already exists as a helper alongside it; an ad-hoc fetch that should go through the **generated typed client** instead of hand-rolling a call; a bespoke rate-limit (slowapi) / broadcast-invalidate / problem+json mapping wired by hand where the feature already has the helper; a one-off Pydantic schema or Zod form schema that overlaps with one already in this feature's `schemas/` (API) or the feature's validation. Re-point to the existing one — WITHIN the feature. (If the right home is a SHARED package, that's `/ptfm-commonify`, not this pass — flag it and leave it.)
3. **Convergeable variants** — multiple slightly-different versions of essentially the same logic that can be unified behind one function (with at most one well-named parameter), OR collapsed by deleting the redundant ones. **Prefer deletion over parameterization.** Three near-identical helpers across files is the canonical signal (rule of three / AHA — Avoid Hasty Abstractions: wait for the duplication to be real before collapsing, but once it's real, collapse it).
4. **Component duplication** — feature components re-implementing primitives instead of composing from `@platform/ui` (`packages/ui/src/components/ui/*`). If a feature component is doing layout/state/styling that an existing primitive already does, replace it with the primitive. If a needed primitive is genuinely missing, EXTEND the library (a `cva` variant / opt-in prop) rather than copy-pasting — but **never modify a shared primitive to serve one feature**, and never fork it. (Promoting a feature component UP into `packages/ui` on 2nd use is the commonification pass.)
5. **Style/token drift** — any raw hex, ad-hoc `text-[...]` arbitrary values, or hand-named colors in this feature. Replace with **NativeWind semantic tokens** (`bg-background`, `bg-primary`, `text-foreground`, `border-border`, …) per `@packages/ui/CLAUDE.md` and the token contract. **Never raw hex** — token values come from the Figma pipeline (`theme.ts` / `global.css`); never hand-name a color.
6. **Server-side glue duplication** — multiple routers / services / methods that share input parsing, error translation (to problem+json), identity/ownership resolution, rate limiting (slowapi), or broadcast-invalidate wiring. Pull into a shared helper WITHIN the feature's API surface (the aggregate's service or a feature-local helper) if the pattern is repeated 2+ times. Keep the layering intact — thin router → service owns logic + data access; DTOs stay separate from ORM models.
7. **Dead code and zombie branches** — anything no test exercises AND no live code path reaches. Delete.

RULES FOR TESTS — read these twice. The premise: good test coverage is what lets you simplify safely. Tests flag when behaviour breaks. So tests are the safety net first, and editable only as a last resort.

- **Default: do not touch test files.** No edits, no renames, no assertion tweaks, no mock-shape updates, no deleting "redundant" tests, no moving tests between files. If a test fails after a simplification, the FIRST hypothesis is that the simplification is wrong — fix the production code, not the test.
- **Exception (rare, justified, minimal):** if a consolidation genuinely changes a function signature, return shape, error code (problem+json `type`), import path, or mock-injection seam that a test asserts on, you MAY update the test to match. The bar:
  (a) The simplification changed a contract the test was legitimately asserting on (signature, returned DTO shape, observable side-effect call site — service-method call, broadcast fired, navigation).
  (b) The user-observable behaviour did NOT change — only the internal contract.
  (c) The test edit is the smallest possible change: rename, re-shape the assertion to the new contract, or update the import. NOT a rewrite, NOT a deletion, NOT a "while I'm in here" cleanup.
  (d) You log the test change in the implementation doc with: test file, what changed, why the simplification forced it, and confirmation the user-facing behaviour is unchanged.
- **Never** adjust an assertion just to make a red test go green without understanding the failure. If you can't explain in one sentence why the assertion needed to change AND why the behaviour is still preserved, the simplification is wrong — revert.
- **Never** delete tests on the grounds that "the new code makes them redundant". Coverage shrinkage is a regression in itself. If two tests genuinely test the same thing after consolidation, surface both to the user and let them choose.
- **Always off-limits:** the jest-expo config (the `jest.config.*` / jest-expo preset), the project's test setup / shared scaffold (e.g. the RNTL setup, `jest.mock` factories, polyfactory factories, `seed.py`), the pytest fixtures / conftest, and any fixture data shape that encodes product behaviour. Edits there are out of scope — flag and stop.
- The full test suite MUST pass after every meaningful refactor step, not just at the end — `turbo run test` (JS, jest-expo) and, for API changes, `pytest`. If it goes red, you revert or fix forward.
- Final gate: for JS — `turbo run lint typecheck test build --filter=...<product>...`; for API changes — `ruff check && pyright && pytest`; plus the typegen drift check. All green, zero skipped, zero `.only`, zero new ignores.

Process:

1. Read the plan + implementation docs in full (and the reference docs above).
2. Walk every file in the feature surface — `products/<product>/app/features/<FEATURE>/**`, every component / hook / store (Zustand) / generated-client hook it touches, every `@platform/ui` primitive (`packages/ui/src/components/ui/*`) and `packages/core` helper it depends on, the Expo Router route/screen files, and across the API every `schemas/` / `routers/` / `services/` / `models/` file the endpoint chain touches (plus any `products/<product>/api-client/` endpoints the feature consumes — NEVER hand-edited). Do not skim.
3. Build a duplication/consolidation inventory as a to-do list — one entry per simplification, each tagged with: files affected, what's duplicated, the canonical home (WITHIN the feature), and the risk (low/med/high) of regression. Anything whose right home is a SHARED package or a cross-product utility → flag for `/ptfm-commonify`, do not act on it here.
4. Execute simplifications smallest-blast-radius first. After each change run `turbo run test --filter=...<product>...` (JS) and/or `pytest` (API), and confirm green before moving on. When a simplification touches an API endpoint, regenerate the typed client (typegen) and confirm no unintended drift.
5. Update both docs in the same pass (per the "Docs + tests are part of every change" rule in `CLAUDE.md`):
   - Plan doc: add a `## Post-ship deltas` entry per consolidated decision.
   - Implementation doc: update the file inventory, note deletions/relocations-within-feature, log behaviour-preserving refactors with their rationale.
6. Final gate: for JS — `turbo run lint typecheck test build --filter=...<product>...` (+ `export:web` where web changed); for API changes — `ruff check && pyright && pytest`; plus the typegen drift check — all green. Report what shrank — file count, LOC, duplicated symbols eliminated, primitives composed/extended.

What "simplification" does NOT mean here:

- No new abstractions invented for hypothetical future reuse. Consolidate only where duplication ALREADY exists (rule of three or stronger signal).
- No renaming sprees. Rename only when consolidation forces it.
- No behaviour changes. If a refactor changes what the user sees or what the API returns (DTO shape, problem+json `type`, cursor-pagination shape, broadcast payload), it's out of scope — flag it and stop.
- No "while I'm in here" feature work, dependency upgrades, or test additions.
- No relocating logic out of the feature folder into a shared home (`packages/ui`, `packages/core`, the product's shared API module) — that's the commonification pass (`/ptfm-commonify`), run separately. This pass stays inside `products/<product>/app/features/<FEATURE>/` and the feature's API aggregate.

## Available MCPs / CLIs (use as needed)

- **Linear** (`mcp__Linear__*`) — re-read the ticket / comments for context on what was originally intended (helps decide what's safe to collapse vs. what's load-bearing).
- **Supabase** (`mcp__Supabase__*`) — read-only schema introspection: `list_tables`, `list_migrations`, `execute_sql` for read-only checks on whether a helper is genuinely the only consumer of a schema element before consolidating. Introspection only — migrations go via **Alembic**, never `apply_migration`.
- **Notion** (`mcp__Notion__*`) — rare; only if a referenced doc clarifies original intent.
- **Playwright** (`mcp__playwright__*`) — rare; this isn't a UI-test pass. Use only if a behaviour-preserving refactor needs a live web sanity check.

---

Start now. Go step by step. Do not stop until the entire feature has been combed through, every duplication addressed or explicitly justified (relocations-out flagged for `/ptfm-commonify`), docs updated, and the suite is green — `turbo run lint typecheck test build --filter=...<product>...` (JS) and, for API changes, `ruff check && pyright && pytest`, plus the typegen drift check.
