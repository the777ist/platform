---
description: Architect a feature end-to-end from a Linear ticket — CTO-level phased delivery architecture with vertical slices, strict adherence to PHILOSOPHY.md and the existing cross-platform Expo + FastAPI patterns. Saves to the product's architecture/ docs tree, creates one Linear sub-issue per phase, hands off to /ptfm-plan for per-phase detail.
argument-hint: "<product> <ticket-id> [slug] [user-instruction]"
---

Args: $ARGUMENTS

Expected shape: `<product> <TICKET-ID> [slug-or-title] [primary user instruction]`

- **`<product>`** — first token. The product directory under `products/` (e.g. `blog`). **Required.** If not passed, infer it from the cwd when the session is inside `products/<name>/...`; otherwise STOP and ASK. Validate that `products/<product>/` exists; if it does not, STOP and ASK. EVERYTHING this command does — the codebase walk, the globs, the save paths — is scoped to `products/<product>/`.
- **`<TICKET-ID>`** — second token (e.g. `ABC-145`). **Required.** If not passed, the resolve block below auto-infers from the current branch; if it can't, STOP and ask.
- **`[slug-or-title]`** — optional third token (kebab-case slug or quoted title). Overrides the auto-inferred slug. If absent, the resolve block derives the slug from the Linear ticket title (the common case for `/ptfm-architect`, which runs upstream of plan / implementation), or globs `products/<product>/docs/architecture/<TICKET-ID>*_architecture.md` for a mid-cycle re-architecture.
- **`[primary user instruction]`** — anything after the slug (or after the ticket ID if no slug-shaped token follows). Freeform guidance for THIS specific invocation — adjust scope, focus, or emphasis as instructed. **It does NOT override the absolute rules below** — if it conflicts with a rule, prefer the rule and surface the conflict to the user.

---

We need to architect the full feature for Linear ticket `<TICKET-ID>` (scoped to product `<product>`) as the **CTO / staff engineer** would, BEFORE any file-by-file plan exists. Fetch the ticket from Linear, walk the existing codebase in great depth, think hard, go step by step, create as many to-dos as needed, and produce an **EXTREMELY DETAILED** architecture: the phased delivery shape, the vertical slices, which existing patterns each new piece MUST conform to, where the seams between phases land, what each phase ships to users. **Strict adherence to existing primitives, conventions, and the design system is the price of admission — invention is rejected unless explicitly justified against PHILOSOPHY.md.** Optimize for fast time-to-market: ship the thinnest end-to-end vertical slice first, then layer. Save the architecture as a markdown that another agent (`/ptfm-plan`) can decompose into a per-phase file-by-file plan — AND create a Linear sub-issue under the parent ticket for each phase (one sub-issue per phase, each self-contained with scope / IN / OUT / architecture & flow / surfaces / pattern adherence / seam / success criterion / test categories / risks) so the team has trackable per-phase work-items and the downstream `/ptfm-plan` runs against a real Linear ticket. The Linear tickets are the working surface for the team (engineers, PMs, designers) and must stand on their own — they don't reference repo-internal docs.

**Resolve `<product>`, `<TICKET-ID>`, and `<slug>` BEFORE doing anything else.**

1. **`<product>`** — if a first token was provided in `$ARGUMENTS`, use it. Otherwise, if the session is running inside `products/<name>/...`, infer `<name>`. If neither yields a product, STOP and ASK. Validate `products/<product>/` exists on disk; if not, STOP and ASK — do NOT scaffold a product here.
2. **`<TICKET-ID>`** — if a ticket-shaped token was provided in `$ARGUMENTS`, use it. Otherwise run `git branch --show-current` and extract the `<TEAM>-<NUMBER>` portion (e.g. `ABC-145` from `feature/ABC-145-comment-threads`). If neither yields a ticket, STOP and ASK — do NOT guess.
3. **`<slug>`** — if a slug-shaped token was provided, use it. Otherwise derive the slug from the Linear ticket title (kebab-case, ~5–8 words, drop filler words) — this is the common case for `/ptfm-architect` since it runs upstream of plan / implementation. The only fallback glob is `products/<product>/docs/architecture/<TICKET-ID>*_architecture.md` for a mid-cycle re-architecture against an existing architecture doc. Do NOT glob `docs/plans/` or `docs/implementation/` — those artifacts don't exist yet at architect time.

Reference docs (read these first, in full, in this order):

- @PHILOSOPHY.md — the architecture/decision GOSPEL: locked decisions, conventions, invariants, layered-OOP backend, design-system token contract, realtime + RLS model, testing strategy, quality gates, Definition-of-Done.
- @CLAUDE.md (repo root) — monorepo map + cross-package conventions.
- @products/<product>/CLAUDE.md — the product's structure, ports, infra names.
- the nested **API** `CLAUDE.md` under `products/<product>/api/` — the add-an-endpoint recipe.
- @packages/ui/CLAUDE.md + @packages/ui/FIGMA.md — design-system runbook + token contract.

(These nested `CLAUDE.md` files are produced when the monorepo / product is generated. If one is absent, fall back to `PHILOSOPHY.md` — it is authoritative. No plan / implementation docs to reference — `/ptfm-architect` is upstream of `/ptfm-plan`; those artifacts get produced downstream from this architecture.)

---

## Step 1 — Fetch the Linear ticket, parent epic, and linked docs

Use the Linear MCP (`mcp__plugin_linear_linear__get_issue` or `mcp__claude_ai_Linear__get_issue`) to fetch the ticket AND its parent epic / project (architecture lives at a level above a single ticket — knowing the larger arc matters). Capture:

- Title, description (full body, acceptance criteria)
- Comments (decisions, constraints, deadlines the team added)
- Linked issues, blockers, sub-issues, parent epic
- Attached / referenced docs (Notion vision docs, Figma frames, Slack threads, GitHub PRs)
- Status, project, team, cycle

Follow load-bearing external links — Notion docs via Notion MCP, Figma frames if URL provided, Slack threads if shared. The architect reads ALL the context before architecting; do not skim.

**CRITICAL — Notion links usually contain the PRODUCT BRIEF.** At this organization, the Linear ticket is the work-item; the actual product spec (user research, target user, problem statement, jobs-to-be-done, success metrics, scope, anti-goals, design references, go-to-market context, prior decisions) typically lives in a linked Notion doc. **If the ticket description, comments, or any linked sub-issue references a Notion URL, READ THAT NOTION DOC IN FULL via the Notion MCP** (`mcp__plugin_Notion_notion__notion-fetch` or the closest equivalent) before doing anything else. Notion docs are themselves often a network — follow links from the primary brief to child / sibling docs that look load-bearing (architecture notes, prior-art docs, decision records). Treat the Notion-brief content with the same weight as the Linear description — sometimes more, since the ticket is often a short pointer and the brief carries the real spec.

If you cannot find a Notion link on the ticket but the ticket reads like it's referencing one (e.g. "as per the brief", "see the doc", "per the spec"), STOP and ASK the user for the Notion URL before proceeding — do NOT architect against a missing brief.

**Also quickly check for an upstream product brief at `products/<product>/docs/product/<TICKET-ID>*_product.md` or `products/<product>/docs/product/*_product.md`** (the user may name it explicitly in the primary user instruction, e.g. `"product brief ABC-160"` or a direct path). If one exists — written by `/ptfm-product` — READ IT IN FULL. The product brief defines WHAT and WHY and FOR WHOM; it is binding context for this architecture's scope IN / scope OUT / success metrics / target user. The architect still decides HOW (system layers, phasing, patterns), but cannot silently re-scope the product. If the architecture would have to deviate from the brief's scope to be technically sensible, STOP and surface to the user — the brief amendment happens via `/ptfm-product`, not silently here. **If no product brief exists, that's the common case for smaller features — proceed with architecture directly. Do NOT force a `/ptfm-product` pass where one isn't warranted.**

If the ticket is sparse and strategic direction is ambiguous EVEN after reading the Notion brief / product brief, ASK the user for missing context before proceeding rather than inventing requirements.

---

## Step 2 — Build complete depth-of-understanding of the AS-IS architecture

You cannot recommend strict adherence without knowing what's already there. Walk the existing codebase (scoped to `products/<product>/`, plus the shared `packages/*`) to map every pattern this ticket will brush against. **Do NOT skim.** A shallow AS-IS map produces a shallow architecture.

For every surface the ticket will touch:

- **Adjacent features** — what's in `products/<product>/app/features/*` that does anything similar? Read those features' public surface (`index.ts`), screen composition, the generated hooks they consume, their schemas and local Zustand stores. Route files under `app/` stay thin one-liners that mount a feature; their patterns are your defaults.
- **UI primitives + design system** — which `@platform/ui` (`packages/ui/src/components/ui/*`) owned primitives are in play (shadcn model — copied-in source we OWN; compose them, never modify a shared primitive for one feature — add a `cva` variant or opt-in prop)? Which `cva` variants already exist? Which **semantic tokens** does the surface need (`bg-background`, `bg-primary`, `text-foreground`, `border-border`, `bg-card`, …)? **NativeWind v4 (Tailwind v3) semantic tokens ONLY — never raw hex; token values come from the Figma pipeline (`theme.ts` / `global.css`).** Map the surface's required coverage across all **four targets (iOS, Android, web via react-native-web, desktop via Electron)** plus **light/dark** plus **brand modes** plus responsive on web/tablet. Use the Figma MCP (Code Connect + variable defs) when a design frame is referenced.
- **API / layered-service conventions** — the FastAPI strict-layered OOP stack: `schemas/` (Pydantic v2 DTOs = the contract) → `routers/` (thin; depend on a service via `Depends`) → `services/` (one class per aggregate; holds the session; owns business logic AND data access; **NO repository layer**) → `models/` (SQLModel tables; persistence only). Read the existing services' method signatures, the **RFC 9457 problem+json** error mapping, **cursor pagination** helpers (`{ items, next_cursor }`, opaque base64-on-id), ownership/auth checks (JWT `sub`), and the **slowapi** rate-limit keys already in use. **DTOs are ALWAYS separate from ORM models** — confirm nothing serializes a SQLModel row to the client.
- **Contracts / typegen** — how the existing `products/<product>/api-client/` is generated from the API's OpenAPI via `@hey-api/openapi-ts` (+ TanStack Query hooks). The generated client is **committed and NEVER hand-edited**. Note the canonical add-an-endpoint sequence the new work will follow: **model → service → schema → router → openapi → typegen → hook → screen**.
- **Database** — Supabase Postgres surface via SQLModel + Alembic: existing tables, columns, indexes, **RLS deny-all** policies (the API's privileged role bypasses; PostgREST/Realtime stay locked), **UUIDv7 PKs**, Alembic migration history. Use `mcp__supabase__list_tables` / `list_migrations` / `execute_sql` for **read-only** schema introspection. (Schema changes ship ONLY via Alembic, never the MCP's `apply_migration`.)
- **Realtime** — the **broadcast-only** pattern: after mutations FastAPI broadcasts invalidation events on per-product channels (service-role HTTP call); clients refetch through the API via the `packages/core` subscribe-and-invalidate helper (→ TanStack `invalidateQueries`). No Postgres-Changes subscriptions, no RLS holes. Note which channels / event names the adjacent features already broadcast.
- **Error handling** — the problem+json contract end-to-end: which problem `type`s / error codes the services raise, how they're typed into the generated client, and how the app surfaces them (the template's global **error boundary + offline/error UX**; user-facing copy comes from the typed problem+json, never raw error strings).
- **Rate limiting** — slowapi config (per-IP + per-user, keyed on the verified JWT `sub`, falling back to IP) and which endpoints already carry limits.
- **Env vars** — frontend `EXPO_PUBLIC_*` committed per-env files (`.env.development/.staging/.production` under `app/`) and the API's pydantic-settings schema. Secrets live in native stores (Fly / EAS / Vercel / GH Actions), never in the repo.
- **Routes** — the Expo Router file-based routes under `products/<product>/app/`, the thin-route convention, and auth wiring (Supabase Auth; the API verifies JWTs via JWKS / `PyJWKClient`; `supabase-js` on the client ONLY for auth/Realtime/Storage).

Build a written or mental map of every pre-existing pattern the new work will compose with. The architecture you produce in Step 4 must point at THIS map, not at invention.

---

## Step 3 — Identify the architectural surface area

Name the new modules / boundaries / contracts the ticket introduces. For each, map it to ONE of:

- **(a) An existing pattern it must conform to** — name the pattern explicitly (e.g. "new endpoint follows the layered `schemas → routers → services → models` recipe per the API `CLAUDE.md`, returning a problem+json on error", "new screen composes `<Form>` + `<Input>` + `<Button>` from `@platform/ui` with semantic tokens", "new list screen consumes the generated `useInfiniteQuery` cursor hook", "new mutation broadcasts an invalidation event via the `packages/core` helper").
- **(b) A justified deviation from an existing pattern** — rare; requires explicit rationale that references PHILOSOPHY.md and explains why the existing pattern genuinely doesn't fit. If you can't articulate the rationale in one paragraph, the deviation is unjustified — go back to (a).

**Invention without justification is rejected.** A new error shape outside problem+json, a new schema-validation library, a hand-edited generated client, a new design token, a Postgres-Changes subscription that opens an RLS hole — all forbidden unless the deviation is named and justified.

Output of this step: a list of architectural-surface-area items, each tagged `[conforms-to: X]` or `[deviates-from: X — reason]`.

---

## Step 4 — Define the phased delivery shape (vertical slices, ordered for fast TTM)

This is the architect's most consequential decision. Decompose the work into phases such that:

- **Every phase is an end-to-end vertical slice** — backend + frontend + tests + docs, independently demoable, independently shippable, independently reversible. **Horizontal phases ("Phase 1: all backend; Phase 2: all frontend") are FORBIDDEN** — they delay TTM and hide integration risk. A phase spans the full `model → service → schema → router → openapi → typegen → hook → screen` recipe.
- **Phase 1 is the thinnest viable slice** — smallest backend + smallest UI + the unhappy paths it MUST handle to be safe. Embarrassingly thin is a feature, not a bug. Ask "what's the smallest thing a real user could actually use?" — that's Phase 1.
- **Subsequent phases layer breadth, polish, edge cases, scale** — each phase makes the prior phase better; never replaces it.
- **Every phase ships USER value** — Phase N exists because users get something new they can use; it's not internal plumbing that "unlocks Phase N+1".
- **Phases are dependency-ordered** — Phase N depends on Phase N-1 but not Phase N+1. A phase that strands its predecessor is a rule violation.
- **At least 2 phases** — a single-phase "ship it all at once" architecture is forbidden and must be re-decomposed.

For EACH phase, specify:

- **Scope** — one-paragraph user-visible description.
- **What's IN** — explicit list of capabilities / surfaces / flows this phase delivers.
- **What's explicitly OUT** — capabilities deferred to a later phase (forecloses scope creep during `/ptfm-plan` and `/ptfm-implement`).
- **The seam to the next phase** — the architectural interface that lets the next phase extend without rewriting this one (e.g. "Phase 2 adds threaded replies; Phase 1's flat `comment.body` + `comment.post_id` schema gains a nullable `parent_id` column and the service's `list_comments` cursor query gains a tree assembly — the DTO and the generated hook stay backward-compatible").
- **Success criterion** — what does "this phase is done and shippable" look like? (e.g. "10 internal users can run the happy path end-to-end on iOS + web without escalation; the broadcast invalidation refetches the list on a second device").

---

## Step 5 — Define the test architecture at the phase level

Defer per-test enumeration to `/ptfm-plan`; here, name the CATEGORIES the per-phase plans must cover. Per PHILOSOPHY.md's TDD-first philosophy and testing strategy, the architecture pre-commits to what gets tested at each phase:

- Which surfaces get **JS unit / component** coverage via the **single Jest runner (jest-expo preset) + RNTL** (`*.test.ts(x)`, colocated) — pure helpers, Zustand stores, schemas, and component interactions. (RNTL v14 — `render`/`fireEvent`/`renderHook` are async; never vitest, never `@testing-library/jest-native`.)
- Which surfaces get **API unit** coverage (pytest) — service methods, schema validation (Pydantic strict), pagination helpers, problem+json mapping; polyfactory factories for fixtures.
- Which seams get **integration** coverage — API **router → service → DB** round-trips (pytest + httpx `ASGITransport`, against **real Postgres**, per-test savepoint isolation); the **broadcast-and-invalidate** seam; cursor-pagination round-trips.
- Which UI surfaces get **RNTL** coverage — every form (validation + happy submit), every error display (the problem+json-translated message renders, not a raw string), every non-trivial component interaction, and the TanStack Query state transition (idle → loading → success/error).
- Which **edge-case classes** the phase locks in (boundary inputs, character-set inputs, concurrency races, auth/ownership boundaries, rate-limit hits, network/offline failures, external-service failures, state persistence, **cross-target coverage** iOS/Android/web/desktop + light/dark + brand + responsive) — name the classes; the `/ptfm-plan` invocation for that phase enumerates the cases.
- Which **cross-target / visual-regression** surfaces each phase adds (Storybook stories × {light,dark} × brand for new `@platform/ui` variants; Playwright web screenshots, nightly).

(There is **no AI eval category** — this template has no locked AI layer. If a product happens to use AI, that's product-specific, not a template-locked pattern, and it gets tested as ordinary service logic.)

---

## Step 6 — Create Linear sub-issues for each phase

Before saving the architecture doc, create one Linear sub-issue per phase under the parent ticket so the team has trackable per-phase work-items and the downstream `/ptfm-plan` invocation has a real ticket to plan against.

Use the Linear MCP (`mcp__plugin_linear_linear__save_issue` or `mcp__claude_ai_Linear__save_issue`) to create the sub-issues. For EACH phase:

1. **Title** — `<PARENT-TITLE> — Phase N: <phase-title>` (e.g. `Comment threads — Phase 1: flat comments happy path`).
2. **Parent** — set `parentId` to the parent ticket `<TICKET-ID>`. (Sub-issues, not siblings.)
3. **Team / project / cycle** — inherit from the parent ticket. Do NOT change the project or team unless the user instruction explicitly says so.
4. **Labels** — inherit from the parent ticket; add a `phase:N` label if your team uses it.
5. **Description** — write a **complete, comprehensive, but well-structured, self-contained** Markdown body. The engineer (and PM / designer / anyone else on the team in Linear) should be able to read this ticket and actually understand the phase end-to-end — what it ships, how it's built, where the seams are, what "done" looks like — without having to ping anyone, bounce around 5 other documents, or have repo access to figure it out. **Succinct ≠ shallow.** Use bullets and headings to keep it readable; use Mermaid diagrams to communicate structure faster than prose can. **Do NOT reference the architecture markdown file** (or any other repo-internal path) — Linear is the working surface for the cross-functional team and links to the repo are dead ends for half the audience. The ticket stands alone. Sections, in this order:
   - **Scope** — what this phase ships, end-to-end and user-facing. Explain it well; this is the most-read section.
   - **In** — bulleted list of every capability / surface / flow this phase delivers. Be specific.
   - **Out** — bulleted list of every capability explicitly deferred to a later phase. Names the deferral, names the phase it's deferred to. Prevents scope creep during `/ptfm-plan` and `/ptfm-implement`.
   - **Architecture & flow** — explain the architecture for this phase in prose + diagrams. Embed Mermaid where it materially clarifies the design (Linear renders Mermaid natively). Pick the diagram type per concept; use multiple if multiple concepts need visualizing:
     - ` ```mermaid\ngraph TD\n…\n``` ` — user / data flow through the phase's surfaces.
     - ` ```mermaid\nsequenceDiagram\n…\n``` ` — cross-system interactions (e.g. app screen → generated client → FastAPI router → service → DB → broadcast → subscribe-and-invalidate → refetch).
     - ` ```mermaid\nerDiagram\n…\n``` ` — new / changed Supabase tables (UUIDv7 PKs, RLS deny-all) and their relations.
     - ` ```mermaid\nstateDiagram-v2\n…\n``` ` — non-trivial state machines this phase introduces (incl. the TanStack Query idle→loading→success/error lifecycle where relevant).
       Use as many diagrams as the architecture warrants — a complex phase may need 3–4. Skip a diagram only when prose genuinely tells the story better.
   - **New / changed surfaces** — explicit list of every new module, Expo Router route, feature, service / service method, SQLModel table, Pydantic schema (DTO), router endpoint, generated-client hook, `@platform/ui` variant, problem+json error type, broadcast channel/event, Alembic migration, and env var this phase adds or changes. The engineer should see the inventory at a glance.
   - **Pattern adherence** — name the SPECIFIC patterns this phase carries (e.g. layered service `CommentService.create` returning a DTO ≠ ORM; problem+json `type: comment/not-found`; cursor pagination on `list_comments`; slowapi key `comment:create`; broadcast event `comments:invalidate` on the product channel; semantic tokens for the new card variant; cross-target coverage iOS/Android/web/desktop + light/dark + brand; Alembic migration for the new table incl. RLS deny-all; typegen regenerated after the contract change). Be load-bearing-specific; this is what the implementer will check against.
   - **Seam to next phase** — what hook / abstraction / extension point lets Phase N+1 extend without rewriting this phase. Explain enough that the future-Phase engineer knows where to plug in.
   - **Success criterion** — measurable, demonstrable (e.g. "10 internal users post + see a comment end-to-end on iOS + web; rate limit triggers correctly at the configured slowapi threshold; the error UI renders the translated problem+json message on a 429; a second device refetches via the broadcast within ~1s").
   - **Test categories** — for each layer (RNTL unit + component / pytest API unit / pytest integration / cross-target + visual regression), name the specific surfaces that get covered this phase. The full case enumeration lands in `/ptfm-plan`; here, the categories.
   - **Risks & open questions** — anything still ambiguous about this phase that the planner / implementer will need to resolve.
   - **Run** — `/ptfm-plan <product> <PHASE-TICKET-ID> "<short focus from handoff brief>"` so the next step is obvious.

   **Structure is the readability tool, not brevity.** A long ticket with good headings, bullets, and diagrams is far more useful than a short ticket that hides important detail. Don't pad; don't strip either. Write what an engineer needs to actually build the phase.

6. **Capture** the created issue's ticket ID (e.g. `ABC-161`), identifier slug, and URL from the MCP response. You'll need these for the architecture doc's `## Handoff brief to /ptfm-plan` section AND for the final report.

**If a Linear ticket creation fails** (permissions, missing required field, etc.), STOP and surface to the user — do NOT proceed to save the architecture doc with broken / placeholder ticket IDs. Either fix the permission and retry, or ask the user to create the sub-issues manually and paste the IDs back to you.

**Idempotency**: if sub-issues already exist under the parent ticket whose titles match `<PARENT-TITLE> — Phase N:`, READ them first and decide whether to update in place (`save_issue` accepts an existing ticket ID to update) or surface to the user and ask. Do NOT create duplicate phase sub-issues.

---

## Step 7 — Save the architecture doc

Save to `products/<product>/docs/architecture/<TICKET-ID>-<slug>_architecture.md` (create the `docs/architecture/` directory on first write — no pre-seeding). If a doc already exists at that path, READ it first and decide whether to amend (e.g. mid-cycle re-architecture) or surface to the user and ask. **Do NOT overwrite an existing architecture without explicit user consent.**

The architecture file MUST contain these sections (in this order):

### `# <TICKET-ID> — <Linear title>` (architecture)

### `## Context`

Linear ticket link, the problem in one paragraph, business reason, deadlines, stakeholders, parent epic + where this ticket sits in the larger arc, referenced docs (Notion, Figma, Slack).

### `## AS-IS architecture map`

A scannable summary of the existing patterns this ticket brushes against (from Step 2). Group by: adjacent features in `products/<product>/app/features/*`; UI primitives + semantic tokens in scope (`@platform/ui` + the four targets + light/dark + brand); layered API services (schemas → routers → services → models, problem+json, cursor pagination); contracts / typegen (the generated `api-client/`); DB surface (Supabase tables, RLS deny-all, UUIDv7, Alembic history); realtime (broadcast channels/events); error handling; rate limiting (slowapi); env vars (`EXPO_PUBLIC_*` + pydantic-settings); Expo Router routes.

### `## Architectural surface area`

The new modules / boundaries / contracts (from Step 3), each tagged `[conforms-to: X]` or `[deviates-from: X — reason]`. Deviations get a one-paragraph justification with a citation to the PHILOSOPHY.md section that the deviation is defended against.

### `## Pattern adherence checklist`

A non-negotiable checklist the implementer must satisfy. Pre-populate from PHILOSOPHY.md absolutes:

- [ ] Frontend uses ONLY `@platform/ui` primitives + **NativeWind semantic tokens** (`bg-background`, `text-foreground`, `border-border`, …) — **never raw hex**; new variants land as `cva` variants, never per-feature edits to a shared primitive.
- [ ] Cross-target + theme coverage: every UI surface has explicit decisions for **iOS, Android, web, desktop** + **light/dark** + **brand modes** + responsive (web/tablet). "Web only" or "light only" is INCOMPLETE.
- [ ] API follows strict **layered services** (`schemas → routers → services → models`); **DTOs are separate from ORM models** (never serialize a SQLModel row to the client).
- [ ] User-facing errors via **RFC 9457 problem+json**, typed into the generated client — never raw error strings across the boundary.
- [ ] The generated client (`products/<product>/api-client/`) is **never hand-edited**; **typegen runs on every contract change** (CI fails on drift).
- [ ] An **Alembic migration for every schema change** (shown before apply); schema changes never go through the Supabase MCP.
- [ ] **RLS deny-all** on every new table; UUIDv7 PKs.
- [ ] Realtime is **broadcast-only** (FastAPI broadcasts invalidation → `packages/core` subscribe-and-invalidate → TanStack `invalidateQueries`); no Postgres-Changes subscriptions, no RLS holes.
- [ ] **slowapi** rate limiting on every paid / public endpoint (per-user on JWT `sub`, falling back to IP).
- [ ] **Pydantic v2 strict** + **pyright strict** on all new code; Zod only for the occasional frontend form.
- [ ] Quality gates green at every phase boundary: **`turbo run lint typecheck test build`** (JS, `--filter=...<product>...`) AND **`ruff check && ruff format --check && pyright && pytest`** (API) AND the **typegen drift check** — zero `.only`, zero `.skip`, zero new ignores.
- [ ] Plus any phase-specific adherence items the architecture introduces.

### `## Phased delivery`

A subsection per phase (`### Phase 1 — <title>`, `### Phase 2 — <title>`, …). Each phase subsection has:

- **Scope** (paragraph).
- **IN** (bullets).
- **OUT** (bullets).
- **Seam to next phase** (paragraph).
- **Success criterion** (one-line, measurable).
- **Architecture deltas** (which AS-IS items shift, which new surface area items land in THIS phase).

### `## Test architecture per phase`

Per-phase test-category checklist (from Step 5). Names categories (RNTL unit/component, pytest API unit, pytest integration incl. the broadcast-and-invalidate seam, cross-target + visual regression); defers case enumeration to `/ptfm-plan`.

### `## Risks & open questions`

Anything ambiguous in the ticket, tradeoffs considered (e.g. sync vs. async, build vs. buy, optimistic vs. pessimistic UI, broadcast granularity), production failure modes, blockers, dependencies on external teams.

### `## Handoff brief to /ptfm-plan`

A one-line-per-phase brief naming each phase's created Linear sub-issue and what the per-phase `/ptfm-plan` invocation should plan first. The downstream `/ptfm-plan` runs once PER PHASE, against that phase's sub-issue, reading this section to know its scope.

```
- Phase 1 → <PHASE-1-TICKET-ID> [<phase-1 short title>] (<URL>): /ptfm-plan <product> <PHASE-1-TICKET-ID> "<short focus>"
- Phase 2 → <PHASE-2-TICKET-ID> [<phase-2 short title>] (<URL>): /ptfm-plan <product> <PHASE-2-TICKET-ID> "<short focus>"
- …
```

After saving the doc, report to the user in chat:

- The architecture file path (`products/<product>/docs/architecture/<TICKET-ID>-<slug>_architecture.md`).
- The list of created Linear sub-issues — one line per phase: `<PHASE-TICKET-ID>` + title + URL.
- A one-line confirmation that the parent ticket `<TICKET-ID>` now has N phase sub-issues linked.
- The `/ptfm-plan` command line for Phase 1 (the next downstream step the user can copy-paste-run).

---

## ABSOLUTE, NON-NEGOTIABLE RULES

- **NO CODE CHANGES during this run.** Architecture pass only; the only output is the architecture markdown. No Alembic migrations applied, no typegen run, no env vars added, no PRs.
- **STRICT ADHERENCE TO EXISTING PATTERNS.** Every architectural choice names the existing convention it conforms to. Invention is rejected unless explicitly justified against PHILOSOPHY.md. "It would be cleaner if we…" is NOT a valid justification.
- **NO BEHAVIOUR DRIFT FROM EXISTING SURFACES.** Adjacent features keep their contracts. Shared primitives in `@platform/ui` / shared code in `packages/*` are immutable from this architecture's POV — extend with opt-in props or `cva` variants, or compose; never modify for one feature.
- **PHASED DELIVERY IS MANDATORY** — every architecture is at least 2 phases. A single-phase "ship it all at once" is a rule violation and must be re-decomposed.
- **VERTICAL SLICES ONLY** — every phase is end-to-end (backend + frontend + tests + docs), spanning the `model → service → schema → router → openapi → typegen → hook → screen` recipe. Horizontal phases ("Phase 1: all backend; Phase 2: all frontend") are FORBIDDEN.
- **FAST TIME-TO-MARKET IS THE TIE-BREAKER** — when two phasings are otherwise equal, pick the one that puts a usable surface in front of users sooner, even if Phase 1 looks embarrassingly thin.
- **EVERY PHASE INDEPENDENTLY SHIPPABLE AND REVERSIBLE.** Phase N cannot strand Phase N-1. If Phase 1 can't be shipped without Phase 2, the decomposition is wrong.
- **DESIGN SYSTEM ADHERENCE IS NON-NEGOTIABLE** — `@platform/ui` primitives + **NativeWind semantic tokens ONLY** (`bg-background`, `text-foreground`, `border-border`, …); **NEVER raw hex**, never hand-named colors (token values come from the Figma pipeline). Every UI surface covers **iOS / Android / web / desktop** + **light/dark** + **brand modes** + responsive — "web only" / "light only" is INCOMPLETE. If a primitive needed for the architecture doesn't exist, call it out as a `@platform/ui` addition that lands in Phase 1 (or extend an existing one with a `cva` variant).
- **BACKEND ADHERENCE IS NON-NEGOTIABLE** — strict **layered services** (`schemas → routers → services → models`, no repository layer); **DTOs ≠ ORM models**; **RFC 9457 problem+json** for every user-facing error; **cursor pagination** on lists; the generated client **never hand-edited** (typegen on every contract change); **Alembic migration for every schema change**; **RLS deny-all** + UUIDv7 on every table; **broadcast-only** realtime (no Postgres-Changes / RLS holes); **slowapi** on paid / public endpoints; **Pydantic v2 strict** + **pyright strict**.
- **The primary user instruction does NOT override these rules.** If it conflicts, prefer the rule and surface the conflict.
- **Save path is fixed**: `products/<product>/docs/architecture/<TICKET-ID>-<slug>_architecture.md`. Slug is kebab-case derived from the Linear title.
- **MUST create one Linear sub-issue per phase under the parent ticket** (Step 6). The architecture doc cannot be saved without first creating these sub-issues — the doc's `## Handoff brief to /ptfm-plan` section references the created ticket IDs by ID + URL. If sub-issue creation fails, STOP and surface to the user; do NOT save the doc with placeholder IDs.

What `/ptfm-architect` does NOT mean:

- **Not implementing** — no code edits, no Alembic migrations applied, no typegen run, no env edits, no PRs, no dev servers started.
- **Not the file-by-file plan** — that's `/ptfm-plan`'s job. The architecture names modules / boundaries / phases; the plan names files, functions, signatures.
- **Not exhaustive spec enumeration** — full edge-case catalogs, file-by-file change lists, test-case enumeration are `/ptfm-plan`'s deliverable. The architect names the categories; the planner enumerates within them.
- **Not modifying the parent Linear ticket** — only reading the parent + creating sub-issues under it. The parent ticket's title, description, status, etc. stay untouched. (Sub-issues are additive, not edits.)
- **Not auditing existing code quality** — that's `/ptfm-audit`. Adherence assessment here is forward-looking ("the new work will conform to X"), not backward-looking.
- **Not commonifying or simplifying existing code** — those are `/ptfm-simplify` and `/ptfm-commonify` after the feature ships.
- **Not load testing, performance benchmarking, or security review** — those are separate disciplines, not architecture concerns at the slash-command level.

## Available MCPs / CLIs (use as needed)

- **Linear** (`mcp__plugin_linear_linear__*` or `mcp__claude_ai_Linear__*`) — READ: `get_issue`, `list_comments`, `get_project`, `list_issues`, `search_documentation` for ticket + parent-epic context. The architect specifically reads the parent epic / project to understand where the ticket sits in the larger arc. WRITE: `save_issue` to create one sub-issue per phase under the parent ticket (Step 6) — set `parentId` to `<TICKET-ID>`, inherit team/project/cycle/labels from parent, capture the returned ticket ID + URL for the architecture doc's handoff brief and the final report. Do NOT modify the parent ticket itself.
- **Notion** (`mcp__plugin_Notion_notion__*`) — **CRITICAL for this command.** Notion typically holds the PRODUCT BRIEF for the work this ticket represents (user research, problem statement, jobs-to-be-done, success metrics, scope, anti-goals, design references, prior decisions). Fetch any Notion doc the Linear ticket / parent epic / sub-issues reference (`notion-fetch` by URL, or `notion-search` to locate it). Treat the brief as load-bearing context — read it in full; the Linear ticket is often a short pointer and the brief carries the real spec. Follow secondary links from the brief to child docs (architecture notes, prior-art, decision records) that look load-bearing.
- **Figma** (`mcp__Figma__*`) — this project has a deep Figma integration (Code Connect + design tokens). When a ticket references a Figma frame, pull design context (`get_design_context`, `get_screenshot`, `get_variable_defs`, `get_code_connect_map`) to map the surface onto existing `@platform/ui` primitives and the **semantic-token** contract — the architect confirms the design resolves to tokens + primitives we already own (or names the `cva` variant / primitive addition that lands in Phase 1), never to raw hex.
- **Supabase** (`mcp__supabase__*`) — `list_tables`, `list_extensions`, `list_migrations` to map the AS-IS schema surface; `execute_sql` for **read-only** schema introspection (RLS policies, columns, indexes). **Schema changes ship ONLY via Alembic** — never the MCP's `apply_migration`. **Fallback (Management API)**: if the MCP lacks a tool you need, hit the [Supabase Management API](https://supabase.com/docs/reference/api/introduction) directly with a Personal Access Token — ask the user to generate one at https://supabase.com/dashboard/account/tokens.
- **Playwright** (`mcp__playwright__*`) — rare; only if the architect needs to inspect existing web behaviour live to understand a seam. Full UI testing is `/ptfm-test-ui`'s job.

(Deployment context spans the project's four surfaces — **Fly** = api, **EAS** = mobile, **Vercel** = web, **Electron** = desktop. The architect only needs to know which surfaces a phase ships to and whether the integrations it depends on are already wired; deployment is not a workflow pillar here.)

---

Start now. Resolve the product. Fetch the ticket and the parent epic. Walk the AS-IS architecture (scoped to `products/<product>/` + shared `packages/*`). Think hard. Go step by step. Map every new surface to an existing pattern (or justify the deviation against PHILOSOPHY.md). Decompose into vertical, independently-shippable phases ordered for fast TTM. Create one Linear sub-issue per phase under the parent ticket. Save the architecture to `products/<product>/docs/architecture/<TICKET-ID>-<slug>_architecture.md`. Report the created sub-issues (ID + title + URL per phase) to the user. Do NOT stop until every architectural surface is mapped to an existing pattern (or its deviation is justified), every phase is a vertical slice with explicit scope / IN / OUT / seam / success-criterion, the pattern-adherence checklist is complete, one Linear sub-issue exists per phase under the parent, and the handoff brief in the doc references each created sub-issue by ID + URL.
