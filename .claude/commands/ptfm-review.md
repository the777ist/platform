---
description: In-depth code review + security review of a product's branch changes — staff-engineer + AppSec rigor, grounded in PHILOSOPHY.md + the CLAUDE.md chain and industry best practice (OWASP / STRIDE). Produces a severity-ranked, adversarially-verified findings report, saves it under the product's docs/reviews/, optionally fixes blockers with sign-off.
argument-hint: "<product> <ticket-id> [slug] [user-instruction]"
---

Args: $ARGUMENTS

Expected shape: `<product> <TICKET-ID> [slug-or-title] [primary user instruction]`

- **`<product>`** — first token: the product directory under `products/` (e.g. `blog`). **Required.** If absent, infer it from the cwd when the session is inside `products/<name>/...`; otherwise STOP and ASK. Validate that `products/<product>/` exists; if it doesn't, STOP and ASK — do NOT guess. EVERYTHING this command does — the diff enumeration, the codebase walk, every glob, every save path — is scoped to `products/<product>/`.
- **`<TICKET-ID>`** — second token (e.g. `ABC-145`). If not passed, the resolve block below auto-infers from the current branch; if it can't, that's fine for a review — proceed; the ticket is only used to locate plan/impl docs and name the report.
- **`[slug-or-title]`** — optional next token (kebab-case slug or quoted title). Overrides the auto-inferred slug. If absent, the resolve block globs `products/<product>/docs/plans/` and `products/<product>/docs/implementation/` to recover it.
- **`[primary user instruction]`** — anything after the slug (or after the ticket ID if no slug-shaped token follows). Freeform guidance for THIS specific invocation — scope the review ("security only", "just the realtime surface", "review PR #123", "review the last 3 commits"), set the base branch, raise the bar, etc. **It does NOT override the absolute rules below** — if it conflicts with a rule, prefer the rule and surface the conflict to the user.

---

We need to do a deep **code review AND security review** of the changes on this branch for `products/<product>`, as a **staff engineer + application-security reviewer** would. Discover the diff, read every changed file one by one AND the code it touches, think hard, go step by step, create as many to-dos as required, and produce a **severity-ranked, adversarially-verified** findings report. Review against TWO bars simultaneously: (1) **this project's conventions** (`PHILOSOPHY.md` is the gospel and the CLAUDE.md chain is the rulebook — strict-layered FastAPI services, **DTO≠ORM**, **problem+json never-raw-error**, `@platform/ui` primitives only, semantic tokens never hex, never-hand-edit the generated client, Alembic per schema change, **RLS deny-all**, broadcast-only realtime, slowapi, Pydantic-strict + pyright-strict, cursor pagination, package + feature-module boundaries) and (2) **industry best practice** (correctness, OWASP-class security, performance, maintainability, testability). **Every finding must be real** — a review that cries wolf is worse than no review. Verify each finding before reporting it; rank by severity and confidence; give each a concrete fix.

**Resolve `<product>`, `<TICKET-ID>`, `<slug>`, and the review surface BEFORE doing anything else.**

1. **`<product>`** — first token if provided; else infer from cwd (`products/<name>/...`); else STOP and ASK. Confirm `products/<product>/` exists.
2. **`<TICKET-ID>`** — if a ticket-shaped token was provided in `$ARGUMENTS` (after `<product>`), use it. Otherwise run `git branch --show-current` and extract the `<TEAM>-<NUMBER>` portion (e.g. `ABC-145` from `feature/ABC-145-d2c-bulk-edit`). If neither yields a ticket, that's fine for a review — proceed; the ticket is only used to locate plan/impl docs and name the report.
3. **`<slug>`** — if a slug-shaped token was provided, use it. Otherwise `Glob products/<product>/docs/plans/<TICKET-ID>*_plan.md` and `products/<product>/docs/implementation/<TICKET-ID>*_implementation.md` to recover the canonical slug; else derive from the branch name.
4. **Review surface** — default is the diff between the current branch and the base branch (`main` for this repo (trunk-based per PHILOSOPHY.md) — confirm via `git remote show origin` if unsure), scoped to `products/<product>/`, PLUS uncommitted working-tree changes. The user instruction may override (a PR number, a commit range, a path filter, "security only"). If the diff is empty, STOP and ask what to review.

Reference docs (read these first, in full):

- @PHILOSOPHY.md — the architecture/decision GOSPEL this review ENFORCES (locked decisions, conventions, invariants). When anything conflicts with it, it wins.
- @CLAUDE.md (repo root) — monorepo map + conventions: layered services + DTO≠ORM, problem+json, semantic-tokens-only, broadcast-only realtime, never-edit-generated-client, RLS deny-all, promote-on-2nd-use, feature/package boundaries.
- @products/<product>/CLAUDE.md — the product's structure, ports, infra names.
- the nested **API** `CLAUDE.md` under `products/<product>/api/` — the add-an-endpoint recipe (model→service→schema→router→openapi→typegen→hook→screen) the change must conform to.
- @packages/ui/CLAUDE.md + @packages/ui/FIGMA.md — design-system runbook + token contract.
- The ticket's plan + implementation docs if they exist (`products/<product>/docs/plans/<TICKET-ID>-<slug>_plan.md`, `products/<product>/docs/implementation/<TICKET-ID>-<slug>_implementation.md`) — review the change against its stated intent, not just in the abstract.

(If a `CLAUDE.md` is absent because the monorepo is mid-build, fall back to `PHILOSOPHY.md`.)

---

## Step 1 — Discover the diff and build complete depth-of-understanding

Do NOT review files in isolation — a change is only correct in context.

1. **Enumerate the diff.** `git diff main...HEAD --name-only` (base = `main` unless overridden) filtered to `products/<product>/` + `git status` for working-tree changes. Build the full list of added / modified / deleted files.
2. **Read every changed file in full** — not just the hunks. A hunk that looks fine can be wrong given the rest of the file.
3. **Walk outward for each change**: what calls this code, what this code calls, the types it depends on, the tests that cover it, the feature's `index.ts` public surface. A changed endpoint means reading its router, its service method(s), its Pydantic `schemas/` DTOs, its SQLModel `models/`, its RLS posture, its generated-client hook + the screen that consumes it, and its tests. A changed screen means reading the feature module, the `@platform/ui` primitives + `packages/core` helpers it depends on, and its RNTL tests.
4. **For DB / schema changes**, inspect the live schema with the Supabase MCP (`mcp__Supabase__list_tables`, `list_migrations`, `get_advisors`, `execute_sql` read-only) so the review reflects reality, not the migration's assumed state. Confirm a backing **Alembic** migration exists under `products/<product>/api/.../alembic/versions/`. `get_advisors` surfaces security + performance issues Supabase itself flags (missing/disabled RLS, exposed views, unindexed FKs, etc.) — fold those in.
5. **Read the plan / impl docs** (if any) to review the change against its intent — did it build what was planned? Did it silently deviate? Did it skip a planned test?
6. **Baseline the gates** — for JS run `turbo run lint typecheck test build --filter=...<product>...` (+ `export:web` where the change touches web); for the API run `ruff check`, `pyright`, `pytest`; and run the **typegen drift check** (`git diff --exit-code` on the regenerated `products/<product>/api-client/`). Capture status. A red gate is itself a finding; a green baseline tells you the change at least compiles + passes its own tests + has no typegen drift.

---

## Step 2 — Code review pass (dimension by dimension)

Go through EVERY dimension for the changed surface. For each issue: file:line, what's wrong, why it matters, the concrete fix. (Verification + severity come in Step 4 — here, cast wide.)

**Engineering canon to review against.** A great reviewer doesn't react ad-hoc — they hold the change against established principles and name the one it violates. Draw from these; cite the principle in the finding so the author learns the rule, not just the fix:

- **SOLID** — Single-responsibility (a service / component / module does ONE thing; a 400-line component doing fetch + transform + render + mutation, or a service method doing validation + business logic + broadcast + serialization, is an SRP smell), Open/closed (extend via props / cva variants, don't edit shared primitives — mirrors the project's "never modify a `@platform/ui` primitive for one call site" rule), Liskov, Interface-segregation, Dependency-inversion (routers depend on a service via `Depends`, not on concretions; the app depends on the generated typed client + the feature's `index.ts` boundary, not internals).
- **Domain-Driven Design** — the project's **bounded contexts are the product-local features** (the feature `index.ts` is the context boundary — ubiquitous language lives inside, leaks don't cross) AND the API's **one service class per aggregate**. Domain logic belongs in **services**, NOT in routers or components (an anemic-vs-rich split). Flag domain logic leaking into a thin router or into the UI layer, and flag one feature reaching into another's internals or one service reaching across an aggregate boundary (bounded-context violations the import-boundary rules already guard).
- **Command-Query Separation** — read vs write **service methods**: a query method (a `get_*` / `list_*` read) must not write. Flag a query method that mutates, or a read smuggled into a write path.
- **Coupling & cohesion / connascence** — prefer weak connascence (of name) over strong (of position / order / algorithm); when strong connascence is unavoidable, co-locate it. Flag shotgun-surgery coupling (one logical change forcing edits across many files) and feature-envy (a function more interested in another module's data than its own).
- **DRY, but AHA (Avoid Hasty Abstractions)** — collapse genuine triplication (rule of three), but flag premature / speculative abstraction just as hard. The wrong abstraction is more expensive than duplication. (Consolidation is `/ptfm-simplify`'s pass — here, just flag.)
- **YAGNI / KISS** — speculative config knobs, unused generality, "we might need it later" parameters → flag.
- **Law of Demeter** — flag deep reach-through chains (`a.b.c.d.e`) that couple the caller to a distant structure.
- **Fowler refactoring smells** — long method, large class/component, primitive obsession (passing 6 strings where a typed Pydantic DTO belongs), divergent change (one module changing for many unrelated reasons), data clumps, temporal coupling (call B must follow call A or it breaks silently).
- **Google code-review standard** — the reviewer's bar is "**net positive**, not perfect": does the change do what it claims, is it appropriately scoped (not a 40-file diff for a 1-line fix), is the design sound, naming clear, are comments explaining _why_ (not _what_), and are the tests good. Approve when it improves the codebase health even if not flawless; block on the things that matter.

**a) Correctness & bugs** — logic errors, off-by-one, wrong operator/comparison, null / undefined / empty handling, unhandled error paths, incorrect async (missing `await` — including RNTL v14 `render`/`fireEvent`/`renderHook` which are async; unhandled rejection; race conditions), state-transition bugs (TanStack Query idle→loading→success/error), optimistic-update rollback gaps, cursor-pagination boundary bugs (opaque base64-on-id encoding/decoding), boundary conditions, wrong assumptions about external data shape.

**b) Project-convention adherence (PHILOSOPHY.md + CLAUDE.md chain — these are hard rules, not style):**

- **Strict-layered API** — `schemas/` (Pydantic DTOs) → `routers/` (thin; depend on a service via `Depends`) → `services/` (one class per aggregate; owns business logic + data access) → `models/` (SQLModel persistence only). **NO repository layer.** Flag a fat router with business logic, a service skipping the layer, or any data access outside a service.
- **DTO≠ORM** — a SQLModel row must NEVER be serialized to the client; every response is a Pydantic DTO. Flag any endpoint returning an ORM model directly.
- **problem+json, never raw** — services raise typed errors mapped to **RFC 9457 problem+json**; no raw error strings / stack traces cross the boundary, no throwing raw across layers. Flag raw `error.message` / SDK strings surfacing to the user (the client consumes typed problem+json, never raw).
- **UI composes `@platform/ui` primitives only** — no raw React Native `<Pressable>` / `<TextInput>` / `<Text>` re-implementing a primitive that already exists; **no modifying a shared primitive to suit one call site** (extend with an opt-in prop / cva variant / compose). Tier-2 product compositions live in the feature; promote to `packages/ui` on the 2nd use.
- **Semantic tokens only** — `bg-background`, `bg-primary`, `text-foreground`, `border-border`, … — **NEVER raw hex, never ad-hoc color literals**. Brand is a token mode; light + dark from day one. Token values come from the Figma pipeline — never hand-named.
- **Generated client is never hand-edited** — change the endpoint, run typegen, regenerate. Flag any manual edit under `products/<product>/api-client/`; flag typegen drift.
- **Alembic for every schema change** — flag any DDL / model change not backed by an Alembic migration under `products/<product>/api/.../alembic/versions/`.
- **RLS deny-all on every table** — flag any new table not deny-all, and any Realtime / PostgREST surface opened beyond what's deliberately needed for Realtime reads. The API's privileged role bypasses RLS server-side only.
- **Broadcast-only realtime** — after mutations the API broadcasts invalidation events on per-product channels; clients refetch through the API. Flag any Postgres-Changes subscription or RLS hole opened for realtime.
- **slowapi rate-limit** — on every public / paid / expensive route (keyed per-user on the verified JWT `sub`, falling back to IP). Flag a money-spending or public route with no rate limit.
- **Pydantic-strict + pyright-strict** — `ConfigDict(strict=True)` on DTOs; **no `any`, no non-null `!`** in TS; type-only imports; import ordering.
- **Cursor pagination** — list endpoints return `{ items, next_cursor }` (opaque base64-on-id), `useInfiniteQuery`-ready. Flag offset/limit or unbounded list endpoints.
- **Cross-platform + theme coverage** — every UI surface needs explicit decisions for **iOS, Android, web, desktop**, plus **light/dark**, plus **brand modes**, plus responsive on web/tablet. "Works on web only" or "light mode only" is INCOMPLETE.
- **Package + feature-module boundaries** — import a feature via its `index.ts` only, never a deep path into another feature's internals; respect `@platform/ui` / `@platform/core` / `@platform/config` package boundaries; no cross-feature or cross-package deep imports. Cross-PRODUCT sharing of API (Python) code is NOT a locked pattern — flag it and surface, don't bless it.
- File-size / complexity ceilings; one logical component family per file.

**c) Architecture & design** (apply the engineering canon above — name the violated principle in each finding) — wrong layer / DDD leak (business logic in a router or component that belongs in a service; an inline transform that should be a `packages/core` or product `core/` helper); SRP violations (a unit doing too much); duplication that should be DRY'd (rule of three) vs. premature abstraction (AHA); Law-of-Demeter reach-through; bounded-context violations (one feature importing another's internals; a service crossing an aggregate boundary); a shared primitive growing feature-specific branches (OCP); CQS violations (a query service method that writes); Fowler smells (shotgun surgery, feature envy, primitive obsession, temporal coupling); unclear naming; missing or wrong public-surface exports from `index.ts`.

**d) Performance** — N+1 queries, unbounded queries (no cursor pagination / `.limit()`), query waterfalls that should be parallel, missing DB indexes on filtered/joined columns (cross-check `get_advisors`), needless client re-renders, over-broad TanStack Query invalidations (a broadcast event invalidating more than it needs), large client bundles from server-only deps, blocking work on the request path, missing pagination caps on list endpoints.

**e) Tests** — does the change have tests at the right layers (RNTL unit + component for the app; pytest unit + integration for the API)? Are they **meaningful** (assert on contract / call shape / which **service method** is called with what payload / which **problem+json `type` / error code** surfaces / which **TanStack Query** state transition fires (idle→loading→success/error) / which side effect — DB row content, **broadcast fired**, navigation, toast, autosave — NOT `expect(getByText("X"))`-only, NOT "renders without crashing", NOT snapshot-only, NOT asserting class names / inline styles / internal state)? Are edge cases covered (cursor-pagination round-trips, the broadcast-and-invalidate seam, problem+json error paths)? Did mocked tests assert call shape? Flag missing tests AND low-value tests. Tests must use **Jest (`jest.mock`)** — never vitest / `vi.mock`; RNTL renders are async (awaited); API tests run against a real Postgres with per-test isolation.

**f) Error handling & observability** — most-specific problem+json `type` / error code; a typed-client mapping for every new error `type`; structured logging with the `request_id` (no stray `console.log` / `print` left in); Sentry init untouched; broadcast invalidation events fired on the right per-product channel after each mutation.

**g) Accessibility** — keyboard reachability + focus management on web/desktop (modals trap + restore), RN accessibility props (`accessibilityRole` / `accessibilityLabel`) where the primitive doesn't supply them, semantic structure, and the cross-target + theme decisions for every surface (a web-only or light-mode-only change is incomplete).

---

## Step 3 — Security review pass (threat-model the change)

Review the change as an attacker would, grounded in named security canon — don't freelance:

- **OWASP Top 10 (2021)** — the web-app baseline. Walk the change against each relevant category (IDs tagged on the sub-dimensions below).
- **STRIDE** as the threat-modeling lens for any new trust boundary the change introduces — Spoofing, Tampering, Repudiation, Information disclosure, Denial-of-service, Elevation of privilege.
- **Principle of least privilege, defense-in-depth, secure-by-default, fail-securely** as the governing posture.
- _AI surfaces:_ this stack has **no locked AI layer**. If this product has introduced an AI surface, also apply the **OWASP Top 10 for LLM Applications** (prompt injection, insecure output handling, model DoS, sensitive-info disclosure, excessive agency) — otherwise it's N/A for this stack and there is nothing to review there.

For each issue: file:line, the attack, the impact, the fix, and the canon reference (OWASP A0x / STRIDE letter).

**a) Broken access control & IDOR (OWASP A01 — the #1 web risk; STRIDE: Elevation)** — every endpoint / service method that touches a user-owned resource MUST verify ownership. The API **verifies the Supabase JWT via JWKS server-side** (`PyJWKClient`, ES256/RS256) — authorization decisions come from the verified `sub`, **never a client-trusted claim** — PLUS explicit ownership checks in the service, PLUS **RLS deny-all** as defense-in-depth. **Can user A read / mutate user B's resource by passing B's ID or hitting the direct URL?** The privileged DB role is used ONLY server-side and ONLY where RLS must be bypassed deliberately (least privilege). Public / share surfaces must scope what they expose.

**b) Injection (OWASP A03; STRIDE: Tampering)** — Pydantic-strict validation on every external input (request bodies, path / query params); Zod only on the occasional frontend form. **SQL injection** — no string-built SQL; parameterized queries / SQLModel only (and DELETE/UPDATE via `session.execute(delete(...))`, never string-built). **XSS** — on the web target, audit any place user content reaches the DOM unescaped (markdown / HTML renderers, `dangerouslySetInnerHTML` equivalents). **SSRF (OWASP A10)** — any user-supplied-URL fetch on the server must reject localhost / `127.*` / `10.*` / `192.168.*` / `172.16-31.*` / `169.254.*` / `::1` / `.local` — flag any new fetch-by-user-URL without an SSRF guard.

**c) Cryptographic failures & data exposure (OWASP A02 / A09; STRIDE: Information disclosure)** — **`EXPO_PUBLIC_*` env vars are PUBLIC by definition** — flag ANY secret placed in an `EXPO_PUBLIC_*` var or otherwise shipped in the client bundle; real secrets live in Fly / EAS / Vercel / GH Actions stores, never in the repo. No secret / token / stack trace in logs or in errors returned to the user (problem+json carries no internals); PII stripped on public / shared surfaces; no over-fetching columns the surface doesn't need (DTO≠ORM helps here); no plaintext credential storage for any stored third-party credential.

**d) Rate limiting & cost-abuse (STRIDE: Denial-of-service)** — every public / paid / expensive endpoint gated with **slowapi** (per-user on the verified JWT `sub`, falling back to IP). An ungated public/paid endpoint is a **blocker** (DoS / cost), not a convention nit.

**e) Insecure design (OWASP A04)** — the change is implemented correctly but the _design_ is unsafe (a flow that trusts the client for an authz decision, a missing-by-design audit trail on a sensitive action, a race that allows double-spend, a realtime channel that leaks cross-tenant events). Threat-model the design, not just the code.

**f) Vulnerable & outdated components (OWASP A06; STRIDE: Tampering — supply chain)** — any new dependency (npm or Python): necessary, maintained, free of known CVEs? Flag new transitive risk, especially anything that runs at build or touches secrets.

**g) Auth failures, CSRF, open redirect (OWASP A07; STRIDE: Spoofing)** — JWKS verification correctness (algorithm pinning, audience / issuer checks, no `verify=False`); OAuth callbacks and any redirect that takes a user-supplied target; session / token handling. The env-driven **CORS allowlist** (including the `app://-` desktop origin) is in scope — flag a wildcard origin, a missing origin, or an over-broad allowlist; `supabase-js` is used on the client for auth/Realtime/Storage only.

**h) Supabase advisors (corroboration)** — run `mcp__Supabase__get_advisors` for both `security` and `performance` lenses; fold any flagged issue touching the changed surface into the report (missing / disabled RLS, `security definer` misuse, unindexed FKs, exposed views). The advisor is a second opinion, not a substitute for the threat-model above.

---

## Step 4 — Adversarially verify every finding, then rank

A false-positive-ridden review is noise. Before a finding goes in the report:

1. **Verify it's real** — re-read the code and its context; try to refute your own finding. "Is this actually reachable? Is there a guard upstream I missed (a JWKS dependency, an ownership check in the service, RLS deny-all behind it)? Does an existing test already cover this? Is this intentional per the plan?" If you can't defend it after trying to kill it, drop it or downgrade it to a low-confidence note.
2. **Assign severity:**
   - **🔴 Blocker** — must fix before merge: security hole (auth bypass, IDOR, injection, secret in an `EXPO_PUBLIC_*` var / client bundle, ungated paid endpoint, RLS not deny-all, a realtime cross-tenant leak), data loss / corruption, broken core user path, a red build/typecheck/typegen-drift.
   - **🟠 High** — should fix before merge: real bug on a non-core path, a hard PHILOSOPHY/CLAUDE.md rule violated with user-visible impact (DTO=ORM leak, raw error to user, hand-edited generated client, missing Alembic migration), a missing test on critical logic, a meaningful perf regression.
   - **🟡 Medium** — fix soon: maintainability / architecture smell, a convention miss without immediate impact, a weak test.
   - **🔵 Low / Nit** — optional polish: naming, micro-perf, style the linter didn't catch.
3. **Assign confidence** (high / medium / low) — low-confidence findings are framed as questions ("is X intentional?"), not assertions.
4. **De-dupe** — collapse the same root cause reported across multiple files into one finding with all locations.

---

## Step 5 — Write the review report

Save to `products/<product>/docs/reviews/<TICKET-ID>-<slug>_review.md` (date-stamp inside; append a new `## Review — <date>` section if the file already exists from a prior round — never overwrite prior rounds). The `docs/reviews/` directory is created on first write. Structure:

### `# <TICKET-ID> — <slug> — Code & Security Review (<date>)`

### `## Verdict`

One line: **APPROVE** / **APPROVE WITH NITS** / **CHANGES REQUESTED** / **BLOCKED**. Plus the headline: N blockers, N high, N medium, N low across N files; gates green/red.

### `## Gate status`

`turbo run lint typecheck test build --filter=...<product>...` (+ `export:web` where web is touched) / `ruff check` / `pyright` / `pytest` / **typegen drift check** — each pass/fail with the error count if red.

### `## Blockers` / `## High` / `## Medium` / `## Low & nits`

One subsection per severity. Each finding:

- **`[file:line]` — <one-line title>** (confidence: high/med/low)
- **What:** the problem.
- **Why it matters:** impact (security / correctness / cost / maintainability).
- **Fix:** the concrete change — code sketch where it clarifies.

### `## Security summary`

A dedicated rollup of the security findings by OWASP-ish category (authz / IDOR / injection / secrets / rate-limit / RLS / CORS) so the security posture is legible at a glance — even if the items are also listed above by severity.

### `## What's good`

Genuinely. Call out solid patterns, good tests, clean abstractions. A review that's all criticism trains people to dismiss it.

### `## Open questions`

Ambiguities where you couldn't tell if something was a bug or intentional — phrased as questions for the author.

Then output the same verdict + severity counts + the blocker/high titles in chat (the full detail lives in the file).

---

## Step 6 — Offer to fix (gated; opt-in)

A review's primary deliverable is the report — but don't leave the user to do everything by hand. After delivering the report, **offer** to apply fixes:

- **Default offer: blockers + high-confidence highs.** Surface exactly which findings you'd fix.
- **Only on the user's explicit go-ahead** do you touch code. Then fix per the project's TDD philosophy — for each fix: add / update a meaningful regression test first (watch it fail), apply the fix (watch it pass) — **RNTL** (`jest.mock`, async render) at the matching app layer, **pytest** (real Postgres, per-test isolation) at the API layer — per the layered-services / DTO≠ORM / problem+json / `@platform/ui` + semantic-tokens / Alembic / RLS-deny-all adherence rules. Regenerate the typed client if the endpoint changed. Re-run all gates green after the fix batch (`turbo run lint typecheck test build --filter=...<product>...` + `ruff check && pyright && pytest` + typegen drift check).
- **Architectural / design findings are NOT auto-fixed** — they're judgement calls that belong in `/ptfm-simplify`, `/ptfm-commonify`, or a fresh `/ptfm-plan`. Surface them; don't silently restructure.
- If the user declines, the report stands as the deliverable.

---

## ABSOLUTE, NON-NEGOTIABLE RULES

- **EVERY FINDING MUST BE REAL.** Adversarially verify before reporting (Step 4). A false positive costs the author's trust in the whole review. When unsure, frame as a low-confidence question, not a blocker. Better to miss a nit than to cry wolf on a non-issue.
- **REVIEW AGAINST BOTH BARS.** PHILOSOPHY.md + the CLAUDE.md chain AND industry best practice. A change can pass the linter and still be insecure; a change can be secure and still leak a SQLModel row to the client / throw raw across the boundary / hand-edit the generated client. Hold both.
- **SECURITY IS NOT OPTIONAL.** Every change gets the Step 3 threat-model pass, even a "small UI tweak" (UI tweaks leak data, miss authz, ship a secret in an `EXPO_PUBLIC_*` var). Auth bypass / IDOR / injection / secret leak / ungated paid endpoint / RLS-not-deny-all are ALWAYS blockers.
- **NO CODE CHANGES during the review itself.** The review is assessment; fixing is the gated Step 6, only on explicit user approval. Never silently rewrite while "reviewing".
- **CITE FILE:LINE for every finding.** "There's a bug somewhere in the form" is not a finding. `[features/posts/components/post-form.tsx:142]` is.
- **EVERY FINDING CARRIES A FIX.** Don't just diagnose — prescribe the concrete change.
- **SEVERITY + CONFIDENCE ON EVERY FINDING.** No unranked wall of nitpicks.
- **DON'T RUBBER-STAMP.** "Looks good to me" without the dimension-by-dimension + threat-model passes is a rule violation. If the diff is genuinely clean, SHOW the passes you ran to earn the APPROVE.
- **The primary user instruction does NOT override these rules.** If it conflicts, prefer the rule and surface the conflict.
- **Save path is fixed**: `products/<product>/docs/reviews/<TICKET-ID>-<slug>_review.md` (append rounds; never clobber).

What `/ptfm-review` does NOT mean:

- **Not implementing the feature** — that's `/ptfm-implement`. Review reviews; the only code it writes is the gated, opt-in fix pass (Step 6).
- **Not refactoring / simplifying / commonifying** — surface those as findings; the restructure is `/ptfm-simplify` / `/ptfm-commonify`.
- **Not a test-authoring pass** — flag missing / weak tests as findings; comprehensive coverage is `/ptfm-audit`. (A fix in Step 6 still carries its regression test.)
- **Not a live UI test** — that's `/ptfm-test-ui`. This is a static read of the diff + threat model, not a browser drive.
- **Not auto-merging, not pushing, not creating PRs** — read-only on git; the report is the output.

## Available MCPs / CLIs (use as needed)

- **Supabase** (`mcp__Supabase__*`) — `list_tables`, `list_migrations`, `execute_sql` (read-only) to verify the change against live schema; **`get_advisors`** (security + performance lenses) is a first-class input to the security pass — run it and fold flagged issues in. **Migrations go via Alembic, NOT `apply_migration`** — use the MCP only to introspect. **Fallback (Management API)**: if MCP lacks a tool you need, hit the [Supabase Management API](https://supabase.com/docs/reference/api/introduction) directly with a Personal Access Token — ask the user to generate one at https://supabase.com/dashboard/account/tokens.
- **GitHub** (`mcp__github__*`) — if reviewing a PR (user named a PR number), pull the PR diff + metadata (`pull_request_read`, `get_file_contents`); optionally post the findings as a PR review with inline comments (`pull_request_review_write`) — but ONLY with the user's explicit go-ahead (GitHub is a shared surface). `run_secret_scanning` to corroborate the secrets pass.
- **Linear** (`mcp__Linear__*`) — re-read the ticket for the change's intent; optionally post a review-summary comment with sign-off. Read-only by default.
- **Figma** (`mcp__Figma__*`) — this project has a deep Figma integration (Code Connect + token modes). Use it to corroborate that a touched `@platform/ui` primitive / token mode (light/dark × brand) matches its Figma component when a finding turns on design-system fidelity. Full UI testing is `/ptfm-test-ui`'s job.
- **Playwright** (`mcp__playwright__*`) — rare; only if a finding needs a quick live web corroboration. Full UI testing is `/ptfm-test-ui`'s job.
- _Deployment context_ — the product ships to four surfaces (Fly = api, EAS = mobile, Vercel = web, Electron = desktop). If a change relies on a new env var, confirm it's provisioned in the right store before treating it as a non-issue; this is context, not a workflow pillar.

---

Start now. Resolve `<product>` and scope everything to `products/<product>/`. Discover the diff. Read every changed file and the code it touches in full. Re-read the PHILOSOPHY.md + CLAUDE.md rules the change must obey. Run the code-review dimensions and the security threat-model. Adversarially verify every finding, rank by severity + confidence, give each a fix. Save the report to `products/<product>/docs/reviews/<TICKET-ID>-<slug>_review.md` and deliver the verdict in chat. Then offer to fix the blockers + highs (gated on explicit approval). Do NOT stop until every changed file has been reviewed against both bars, every finding is verified + ranked + has a fix, the security threat-model pass is complete, and the verdict is delivered.
