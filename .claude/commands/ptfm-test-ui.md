---
description: Drive a feature end-to-end through a real browser via Playwright MCP against the product's Expo web dev server, fix the failures and issues that surface (with RNTL/pytest regression tests, per PHILOSOPHY.md adherence rules), and report what shipped
argument-hint: "<product> <ticket-id> [slug] [user-instruction]"
---

Args: $ARGUMENTS

Expected shape: `<product> <TICKET-ID> [slug-or-title] [primary user instruction]`

- **`<product>`** — first token: the product directory under `products/` (e.g. `blog`). **Required.** If absent, infer it from the cwd when the session is inside `products/<name>/...`; otherwise STOP and ASK. Validate that `products/<product>/` exists; if it doesn't, STOP and ASK — do NOT guess. EVERYTHING this command does — the codebase walk, every glob, every save path, the target URL — is scoped to `products/<product>/`.
- **`<TICKET-ID>`** — second token (e.g. `ABC-145`). **Required.** If not passed, the resolve block below auto-infers from the current branch; if it can't, STOP and ask.
- **`[slug-or-title]`** — optional next token (kebab-case slug or quoted title). Overrides the auto-inferred slug. If absent, the resolve block globs `products/<product>/docs/plans/` and `products/<product>/docs/implementation/` to recover it.
- **`[primary user instruction]`** — anything after the slug (or after the ticket ID if no slug-shaped token follows). Freeform guidance for THIS specific invocation — adjust scope, focus, or emphasis as instructed. **It does NOT override the absolute rules below** — if it conflicts with a rule, prefer the rule and surface the conflict to the user.

---

We need to UI-test the entire `<FEATURE>` feature in `products/<product>` end-to-end via Playwright MCP — and fix the failures and issues that surface during testing. This is a test-and-fix run. Reporting "tests failed" without fixing them is the LAZY outcome this command exists to prevent. **The focus is USER JOURNEYS — every path through the feature, every possible outcome the user can hit, right or wrong, end-to-end.** Form-field validation, edge inputs, accessibility, and responsive checks are supporting coverage, not the primary mission. Read the plan + implementation docs, walk the feature code, think hard, understand the feature in complete and great depth — then enumerate every user journey + path + outcome, drive each one through a real browser (the product's Expo **web** dev server — react-native-web), fix what's broken (with regression tests + full PHILOSOPHY.md adherence), and report what shipped. (This command drives **web**; native E2E is Maestro and is out of scope here.)

**Resolve `<product>`, `<TICKET-ID>`, `<slug>`, and `<FEATURE>` BEFORE doing anything else.**

1. **`<product>`** — first token if provided; else infer from cwd (`products/<name>/...`); else STOP and ASK. Confirm `products/<product>/` exists.
2. **`<TICKET-ID>`** — if a ticket-shaped token was provided in `$ARGUMENTS` (after `<product>`), use it. Otherwise run `git branch --show-current` and extract the `<TEAM>-<NUMBER>` portion (e.g. `ABC-145` from `feature/ABC-145-d2c-bulk-edit`). If neither yields a ticket, STOP and ASK — do NOT guess.
3. **`<slug>`** — if a slug-shaped token was provided, use it. Otherwise `Glob products/<product>/docs/plans/<TICKET-ID>*_plan.md` and `products/<product>/docs/implementation/<TICKET-ID>*_implementation.md` to recover the canonical slug (the segment between `<TICKET-ID>-` and the `_plan.md` / `_implementation.md` suffix).
4. **`<FEATURE>`** — derive from the plan / implementation docs (they reference `products/<product>/app/features/<feature>/...` extensively), or by mapping the slug to a folder under `products/<product>/app/features/`. If no clear match, ASK.

---

## PRODUCTION SAFETY — read before doing anything else

The product's `pnpm bootstrap` runs a **local Supabase stack** (ephemeral, per-product, on offset ports), so by default you are testing against throwaway local data. **BUT** the Expo web dev server may be pointed at a **shared remote Supabase project** (a staging / preview env, via the product's `EXPO_PUBLIC_*` config + the API's `DATABASE_URL`). **If the app is talking to ANY shared remote / staging Supabase, treat every record already in that project as PRODUCTION DATA.** Check which env the dev server resolves before you touch anything; when in doubt, assume shared/production and apply the strict rules. Either way, the create-track-delete-verify discipline below is mandatory.

Two rules govern every keystroke from here:

- **CRITICAL: DO NOT TOUCH OR MODIFY ANY EXISTING DATA.** Read-only inspection (listing, viewing, scoping the test plan) is fine. Editing, deleting, publishing, archiving, status-transitioning, renaming, or otherwise mutating any record that pre-existed this run is **FORBIDDEN**. If a test case needs "edit an existing X" or "delete an existing X", you create a NEW X first and run the test against your own record. No exceptions for "it's just a small edit" or "I'll put it back".
- **ABSOLUTELY: DELETE EVERY RECORD YOU CREATE.** Track every record / draft / share link / upload / Supabase row created during the run in TodoWrite (with the ID, slug, and URL). Before delivering the final report, delete every tracked record via the feature's own delete flow (preferred) or via the appropriate cleanup path. If a record cannot be cleaned up via available UI/actions, surface it to the user with the ID and a one-line reason — never leave junk behind silently. Verify cleanup by navigating back and confirming each record is gone.

The final report MUST include a top-line cleanup confirmation: `cleanup: N records created, N deleted, 0 leaks` (or list the leaks explicitly).

---

Reference docs (read these first, in full):

- @PHILOSOPHY.md — the architecture/decision GOSPEL (locked decisions, conventions, invariants). When anything conflicts with it, it wins.
- @CLAUDE.md (repo root) — monorepo map + conventions (semantic-tokens-only, broadcast-only realtime, problem+json, never-edit-generated-client, promote-on-2nd-use).
- @products/<product>/CLAUDE.md — the product's structure, ports (incl. the Expo web dev-server port), infra names.
- the nested **API** `CLAUDE.md` under `products/<product>/api/` — the add-an-endpoint recipe (model→service→schema→router→openapi→typegen→hook→screen), used when a fix touches the backend.
- @packages/ui/CLAUDE.md + @packages/ui/FIGMA.md — design-system runbook + token contract (semantic tokens only, `@platform/ui` primitives, never modify a shared primitive).
- @products/<product>/docs/plans/<TICKET-ID>-<slug>\_plan.md
- @products/<product>/docs/implementation/<TICKET-ID>-<slug>\_implementation.md

(If a `CLAUDE.md` is absent because the monorepo is mid-build, fall back to `PHILOSOPHY.md`.)

---

## Step 1 — Build complete depth-of-understanding

Before generating any test cases, build a comprehensive mental model. Do NOT skim. Laziness here cascades into a lazy plan and a lazy run.

1. Read the plan + implementation docs in FULL — every section, every table.
2. Glob `products/<product>/app/features/<FEATURE>/**` and read every component, hook, store (Zustand), lib helper, type, and generated-client hook the feature consumes. Read the public surface (`products/<product>/app/features/<FEATURE>/index.ts`).
3. Identify every route the feature exposes via Expo Router (`products/<product>/app/app/...` — the thin one-liner route files that point into the feature), and every API endpoint it calls (the `schemas/`+`routers/`+`services/`+`models/` chain under `products/<product>/api/...`, plus the `products/<product>/api-client/` hooks).
4. Map every: form (react-hook-form / Zod where used), state machine, conditional render, error path, dialog/sheet/drawer, optimistic update, TanStack Query state transition (idle→loading→success/error), autosave, dynamic field array, cursor-paginated list (`useInfiniteQuery`), broadcast-driven realtime refetch, rate-limit gate, share/public surface.
5. Note: every problem+json error `type`/code the feature can surface (the user-facing message must come from the typed client, never a raw `error.message`), every slowapi rate limit it's gated by, every external integration it calls (Supabase Auth/Realtime/Storage, the broadcast invalidation channel, any product-specific upstream).

---

## Step 2 — Enumerate the EXHAUSTIVE test plan

**THE FOCUS IS USER JOURNEYS — every path through the feature, every possible thing that can go right, and every possible thing that can go wrong, end-to-end.** That's what this run is for. Everything else (form-field validation details, edge-input shapes, accessibility, responsive) is supporting coverage — useful, but NOT the point. Do not let the supporting categories distract from the primary mission.

Build a TodoWrite list — one entry per test case. The brief is EXHAUSTIVE on the primary axis (journeys + paths + outcomes). NO LAZY SKIPPING.

**The default is OVER-coverage on user journeys.** If you find yourself thinking "this path's obvious", "this outcome probably works", "I tested a similar journey before" — **STOP. Add the case anyway.** Those rationalisations are exactly the laziness this command exists to prevent. Do NOT be the agent that skips user journeys.

**Anti-laziness sanity check before you finish.** Ask yourself: "If a senior engineer mapped out every realistic user journey through this feature — happy, unhappy, abandoned, retried, shared, revoked, mid-stream-interrupted, owner vs non-owner, authed vs anonymous — would they find a single one of those journeys NOT in this plan?" If yes — go back, add it. Repeat until the answer is no.

### Primary coverage — user journeys, paths, and outcomes (THE POINT)

These are the cases that MUST be exhaustive. One TodoWrite entry per distinct journey:

- **Every happy-path journey, end-to-end.** Not just "the" golden path — every supported entry → outcome flow. (e.g. for a list/CRUD feature: create via the primary form → see it in the cursor-paginated list → edit → see the optimistic update reconcile; create from an alternate entry point → publish/share; resume an existing draft → finish; etc.)
- **Every alternate path and entry mode** — different routes into the same outcome, different starting tabs, different prerequisite states.
- **Every unhappy / negative path** — what happens when the user gives up halfway, navigates away mid-stream, hits cancel, hits retry, refreshes mid-flow, hits the slowapi rate limit (429 → the translated problem+json message), loses auth (401 / token expiry), the upstream service fails, the API rejects the payload (Pydantic-strict validation error → problem+json), a broadcast invalidation arrives mid-edit. Each one is a distinct journey with a distinct expected outcome.
- **Every share / cross-user journey** — owner publishes → anonymous viewer opens share link → revocation → 404; owner deletes → existing share link 404s; another user tries to access via direct URL → ownership rejection (the API verifies the JWT server-side, so a client-forged claim must NOT grant access).
- **Every state-transition journey** — draft → in-progress → completed → archived → restored (whichever transitions the feature supports), including the wrong-direction attempts that should be rejected.
- **Every error path the user can actually hit, from their perspective** — what they see, what message renders (must be the **translated problem+json user message from the typed client, not a raw `error.message`**), what they can do next.

### Supporting coverage — useful, not the point (nice-to-haves)

Cover these alongside the journeys above when they naturally fit, but DO NOT treat them as equal weight to user journeys. A test plan with 40 form-validation cases and 4 user journeys is the WRONG shape.

- Form-field validation rules (required-blank, max-length, wrong-type, etc.) — sample a few representative cases, not every field × every rule.
- Edge-input shapes (empty / whitespace / emojis / RTL / injection-shaped strings) — sample one or two per form.
- Accessibility — keyboard-only pass through the primary journeys (web; RN-web exposes the accessibility tree).
- Responsive — at least one mobile-portrait and one desktop-landscape pass per primary journey (via `browser_resize`). Note: full **cross-target** (iOS / Android / web / desktop) and **light/dark × brand** coverage is broader than this web pass — flag any surface that's obviously target- or theme-specific for follow-up, but this command verifies web.
- Concurrent / race conditions — rapid double-clicks, cancel-then-retry-fast, broadcast-arrives-mid-mutation, where the journey makes them plausible.

For each entry: a one-line description of the case + the expected outcome.

---

## Step 3 — Persist the test playbook before any browser action

**Once Step 2 is complete, SAVE the full enumerated test plan as Markdown to `products/<product>/docs/implementation/<TICKET-ID>-<slug>_testing_playbook.md`.** Then — and only then — proceed to execute. This separates the discovery / enumeration phase from the execution phase so each gets your full focus, and it leaves a persisted artifact future runs can read. (The `docs/implementation/` directory is created on first write if it doesn't exist.)

The playbook file MUST contain, at minimum:

- `# <TICKET-ID> — Testing playbook` heading.
- `## Context` — product + feature + slug + ticket title + the user instruction passed (if any) + target URL (the product's Expo web dev server) + which Supabase env the dev server is pointed at (local ephemeral vs shared/staging — i.e. whether PRODUCTION SAFETY's strict mode is in force).
- `## Primary coverage — user journeys, paths, and outcomes` — every primary-coverage case from Step 2 as a checklist (`- [ ]` per case), grouped by user-journey heading, each with: one-line description, expected outcome, prerequisite state (logged-in user / anonymous / seed data / etc.).
- `## Supporting coverage` — same checklist shape for the nice-to-have categories, called out as such.
- `## Skipped cases` — anything explicitly skipped, with one-line justification per skip.
- `## Side-effect surface` — quick scan: roughly how many records will be created, which external services get hit (Supabase Auth/Realtime/Storage, the broadcast channel, any product upstream), what cleanup will be needed.

If a playbook already exists at that path from a prior run, READ it first; carry forward `[x]` checkmarks for cases that were verified GREEN previously (and `<!-- skip: already verified -->` annotations) so this run can skip them with user awareness rather than re-doing every case. Surface the carry-forward list to the user before executing.

Write the playbook file. Then move to Step 4.

---

## Step 4 — Set up the runtime

Before driving anything:

1. Confirm the target is reachable: try `mcp__playwright__browser_navigate` to the product's **Expo web dev server** — typically `http://localhost:8081` (Expo/Metro web) or the product's offset web port (check `products/<product>/CLAUDE.md` / `app.config.ts` / the product's `.env.*`), or whatever URL the user instruction specifies. **NOT `:3000`.** If unreachable, STOP and ask the user — do not silently try alternative URLs or environments. (Starting the dev server is `products/<product>` `pnpm dev` / the product's `/dev` command; if it's not running, tell the user.)
2. Identify the feature's entry URL(s) and the auth state required for each test case (some need a logged-in Supabase user; the public share-link cases need an incognito / fresh-context anonymous session).
3. If a test case needs seed data (an existing record, a published share link), set that up first via the UI itself or surface to the user that you need them to seed.

---

## Step 5 — Execute every test case via Playwright MCP

**Thoroughness bar: every case in the plan MUST be actually driven through the browser before you finish.** No marking a case `passed` without executing it. No skipping for "this one's obvious" or "I know it works" — those were Step 2's call to handle (and Step 2 said add the case anyway). Once execution starts, the plan IS the contract.

For each case in the TodoWrite plan, mark it `in_progress`, then:

1. **Navigate** to the relevant URL via `browser_navigate`.
2. **Drive** the interaction with the appropriate MCP tool: `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`, `browser_press_key`, `browser_file_upload`, `browser_drag`, `browser_hover`, `browser_handle_dialog`, `browser_resize` (for responsive cases), `browser_navigate_back`, `browser_tabs` (for multi-tab / cross-user cases).
3. **Track every record you create.** The moment you create a record, draft, share link, upload, or any Supabase-persisted artifact, add a TodoWrite entry under a "Cleanup" section with: type, ID/slug, URL, and how to delete it. This list is the source of truth for Step 6.
4. **After each meaningful step**, capture state:
   - `browser_snapshot` — the accessibility tree (preferred for assertions; cheaper than screenshots).
   - `browser_take_screenshot` — visual proof. Save into `playwright-mcp/` per CLAUDE.md. Take screenshots for: every test case's terminal state, every failure, every visual regression candidate.
   - `browser_console_messages` — capture any console errors or warnings; surface them even on otherwise-passing cases.
   - `browser_network_requests` — capture failed requests, unexpected calls, requests with the wrong shape (and confirm error responses are problem+json, not raw strings).
5. **Assert** the expected outcome: visible content, toast text (the translated problem+json user message, not a raw error), route change, element state, network call shape, and — where you can corroborate it read-only — the Supabase row content via the Supabase MCP.
6. **On failure: re-run once to rule out flake, then FIX.** Reporting the failure without fixing it is forbidden for in-scope bugs.
   a. **Rule out flake** — re-run the case once (timing / mid-stream reconnect / a late broadcast can lie). Flake = note both runs in the report and move on; real bug (both fail) = proceed to fix.
   b. **Diagnose** — read the relevant code, identify the root cause.
   c. **Triage scope.** Surface-level bugs (component logic, form validation, error display, state-machine wiring, copy, toast/error wiring, router/screen logic, TanStack Query hook usage, layout, responsive behaviour, a thin service-method or schema fix) → proceed with the fix in this run. Architectural / migration-requiring bugs (Alembic schema change, new env var, new endpoint, deep refactor, new external integration, a change to a shared `@platform/ui` primitive or `packages/core` helper) → STOP and surface to the user with a "should I proceed deeper?" — do NOT silently attempt deep changes during a test pass.
   d. **Write a regression test FIRST** per PHILOSOPHY.md's TDD philosophy — at the layer matching the bug: **RNTL** (`jest.mock`, async `render`/`fireEvent`/`renderHook` — RNTL ≥14) for app component / hook / store / screen bugs, mocking at the **generated-client boundary** (never `fetch`); **pytest** (service-class unit, or router-over-real-Postgres integration) for backend bugs. **Never vitest, never `vi.mock`.** Run it. Confirm it's RED against today's broken code.
   e. **Fix the code** per PHILOSOPHY.md's adherence rules:
   - **Frontend** STRICTLY conforms to: `@platform/ui` owned primitives (compose them; NEVER modify a shared primitive for one fix — add a `cva` variant / opt-in prop, or compose on top); **semantic tokens ONLY** (`bg-background`, `text-foreground`, `border-border`, … — **NEVER raw hex**; a brand is a token mode); the **generated typed client is never hand-edited** (change the endpoint → run typegen → regenerate); user-facing errors come from the typed problem+json, not raw strings. **Cross-target coverage applies** — every UI surface needs explicit iOS / Android / web / desktop + light/dark + brand decisions; "works on web only" or "light mode only" is INCOMPLETE (flag what you couldn't verify in this web pass).
   - **Backend** STRICTLY conforms to: layered OOP (`schemas/`→`routers/`→`services/`→`models/`, **DTO ≠ ORM** — never serialize a SQLModel row); **RFC 9457 problem+json** typed errors (no raw throws across the boundary); schema changes ONLY via **Alembic** (and that's a STOP-and-surface deep change per (c)); `DELETE`/`UPDATE` via `session.execute(delete(...))`, never `session.exec(...)`; **slowapi** gates; **RLS deny-all** stays; **broadcast-only** realtime (no Postgres-Changes subscriptions).
     f. **Watch the regression test go RED → GREEN.** If it doesn't, the fix is wrong; iterate.
     g. **Run all four gates** — for JS: `turbo run lint typecheck test build --filter=...<product>...` (+ `export:web` where the change touches web); for the API: `ruff check && pyright && pytest`; plus the **typegen drift check** (`git diff --exit-code` on the regenerated client) if the change touched the API contract — confirm no regression elsewhere. If any go red, fix before moving on.
     h. **Re-drive the failing test case** through the browser. Confirm the user-facing behaviour is correct end-to-end.
     i. **Update the implementation log** (`products/<product>/docs/implementation/<TICKET-ID>-<slug>_implementation.md`) with the fix — same structure as `/ptfm-implement` uses (under `## What got built` and/or `## Deviations from the plan`). Mirror notable deviations into the plan's `## Post-ship deltas`.
     j. **Track the fix for the final report**: failing case, root cause, files touched, regression test path, regression test assertion, four-gates status.
7. Mark the TodoWrite case `completed`. Note one of: `PASS`, `FAIL-then-fixed`, `FLAKE`, `FAIL-deferred-to-user` (with reason).
8. **Update the playbook file in lockstep** — open `products/<product>/docs/implementation/<TICKET-ID>-<slug>_testing_playbook.md` and update the checkbox for this case so the persisted playbook always reflects ground truth, never lags behind the TodoWrite state:
   - `PASS` → `- [x]` plus a trailing ` <!-- pass: YYYY-MM-DD -->` annotation.
   - `FAIL-then-fixed` → `- [x]` plus ` <!-- fail-then-fixed: <one-line root cause>; regression test: <path>; files: <list> -->`.
   - `FLAKE` → leave `- [ ]` plus ` <!-- flake: passed run 1, failed run 2 (or vice versa); investigate -->`.
   - `FAIL-deferred-to-user` → `- [!]` plus ` <!-- deferred: <one-line scope reason>; proposed approach: <…> -->`.
   - `skipped — already verified` (from a carry-forward) → leave `- [x]` plus ` <!-- skip: carried forward from prior run -->`.
9. Use `browser_wait_for` between async steps; never sleep blindly.

Between unrelated test cases, navigate to a clean state (or use `browser_close` + new context) so prior state doesn't bleed across. **Never** edit or delete a pre-existing record to "reset" — only your own created records may be touched.

---

## Step 6 — Cleanup (mandatory; not optional)

Before generating the final report:

1. Walk the "Cleanup" TodoWrite list from Step 5 in reverse order of creation.
2. For each tracked record, delete it via the feature's own delete flow (preferred — exercises the delete UI as bonus coverage) or via the appropriate cleanup path.
3. After deletion, navigate back and visually confirm the record is gone (`browser_snapshot` of the list view, or a 404 on the direct URL); corroborate read-only via the Supabase MCP where useful.
4. Mark each cleanup todo `completed` with the deletion confirmed.
5. If anything cannot be deleted via available UI/actions, **surface it to the user immediately** with the ID, the URL, and a one-line reason. Do NOT proceed silently. Do NOT leave junk behind.

The cleanup pass is non-skippable. A test run with leaked records is not a complete run. (Even against the local ephemeral Supabase stack: clean up — the discipline is the point, and the same code will be pointed at shared/staging.)

---

## Step 7 — Finalize the playbook + emit the final report

**Before the chat report, FINALIZE the playbook file** at `products/<product>/docs/implementation/<TICKET-ID>-<slug>_testing_playbook.md`:

1. Confirm every executed case has its checkbox updated (per Step 5 sub-step 8). Walk the file and verify no `- [ ]` is left next to a case that was actually executed — those are bugs in the run, not legitimate `[ ]`s.
2. Add (or update) a `## Run summary` section at the END of the playbook with the same totals you'll put in the chat report: pass / fail-then-fixed / flake / deferred / skipped counts, four-gates exit status, cleanup confirmation, list of fixes shipped (with regression test paths), list of issues deferred to the user. Date-stamp the entry — there may be multiple `## Run summary` entries from prior runs; append, don't overwrite.
3. Save the file. Future `/ptfm-test-ui` runs against this same ticket will read it and carry forward the `[x]`s — make sure what's written is accurate.

Then output the same structured summary in chat:

- **Cleanup line (top-line, mandatory)**: `cleanup: N records created, N deleted, 0 leaks` — or list every leak explicitly with ID + reason.
- **Four-gates status (mandatory)**: exit status of `turbo run lint typecheck test build --filter=...<product>...` (JS) and — for API changes — `ruff check`, `pyright`, `pytest`, plus the typegen drift check, after the last fix. All green = run complete.
- **Totals**: cases planned, executed, `PASS` count, `FAIL-then-fixed` count, `FLAKE` count, `FAIL-deferred-to-user` count.
- **Fixes shipped (per bug)**: the failing test case, root cause in one sentence, summary of the fix, files touched, regression test (path + what it asserts — RNTL or pytest), confirmation that the test went RED → GREEN and the gates are green.
- **Issues deferred to user** (architectural / Alembic-migration / schema / new-env-var / new-endpoint / new-integration / shared-primitive-or-`packages/core` scope): the bug, the proposed approach, why it's out of scope for a test pass — for the user to confirm before the next session.
- **Console noise** — any errors / warnings observed even on passing cases. These are bugs even if the test technically passed; either fix them in this run or list them as deferred.
- **Network anomalies** — failed requests, unexpected calls, calls with wrong shapes, error responses that weren't problem+json.
- **Open questions** — ambiguous behaviour where you couldn't tell if it was correct.
- **Coverage gaps** — anything in the plan you couldn't run (e.g. needed seed data the user has to provide; cross-target / theme coverage beyond the web pass), explicitly listed.

---

ABSOLUTE, NON-NEGOTIABLE RULES:

- **EXHAUSTIVE ON USER JOURNEYS.** Every user journey, every path, every possible outcome (right and wrong) gets a test case in the plan and gets actually driven in execution. **NEVER silently skip a journey because it "feels obvious" or "probably works"** — that's exactly the laziness this command exists to prevent. Supporting categories (form-field validation, edge inputs, a11y, responsive) are nice-to-haves alongside the journeys, NOT the primary coverage target.
- **DO NOT TOUCH OR MODIFY ANY EXISTING DATA.** Every record that pre-existed this run is production data when the dev server points at a shared/staging Supabase. Read-only is fine; mutations are FORBIDDEN. Re-read the PRODUCTION SAFETY block at the top.
- **DELETE EVERY RECORD YOU CREATE.** Cleanup (Step 6) is mandatory and non-skippable. A run with leaked records is incomplete.
- **Thorough execution.** Every case in the plan must be actually driven through the browser. No marking `passed` without executing. Re-run failures once to detect flakes.
- **FIX bugs that tests reveal.** This is a test-AND-fix run. Surface-level bugs (component logic, validation, error display, state-machine wiring, copy, toast/error wiring, router/screen logic, TanStack Query hook usage, layout, responsive behaviour, a thin service/schema fix) get fixed in this session per PHILOSOPHY.md's adherence rules. **Reporting failures without fixing is FORBIDDEN** unless the fix genuinely requires architectural / Alembic-migration / schema / new-endpoint / shared-primitive work — in which case STOP and surface to the user with a "should I proceed deeper?" rather than silently bypassing.
- **Regression test for every fix.** Per PHILOSOPHY.md TDD philosophy — write the regression test (RNTL with `jest.mock` for app bugs, pytest for API bugs), watch it RED, fix the bug, watch it GREEN. Modifying unrelated test assertions is forbidden; ADDING new regression tests in service of a fix is MANDATORY.
- **All four gates green after fixes.** `turbo run lint typecheck test build --filter=...<product>...` (JS) AND — for API changes — `ruff check && pyright && pytest`, plus the typegen drift check — all green when fixes ship. Re-run the gates after every meaningful fix batch. Zero `.only`, zero `.skip`, zero new ignores.
- **Update the implementation log** (`products/<product>/docs/implementation/<TICKET-ID>-<slug>_implementation.md`) with any fix shipped — same structure as `/ptfm-implement`. Mirror notable deviations into the plan's `## Post-ship deltas`.
- **Keep the playbook in lockstep with the run.** Tick `- [x]` (or `- [!]` for deferred) on the playbook file as each case completes — never just in TodoWrite. A playbook with stale `- [ ]`s next to executed cases is incomplete; finalize it in Step 7 before the chat report.
- **No deep refactors / Alembic schema changes / new endpoints / new integrations / changes to shared `@platform/ui` primitives or `packages/core` / commonification during this pass.** Those are STOP-and-surface-to-user moments, not silently attempt.
- **Adherence is non-negotiable on every fix** — `@platform/ui` primitives + semantic tokens (never hex) + cross-target decisions on the frontend; layered services + DTO≠ORM + problem+json + Alembic-for-schema on the backend; never hand-edit the generated client.
- **Screenshots only into `playwright-mcp/`** per CLAUDE.md. Never commit them.
- **Stop on app unreachable.** Ask the user; do not silently try alternative URLs or environments. The target is the product's Expo web dev server (e.g. `http://localhost:8081`), NOT `:3000`.
- **No real paid external services without confirmation.** If the feature fans out to a real paid external service (or any costly / side-effecting third-party endpoint), ask the user before bulk-running cases that fan out. Default to one full run + targeted edge cases, not 50 happy-path repeats.

What `/ptfm-test-ui` does NOT mean here:

- Not writing persistent Playwright spec files (`*.spec.ts`) or Storybook visual-regression baselines — those (persistent web E2E + the VR pipeline) are `/ptfm-audit`'s / the VR-pipeline's deliverable. (RNTL unit/component/hook + pytest regression tests added in service of a fix ARE part of this command.)
- Not attempting deep architectural refactors, Alembic schema changes, new env vars, new endpoints, or new external integrations during the test pass — STOP and surface those to the user.
- Not commonifying constructs / promoting to `packages/*` (that's `/ptfm-commonify`'s job).
- Not load testing, not performance benchmarking — pure functional UI verification + bug fixing.
- Not native E2E (Maestro) — this command drives **web** (react-native-web) only.

## Available MCPs / CLIs (use as needed)

- **Playwright** (`mcp__playwright__*`) — **primary tool for this command.** Every test case in the plan gets driven through `browser_navigate`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_snapshot`, `browser_take_screenshot`, `browser_console_messages`, `browser_network_requests`, etc., against the product's Expo web dev server.
- **Supabase** (`mcp__Supabase__*`) — **read-only** inspection of records to verify state after a UI action (`list_tables`, `list_migrations`, `execute_sql` for read-only schema/row checks) — e.g. confirm a `browser_click` actually persisted the row. NEVER mutate data outside the feature's own delete flow during cleanup; migrations go via **Alembic**, never `apply_migration` — use the MCP only to introspect.
- **Linear** (`mcp__Linear__*`) — re-read the ticket for context on what's in / out of scope.
- **Figma** (`mcp__Figma__*`) — corroborate a UI surface against its Figma component / token mode (light/dark × brand) when a fix touches the design surface; never hand-name a colour.
- **Notion** (`mcp__Notion__*`) — fetch any design / QA / journey docs the plan or ticket references.

(Deployment context spans the product's four surfaces — Fly = api, EAS = mobile, Vercel = web, Electron = desktop — but this command is a local web-driver: it tests the running Expo web dev server, not a deployment.)

---

Start now. Resolve `<product>` first, then read the docs and code in full, then ENUMERATE EXHAUSTIVELY in TodoWrite (Step 2 — no lazy skipping), then PERSIST the playbook to `products/<product>/docs/implementation/<TICKET-ID>-<slug>_testing_playbook.md` (Step 3), then drive every case through the browser against the product's Expo web dev server **and tick the playbook in lockstep** as each case lands, **FIX every failure that surfaces** (regression test first — RNTL/pytest — then fix per the adherence rules, then re-verify, then all gates green), then clean up, then finalize the playbook + emit the final report. Do not stop until the playbook is saved AND updated to ground truth, every case is executed, every in-scope fix has shipped, and every deferred issue is explicitly surfaced.
