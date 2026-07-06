---
description: Scope, validate, and finalize a product spec from a Linear ticket — CEO / Chief Product Officer debate that interrogates the stakeholder to extract problem, target user, jobs-to-be-done, success metrics, scope IN/OUT, and anti-goals. Scoped to a single product under products/<product>/. Saves a brief to products/<product>/docs/product/, syncs the locked-in summary to the parent ticket (with sign-off), hands off to /ptfm-architect.
argument-hint: "<product> <ticket-id> [slug] [user-instruction]"
---

Args: $ARGUMENTS

Expected shape: `<product> <TICKET-ID> [slug-or-title] [primary user instruction]`

- **`<product>`** — first token. The product directory under `products/` (e.g. `blog`). **Required.** EVERYTHING this command does — the codebase walk, every glob, every save path — is scoped to `products/<product>/`. If not passed, infer it from the cwd when the session is inside `products/<name>/...`; otherwise STOP and ASK. Validate that `products/<product>/` exists; if it does not, STOP and ASK (do NOT scope against a missing product).
- **`<TICKET-ID>`** — second token (e.g. `BLOG-145`). **Required.** If not passed, the resolve block below auto-infers from the current branch; if it can't, STOP and ask.
- **`[slug-or-title]`** — optional third token (kebab-case slug or quoted title). Overrides the auto-inferred slug. If absent, the resolve block derives the slug from the Linear ticket title (the common case for `/ptfm-product`, which runs upstream of architecture / plan / implementation), or globs `products/<product>/docs/product/<TICKET-ID>*_product.md` for a mid-cycle re-scoping.
- **`[primary user instruction]`** — anything after the slug (or after the ticket ID if no slug-shaped token follows). Freeform guidance for THIS specific invocation — adjust scope, focus, or emphasis as instructed. **It does NOT override the absolute rules below** — if it conflicts with a rule, prefer the rule and surface the conflict to the user.

---

We need to scope, validate, and finalize the product spec for Linear ticket `<TICKET-ID>` in product `<product>` as the **CEO / Chief Product Officer** would, BEFORE any architecture / plan / implementation exists. Fetch the ticket from Linear, read every linked Notion / Figma / Slack thread in great depth, think hard, go step by step, create as many to-dos as needed, then **interrogate the user (acting as the stakeholder / client representative) with a structured debate** until you've extracted an **EXTREMELY DETAILED** product brief: who the user is, what problem this solves, what job the user is hiring the product to do, why now, what success looks like, what's explicitly OUT, what alternatives were ruled out, what risks remain. **You are not the user's stenographer — you are the CEO challenging the brief.** Push back on vague goals, half-formed personas, success metrics that aren't measurable, and scope that can't be defended. Default to asking more questions, not inventing answers. Save the resulting product brief as a markdown that another agent (`/ptfm-architect`) can decompose into a phased delivery architecture — and that future PMs / designers / engineers can read months from now to understand why this feature exists. The per-phase Linear sub-issues are created by `/ptfm-architect` downstream — this command works against the parent / epic ticket.

**Resolve `<product>`, `<TICKET-ID>`, and `<slug>` BEFORE doing anything else.**

1. **`<product>`** — if a first token was provided in `$ARGUMENTS`, use it. Otherwise, if the session cwd is inside `products/<name>/...`, infer `<name>`. If neither yields a product, STOP and ASK. Then verify `products/<product>/` exists on disk; if it does not, STOP and ASK — do NOT guess a product.
2. **`<TICKET-ID>`** — if a ticket-shaped token was provided in `$ARGUMENTS`, use it. Otherwise run `git branch --show-current` and extract the `<TEAM>-<NUMBER>` portion (e.g. `BLOG-145` from `feature/BLOG-145-comment-threads`). If neither yields a ticket, STOP and ASK — do NOT guess.
3. **`<slug>`** — if a slug-shaped token was provided, use it. Otherwise derive the slug from the Linear ticket title (kebab-case, ~5–8 words, drop filler words) — this is the common case for `/ptfm-product` since it runs upstream of architecture / plan / implementation. The only fallback glob is `products/<product>/docs/product/<TICKET-ID>*_product.md` for a mid-cycle re-scoping against an existing brief. Do NOT glob `docs/architecture/`, `docs/plans/`, or `docs/implementation/` — those artifacts don't exist yet at product-scoping time.

Reference docs (read these first, in full, in this order):

- @PHILOSOPHY.md — the architecture / decision GOSPEL: locked decisions, conventions, invariants. This constrains what's even possible to build (and what's "free" vs. expensive). It is law.
- @CLAUDE.md (repo root) — the monorepo map + conventions (promote-on-2nd-use, naming, semantic-tokens-only, broadcast-only realtime, problem+json, never-edit-generated-client).
- @products/<product>/CLAUDE.md — the product's structure, ports, infra names, where compositions live, what already ships in this product.
- the nested **API** `CLAUDE.md` under `products/<product>/api/` — the add-an-endpoint recipe + the strict-layered-OOP / DTO-separation rules (what server capabilities already exist, what's cheap to extend).
- @packages/ui/CLAUDE.md + @packages/ui/FIGMA.md — the design-system runbook + token contract (what UI primitives already exist, the token modes).

(These CLAUDE.md files are produced when the monorepo / product is stamped from `products/_template`; if one is absent, fall back to `PHILOSOPHY.md`. No architecture / plan / implementation docs to reference — `/ptfm-product` is upstream of `/ptfm-architect` and everything that follows. Those artifacts get produced downstream from this brief.)

---

## Step 1 — Fetch the Linear ticket, parent epic, and linked product context

Use the Linear MCP (`mcp__Linear__*`, e.g. `get_issue`) to fetch the ticket AND its parent epic / project (product context lives at a level above a single ticket — knowing the larger arc matters). Capture:

- Title, description (full body, any framing the stakeholder already wrote)
- Comments (decisions, constraints, prior debates, "the team agreed to X")
- Linked issues, blockers, sub-issues, parent epic
- Attached / referenced docs (Notion vision docs, Figma frames, Slack threads, prior research, customer interview notes, competitor analysis, GitHub PRs)
- Status, project, team, cycle

Follow load-bearing external links — Notion docs via Notion MCP, Figma frames if URL provided, Slack threads if shared. The product lead reads ALL the context before debating; do not skim.

**CRITICAL — Notion links usually contain the PRODUCT BRIEF (if one exists) or related research.** At this organization, the Linear ticket is the work-item; the actual product context (user research, target user, problem statement, jobs-to-be-done, success metrics, scope, anti-goals, design references, go-to-market context, prior decisions) typically lives in a linked Notion doc. **If the ticket description, comments, or any linked sub-issue references a Notion URL, READ THAT NOTION DOC IN FULL via the Notion MCP** (`mcp__Notion__*`, e.g. `notion-fetch` by URL, or `notion-search` to locate it) before drafting any questions. Notion docs are themselves often a network — follow links from the primary brief to child / sibling docs that look load-bearing (prior research, decision records, customer-interview transcripts, market analysis). Treat the Notion content as the starting baseline; the debate in Step 4 EXTENDS what's already there, not replaces it.

If you cannot find a Notion link on the ticket but the ticket reads like it's referencing one (e.g. "as per the brief", "see the doc", "per the spec"), STOP and ASK the user for the Notion URL before drafting questions — do NOT scope against a missing brief.

If the ticket is sparse and references nothing, that's fine — that's exactly when `/ptfm-product` adds the most value. The brief gets built from the debate in Step 4.

---

## Step 2 — Build the existing-product-context map

You cannot ask sharp clarifying questions without knowing what already ships in this product and what the user already does today. Walk the existing codebase + product (scoped to `products/<product>/` and the shared packages it consumes) to map context that constrains or informs this brief. **Do NOT skim.** A shallow context map produces shallow questions.

For this ticket's likely surface area:

- **Adjacent features** — what's in `products/<product>/app/features/*` that does anything similar? What surfaces does the target user already see? Read those features' thin route shells (`app/`) + key components to understand the existing user journey. (Features are product-local; route files stay thin one-liners.)
- **User flow today** — what does the user do RIGHT NOW that this feature would replace, augment, or interrupt? Trace the existing happy path in the codebase. The brief in Step 5 must say what changes for the user — across iOS, Android, web, and desktop, since one Expo codebase ships to all four.
- **Existing primitives** — which `@platform/ui` owned primitives already exist (`packages/ui/src/components/ui/*`) and which product-local compositions live in `products/<product>/app/features/<feature>/components/`? This constrains what's "free" to compose vs. what's a new design-system addition. (Important for the scope debate in Step 4 — composing existing primitives is cheap; modifying a shared primitive for one feature is forbidden, so a feature that needs a new primitive is real cost.)
- **What's cheap to compose** — existing `@platform/ui` primitives, the `@platform/core` plumbing (supabase client factory, auth session store + route guards, query client with cache persistence, the broadcast subscribe-and-invalidate helper, env, Sentry), and the integrations already wired into this product (Supabase Postgres via the FastAPI service, Supabase Auth, the Figma token pipeline). Knowing what's wired in tells you which capabilities are cheap to compose vs. expensive new dependencies. The product's own API (`products/<product>/api`) and its generated client (`products/<product>/api-client`) show what server capabilities already exist.
- **Prior product briefs** — glob `products/<product>/docs/product/*_product.md` and skim titles + contexts to find adjacent / prior scoping that this brief builds on or competes with.
- **Prior architecture / implementation docs** — glob `products/<product>/docs/architecture/*_architecture.md` and `products/<product>/docs/implementation/*_implementation.md` for adjacent features; their `## Context` and `## Phased delivery` sections show what the team has been investing in and what the codebase is optimized for.

Build a written map of: what already ships, what the user already does, what's cheap to compose, what would be expensive to add. This map fuels the debate in Step 4.

---

## Step 3 — Identify the gaps and draft the debate question list

Compare what the ticket + Notion brief + comments tell you against what a complete product brief needs. **Every gap is a question you must ask the user in Step 4.** A complete brief answers, at minimum:

- **Problem** — what's broken in the world right now? Who is feeling that pain? How severe is it (workaround exists / quiet frustration / paying for an alternative / churn-driving)?
- **Target user** — primary persona (role / job / context / sophistication). Secondary persona if any. Anti-personas (who this is NOT for).
- **Jobs to be done** — what JOB is the user hiring this product to do? When does the job arise? What was the user doing before / after the job? (See Clayton Christensen JTBD framing — the job is the underlying motivation, not the surface feature.)
- **User research signal** — what evidence do we have that this matters? Customer interviews, support tickets, sales calls, churn analysis, competitor wins, internal observation? If none, that's a red flag — surface it.
- **Why now** — what changed (market, internal capability, regulatory, competitor move, customer escalation) that makes this the right time? Why not 6 months ago, why not 6 months from now?
- **Goals & success metrics** — what does "this worked" look like? MEASURABLE: a number, a percentage, a count, a time-to-X. "Better UX" is not a metric. "Reduce time-to-first-publish from 8 min to 2 min" is.
- **Scope IN** — explicit capabilities the v1 must ship.
- **Scope OUT (anti-goals)** — explicit capabilities the v1 will NOT ship, with reason (defer to vN+1 / out-of-product-vision / better-handled-by-X / never).
- **Alternatives considered** — what other approaches were on the table? Why was THIS approach picked? (Forces a defensible decision; surfaces hidden assumptions.)
- **Constraints** — timeline (when does this need to ship), budget (what can we spend on third-party services), technical dependencies (what other team / system has to land first), regulatory (privacy, compliance).
- **Risks & open questions** — what could fail? What's the cost of being wrong? What do we still not know?
- **Design references** — links to Figma frames, mocks, sketches, competitor screenshots, prior-art surfaces in our own product. If none, the brief needs to flag "design TBD" as a downstream dependency.
- **Stakeholder map** — who needs to sign off (CEO / Head of Product / Design / Engineering / Legal / Sales / Customer Success)? Who's the DRI?

**The four-risks lens (Marty Cagan).** Before you call the gap-list complete, pressure-test the idea against the four product risks — a complete brief has an answer (or a flagged unknown) for each:

- **Value risk** — will the user actually want it / choose it over what they do today? (The biggest killer; most of this brief exists to de-risk it.)
- **Usability risk** — can the target user actually figure out how to use it? (Informs the design-references gap.)
- **Feasibility risk** — can it be built with what we have? (Light touch here — deep feasibility is `/ptfm-architect`'s call; just flag anything that looks expensive or impossible, e.g. needs a brand-new `@platform/ui` primitive, a new external integration, or schema changes beyond the existing API.)
- **Viability risk** — does it work for the business? (Cost, pricing, legal, brand, support load, sales motion.)

**List every gap** before debating. Then in Step 4, batch the questions intelligently — don't dribble them out one at a time; group them so the user can answer in a focused session.

---

## Step 4 — Debate with the user (CEO / CPO mode)

This is the heart of `/ptfm-product`. **Default to asking, not inventing.** A brief written without the stakeholder's voice is a brief that ships the wrong thing.

Run a structured debate, iteratively. For each round:

1. **Surface what you DO know** from Step 1–2, in a tight summary. The user should see you've done your homework before being asked anything — this earns the right to interrogate.
2. **Ask the gap-list questions in batches**, grouped by area (problem → user → JTBD → metrics → scope → alternatives → constraints → risks). 5–10 questions per batch is the sweet spot. Number them so the user can answer by number.
3. **Push back where answers are vague.** Apply these challenge patterns (channel the CEO who's been in 1000 product reviews):
   - **"Who specifically?"** — when the user says "users" or "customers"; force them to name a persona or even a specific real customer.
   - **"How will we measure that?"** — when the answer is qualitative ("better", "easier", "faster"); demand a number.
   - **"What's the smallest version that proves the bet?"** — when scope balloons; force a v1 cut.
   - **"What are we explicitly NOT doing?"** — when scope is open-ended; force anti-goals.
   - **"What did we consider and reject?"** — when only one path is presented; surface the alternatives.
   - **"What evidence do we have that this matters?"** — when the rationale is "the team thinks…"; demand user signal.
   - **"Why now and not in 6 months?"** — when timing is unstated; force the urgency case.
   - **"Who has to say yes for this to ship?"** — when stakeholders aren't named.
   - **"What's the worst-case outcome if we ship this and we're wrong?"** — when risk isn't acknowledged.
   - **"What does the user do TODAY in absence of this?"** — when the problem statement floats; ground it in current behaviour.
4. **Iterate until the gaps close.** It's normal for the debate to take 2–5 rounds. Do NOT draft the brief while questions are open. If the user answers "I don't know" to something load-bearing, that itself goes in the brief under `## Risks & open questions` — explicitly flagged as a stakeholder-must-resolve item BEFORE `/ptfm-architect`.
5. **Never invent answers.** If the user genuinely doesn't have an answer and the question is non-load-bearing, document the gap and proceed. If it IS load-bearing, surface that the brief is incomplete and recommend the user gather signal (customer interviews, data pull, stakeholder alignment) before proceeding to `/ptfm-architect`.

**Interrogation frameworks to draw from.** A great CEO/CPO doesn't ask randomly — they run proven discovery techniques. Reach for these as the debate demands; you don't need all of them every time:

- **Jobs-to-be-Done switch interview** — instead of "what feature do you want?", ask what the user is trying to make progress on and what they hire / fire to do it. Probe the four forces: the **push** of the current problem, the **pull** of the new solution, the **anxiety** about switching, and the **habit** holding them to the status quo. The job is the durable motivation; the feature is just today's answer to it. Force the user to state the hole, not the drill.
- **5 Whys** — when the user states a problem, drill: ask "why is that a problem?" repeatedly (≈5×) until you hit the root cause, not the symptom. "Users want bulk publish" → why? → "publishing 50 posts one-by-one takes an hour" → why does that matter? → … The brief's `## Problem` section captures the root, not the surface request.
- **SPIN sequencing** — structure the problem interview: **Situation** (what's the current setup?) → **Problem** (what's broken in it?) → **Implication** (what does that broken thing cost — time, money, churn, morale?) → **Need-payoff** (what becomes possible if it's fixed?). The Implication step is where vague pain becomes a defensible business case.
- **Working-backwards / PR-FAQ gut-check (Amazon)** — ask the user to imagine the launch announcement is already written: "When this ships, what's the one-sentence headline a customer would care about?" If neither of you can write a compelling one, the value risk is unaddressed — keep digging. (This becomes the `## Executive summary` / headline.)
- **Pre-mortem / red-team** — once scope feels settled, flip to failure mode: "Fast-forward 6 months: we shipped this and it bombed. What's the most likely reason?" Run it 2–3 times to surface the top failure modes; each becomes a `## Risks & open questions` entry with a mitigation or an explicit accept-the-risk.

**Tone**: respectful, substantive, persistent. You are the CEO debating the team's pitch — not a yes-person, not a contrarian for sport. Every challenge serves the brief.

---

## Step 5 — Synthesize the answers into the product brief

Once the debate has closed all the load-bearing gaps (or explicitly flagged the unresolvable ones), draft the brief. **Quote the user where the wording is theirs — don't paraphrase the stakeholder voice into corporate mush.** Their phrasing carries signal future readers will need.

The brief is a synthesis, not a transcript. Structure beats length. Use bullets, headings, tables where they help — but never pad. A complete-but-short brief beats a long-but-vague one.

---

## Step 6 — Save the product brief

Save to `products/<product>/docs/product/<TICKET-ID>-<slug>_product.md` (create the `docs/product/` dir on first write — no pre-seeding). If a brief already exists at that path, READ it first and decide whether to amend (mid-cycle re-scoping) or surface to the user and ask. **Do NOT overwrite an existing brief without explicit user consent.**

The product brief file MUST contain these sections (in this order):

### `# <TICKET-ID> — <Linear title>` (product brief)

### `## Executive summary`

3–5 sentences: what we're building, who it's for, what problem it solves, what success looks like. The "read this if you read nothing else" section. Lead with the **working-backwards headline** (Amazon PR/FAQ) — the one sentence a customer would actually care about when this ships. If you can't write a compelling headline, the value risk isn't resolved — go back to the debate.

### `## Context`

Linear ticket link, parent epic, where this sits in the larger product arc, referenced Notion / Figma / Slack docs, prior briefs this builds on.

### `## Problem`

What's broken in the world right now. Severity. Who feels the pain. What evidence we have.

### `## Target user`

Primary persona (role / job / context / sophistication). Secondary persona if any. Anti-personas (who this is explicitly NOT for and why).

### `## Jobs to be done`

What job is the user hiring this product to do? When does the job arise? What were they doing before / after? Quote the user's own framing where possible.

### `## User research signal`

What evidence do we have that this matters? Sources (interviews, support tickets, sales calls, churn analysis, competitor wins, internal observation). If thin, flag it as a risk.

### `## Why now`

What changed that makes this the right time? Why not 6 months ago, why not 6 months from now?

### `## Goals & success metrics`

Measurable outcomes. Each metric: name, current baseline (if known), target value, measurement method, review cadence. No vague "better UX" goals.

### `## Scope (MoSCoW)`

Prioritize every capability with **MoSCoW** so the v1 cut is explicit and defensible:

- **Must** — the v1 ships nothing without these; this is the irreducible core.
- **Should** — high-value but v1 survives without them; first candidates for a fast-follow.
- **Could** — nice-to-have; cut at the first sign of schedule pressure.
- **Won't (this time)** — explicitly OUT, with reason per item (defer to vN+1 / out-of-product-vision / better-handled-by-X / never). The Won't list is as load-bearing as the Must list — it's what stops scope creep in `/ptfm-architect` and `/ptfm-plan`.

### `## Alternatives considered`

Other approaches that were on the table. Why each was rejected. Why THIS approach was picked.

### `## Constraints`

Timeline (deadlines). Budget (third-party costs). Technical dependencies. Regulatory (privacy, compliance, audit).

### `## Stakeholders & decision roles (DACI)`

Map the decision with **DACI** (or RAPID if the team uses it) so it's unambiguous who actually decides vs. who just has opinions:

- **Driver** — the single DRI who owns moving this forward.
- **Approver** — the one who says final yes / no (often the CEO / Head of Product for a new surface).
- **Contributors** — consulted for input (Design, Engineering, Legal, Sales, CS) — named, with what each is consulted ON.
- **Informed** — told once decided, no input loop.
  Name real people / roles, not "the team". An unnamed Approver is a shipping risk — flag it.

### `## Design references`

Links to Figma frames, mocks, competitor screenshots, prior-art in our own product. If none, flag "design TBD" as a downstream dependency. Remember the brief must hold across iOS, Android, web, and desktop, plus light/dark and brand modes — flag any surface where only one target or one theme has been considered.

### `## Risks & open questions`

Organize by the **four product risks** (value / usability / feasibility / viability) so no class is silently skipped, plus whatever the **pre-mortem** ("we shipped this and it bombed — why?") surfaced. Each risk: what could fail, the cost of being wrong, and either a mitigation or an explicit "accept this risk because…". Unknowns we still can't answer get flagged **"RESOLVE BEFORE /ptfm-architect"** if load-bearing — these are the items that should block the architecture pass until the stakeholder gets real signal.

### `## Handoff to /ptfm-architect`

A one-paragraph brief naming what the architect needs to know to start: the core problem, the v1 scope IN, the non-negotiable success metrics, the load-bearing constraints. The architect reads this section first and the rest as backup.

```
- Architect with: /ptfm-architect <product> <TICKET-ID> <slug> "<one-line problem framing>"
```

(The architect run is optional — small features can skip straight to `/ptfm-plan`. But when it's used, this handoff brief is its starting context. `/ptfm-architect` creates the per-phase Linear sub-issues under this parent ticket as part of its run.)

---

## Step 7 — Sync the locked-in summary to the parent Linear ticket (draft → confirm → write)

The repo brief (`products/<product>/docs/product/<TICKET-ID>-<slug>_product.md`) is dev-facing — invisible to PMs, designers, sales, and CS who live in Linear and may not have repo access. **The parent Linear ticket is the cross-functional team's working surface, so the locked-in scope must land THERE too, self-contained, with no dead links to repo files.** (Same principle `/ptfm-architect` applies to its self-contained sub-issues.)

This is the ONE Linear WRITE this command makes — an **update to the existing parent ticket's description**. It is gated behind explicit user sign-off because Linear is a shared, client-facing surface:

1. **Draft** a tightened ticket-description update from the finalized brief. Keep it self-contained and Linear-native (Markdown that renders in Linear; no `products/<product>/docs/…` repo paths — those are dead ends for half the audience). Include, succinctly: the working-backwards headline + executive summary, Problem, Target user (+ anti-personas), Jobs to be done, Goals & success metrics (the measurable ones), Scope (MoSCoW — at minimum the Must list and the Won't list), top Risks / open questions. This is a summary, not the full brief — the repo brief stays the deep-detail backup.
2. **Preserve, don't clobber.** If the parent ticket already has a meaningful description, do NOT blow it away — fold the locked-in summary in (e.g. under a `## Product brief (locked <date>)` heading) and keep any prior context that's still accurate. Show the user the BEFORE and the proposed AFTER.
3. **Present the proposed update to the user and WAIT for explicit sign-off.** Show the exact Markdown you intend to write. The user must reply "yes / go / approved" (or edit it) before you touch Linear. Do NOT auto-write.
4. **On approval**, update the parent ticket description via the Linear MCP (`mcp__Linear__*`, e.g. `update_issue` / `save_issue` with the existing ticket ID — an UPDATE, never a create). Optionally also post a one-line comment (`create_comment` / `save_comment`) noting "Product brief locked; full detail at `products/<product>/docs/product/<TICKET-ID>-<slug>_product.md`" so repo-having teammates can find the deep version — but the description itself stays self-contained.
5. **If the user declines** the Linear sync, that's fine — the repo brief is still the source of truth. Note in the chat report that the parent ticket was NOT updated, so the user knows the team surface is stale.

This step updates the PARENT ticket only. It NEVER creates sub-issues — those are `/ptfm-architect`'s job.

---

After completing the run, report to the user in chat:

- The brief file path (`products/<product>/docs/product/<TICKET-ID>-<slug>_product.md`).
- Whether the parent ticket `<TICKET-ID>` was updated (✅ updated with sign-off / ⏭️ user declined / N/A).
- A scannable summary: target user, JTBD, top success metric, scope IN bullets, scope OUT bullets, top 1–2 risks.
- The `/ptfm-architect` command line (the next downstream step the user can copy-paste-run when ready).
- Any unresolved load-bearing questions that must be answered before `/ptfm-architect` runs.

---

## ABSOLUTE, NON-NEGOTIABLE RULES

- **NO CODE CHANGES during this run.** Product-scoping pass only; the only outputs are the product-brief markdown and (with sign-off) an update to the parent Linear ticket's description. No architecture, no plan, no migrations, no env vars, no PRs.
- **NEVER INVENT ANSWERS THE STAKEHOLDER DIDN'T GIVE.** A brief built on assumed user pain, assumed metrics, assumed scope is worse than no brief. If the user doesn't have an answer to a load-bearing question, surface that gap — don't paper over it.
- **DEFAULT TO ASKING, NOT WRITING.** Most of this command's time should be spent reading context and debating with the user. Drafting comes LAST, after the gaps are closed.
- **CHALLENGE VAGUENESS.** Vague goals, half-formed personas, "we'll figure it out later" — all unacceptable in the brief. Use the challenge patterns in Step 4 until the answer is specific, measurable, defensible.
- **QUOTE THE USER WHERE THEIR WORDING IS THE SIGNAL.** Don't paraphrase stakeholder voice into corporate prose. Future readers (PMs, designers, engineers months from now) need the original framing to understand why this exists.
- **SCOPE OUT IS AS IMPORTANT AS SCOPE IN.** A brief without anti-goals is a brief that will ship the wrong thing. Force the user to name what's NOT in v1.
- **SUCCESS METRICS MUST BE MEASURABLE.** Numbers, percentages, counts, durations. Not "better", not "easier". If the user can't name a measurable metric, that itself is a risk to surface.
- **NO ARCHITECTURE / IMPLEMENTATION DECISIONS.** This brief says WHAT and WHY and FOR WHOM. It does NOT say HOW (which framework, which schema, which API endpoint, which `@platform/ui` primitives, which layered service). That's `/ptfm-architect`'s job. Stay above the technical-decision line.
- **The primary user instruction does NOT override these rules.** If it conflicts, prefer the rule and surface the conflict.
- **Save path is fixed**: `products/<product>/docs/product/<TICKET-ID>-<slug>_product.md`. Slug is kebab-case derived from the Linear title (~5–8 words). Everything this command touches is scoped to `products/<product>/`.
- **UPDATE THE PARENT TICKET ONLY, AND ONLY WITH SIGN-OFF; NEVER CREATE SUB-ISSUES.** The single Linear write this command makes is an UPDATE to the existing parent ticket's description (Step 7), gated behind explicit user approval — draft, show, wait for "yes", then write. It NEVER creates child tickets (`/ptfm-architect`'s job) and NEVER auto-writes to Linear without the user seeing and approving the exact update first. If the user declines, the repo brief stands alone and the chat report says so.
- **`/ptfm-product` is OPTIONAL and DOES NOT BLOCK DOWNSTREAM COMMANDS.** Small features and bug fixes can skip straight to `/ptfm-architect` or `/ptfm-plan`. `/ptfm-product` is for new product surfaces where the problem / user / scope is genuinely unclear and needs executive-level debate to lock down.

What `/ptfm-product` does NOT mean:

- **Not architecting** — no system layers, no data models, no API design (no `model → service → schema → router → openapi → typegen → hook → screen` decisions). That's `/ptfm-architect`. The brief says what the product needs to do, not how.
- **Not planning** — no file-by-file lists, no test enumeration, no implementation sequence. That's `/ptfm-plan` (downstream of architect).
- **Not implementing** — no code, no Alembic migrations, no env vars, no PRs.
- **Not creating Linear tickets / sub-issues** — the only Linear write is updating the EXISTING parent ticket's description, and only after the user approves the exact change (Step 7). Per-phase sub-issue creation is `/ptfm-architect`'s job downstream.
- **Not running tests, not starting dev servers, not running typegen, not pushing to git.**
- **Not auditing existing code** — that's `/ptfm-audit`. Adherence assessment here is product-context-only ("what already ships, what the user already does"), not code-quality-backward-looking.
- **Not designing the UI** — the brief references design or flags "design TBD"; it does not produce mocks or component decisions.
- **Not a UX research substitute** — if signal is thin, the brief flags it as a risk and recommends real research (customer interviews, data pull). The brief does not pretend to have user data it doesn't.

## Available MCPs / CLIs (use as needed)

- **Linear** (`mcp__Linear__*`) — READ: `get_issue`, `list_comments`, `get_project`, `list_issues`, `search_documentation` for ticket + parent-epic + sub-issue context. The product lead reads the parent epic / project to understand where the ticket sits in the larger product arc. WRITE (Step 7, with user sign-off ONLY): `update_issue` / `save_issue` to UPDATE the existing parent ticket's description with the locked-in brief summary; optionally `create_comment` / `save_comment` for a one-line "brief locked" note. NEVER create sub-issues (that's `/ptfm-architect`'s job), and NEVER write to Linear without the user approving the exact update first.
- **Notion** (`mcp__Notion__*`) — **CRITICAL for this command.** Notion typically holds the PRODUCT BRIEF (if one exists), user research, vision docs, decision records, customer-interview notes. Fetch any Notion doc the Linear ticket / parent epic / sub-issues reference (`notion-fetch` by URL, or `notion-search` to locate it). Treat the brief as load-bearing context — read it in full before debating; the Linear ticket is often a short pointer and the brief carries the real spec. Follow secondary links from the primary brief to child docs (prior research, decision records, customer-interview transcripts, market analysis).
- **Figma** (`mcp__Figma__*`) — this project has a deep Figma integration (Code Connect + token modes), so Figma is the design-reference backbone. If the ticket / brief references Figma frames, fetch them (`get_design_context`, `get_screenshot`, `get_metadata`) to understand the existing design direction and which on-system components / token modes (light/dark × brand) a surface would reuse. The brief references these by URL; it does NOT produce new design.
- **Supabase** (`mcp__Supabase__*`) — read-only context only: `list_tables` / `list_migrations` to see what data already exists for this product, `execute_sql` for read-only checks on existing usage patterns / user counts that inform the brief's "user research signal" section. (Schema changes go via Alembic downstream, never the MCP's `apply_migration` — but the MCP introspection is fair game here.)
- **Playwright** (`mcp__playwright__*`) — rare; only if the product lead needs to inspect the existing web behaviour live to understand the current user journey before scoping the change.
- **Deployment context** — this product ships to four surfaces (Fly = api, EAS = mobile, Vercel = web, Electron = desktop), infra named `<org>-<product>-<env>`. Only reference this if the brief needs to ground a constraint in an existing deployment / integration surface; it is not a workflow pillar for product scoping.

---

Start now. Resolve `<product>` and verify `products/<product>/` exists. Fetch the ticket and the parent epic. Read every linked Notion / Figma / Slack doc in full. Map what already ships in `products/<product>/` and what the user does today. List the gaps. **Debate with the user, in batches, until the load-bearing gaps close.** Quote them where their wording is the signal. Synthesize the answers into the brief. Save to `products/<product>/docs/product/<TICKET-ID>-<slug>_product.md`. Then draft the parent-ticket-description update, show it to the user, and on sign-off sync it to the parent Linear ticket (Step 7 — never auto-write). Do NOT stop until the brief has a measurable success metric, an explicit scope OUT, an evidence-backed "why now", named stakeholders, a one-paragraph handoff to `/ptfm-architect`, and the parent ticket either updated (with sign-off) or explicitly noted as declined — or until every unresolvable gap is flagged as a stakeholder-must-resolve item.
