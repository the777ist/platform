# Phase 9 — Finalize (graduate the template; strip build scaffolding)

> Authoritative spec: [`PHILOSOPHY.md`](../PHILOSOPHY.md). This guide expands the Phase 9 row
> into a literal checklist. **This is the only phase that DELETES rather than builds** — it
> transforms the repo from *template-under-construction* into a *built template*. It is
> destructive and recoverable only via git history; guard hard and confirm before running.

**Goal:** Once Phases 1–8 are built and verified, remove the build-time scaffolding (the
`/implement` + `/update` commands and the per-phase guides) and rewrite the build-oriented docs into their
built-state form, so the finished repo carries only its runtime surface — `CLAUDE.md` files,
`scripts/`, the slash commands, `PHILOSOPHY.md` — with no leftover construction artifacts.

---

## Prerequisites

- **Phases 1–8 complete AND verified.** Before deleting anything, confirm the runtime surface
  exists and is green:
  - The `CLAUDE.md` surface (root, `packages/ui`, each product + nested api) and
    `packages/ui/FIGMA.md`.
  - `scripts/{new-product,bootstrap,figma-tokens}.mjs`.
  - The runtime slash commands (`new-product`, `affected`, `typegen`, `release`,
    `add-component`, `sync-tokens`, `bootstrap-design-system`, `add-feature`, the `ptfm-*`
    pipeline).
  - `products/_template` builds and a `demo` product was stamped (Phase 7 proof).
  - `turbo run lint typecheck test build` green; the api gates (Ruff/pyright/pytest) green.
- **If any of the above is missing or red, STOP.** Do NOT strip scaffolding on an incomplete or
  unverified build — that destroys the only instructions for finishing it.

---

## Build steps

### Step 1 — Guard + confirm (destructive gate)

Verify the Prerequisites programmatically (the `CLAUDE.md` surface + `scripts/` exist; a clean
`turbo run build lint test`). Then **surface to the user that this is destructive and
irreversible-except-via-git, list exactly what will be deleted and rewritten, and wait for
explicit confirmation.** Do not proceed on inference.

### Step 2 — Trim `PHILOSOPHY.md`

Remove the references that will dangle once the guides are gone:
- The **execution-guides callout** (the `Phase 1 … Phase 9` link list).
- The **phases table** (`| # | Build | Verify |`) — or replace it with a single line:
  *"Built from the per-phase guides (removed at finalize; see git history)."*

Keep everything else in `PHILOSOPHY.md` intact — it remains the architecture/decision gospel.
Keep the `docs/research/` provenance line **only if** `docs/research/` is kept (Step 5).

### Step 3 — Rewrite `README.md` into its built-state form

The README stops being a build runbook and becomes pure project reference. **Remove** the
build-process sections: `## Status` (the "not built yet" framing) and `## Stage 1 — build the
template` (the `/implement 1…9` list). **Keep + renumber** `## Stage 2 — create a product` →
`## Create a product`. **Keep:** the intro, `## Tech stack`, `## Prerequisites`, `## Repository
layout`, `## Conventions`, `## Operational stack` + the `ptfm-*` pipeline, and `## Where to read
more` (drop its `docs/phase-*.md` row). Result: "what it is → what it's built with →
prerequisites → create & run a product → layout → conventions → workflow → where to read more."

### Step 4 — Delete the build-time commands

`rm .claude/commands/implement.md .claude/commands/update.md` — `/implement` (the build-phase
command) and `/update` (the template **maintainer's** research-refresh command) are template
machinery; a finished product repo carries neither. Finalize runs only in a *consumer's* copy
of the template, so sweeping both out is correct — the maintained template repo itself is never
finalized.

### Step 5 — Delete the phase guides

`rm docs/phase-*.md` — **all** per-phase guides, including this one. Their durable conventions
already live in the `CLAUDE.md` surface.

`docs/research/`: **kept by default** (the stack-choice fact-check / audit trail — low cost,
useful provenance). Deleting it is an explicit opt-in; if you delete it, also remove
`PHILOSOPHY.md`'s `docs/research/` pointer (Step 2). State which you did in the report.

### Step 6 — Verify no dangling references

`git grep -nE 'docs/phase-|commands/(implement|update)\b'` must return nothing (a stray mention
inside a kept `docs/research/` report is acceptable — it's historical). Confirm the runtime surface is
intact and the daily commands still resolve (`pnpm new-product`, `/add-feature`, the `ptfm-*`
pipeline, `pnpm bootstrap`).

### Step 7 — Commit

`chore: finalize template — strip build scaffolding` (a single commit; the deletions + the
PHILOSOPHY/README rewrites land together).

---

## Verification

- `.claude/commands/implement.md` + `.claude/commands/update.md` are gone; `ls docs/phase-*.md` returns nothing.
- `README.md` has no `## Status` / `## Stage 1` / `## Post-setup cleanup` sections.
- `PHILOSOPHY.md` has no execution-guides callout or phases table (no links to deleted files).
- `git grep -nE 'docs/phase-|commands/(implement|update)\b'` is clean (modulo kept research history).
- The runtime surface is untouched: `scripts/`, the `CLAUDE.md` files, `packages/ui/FIGMA.md`,
  the `ptfm-*` + thin-wrapper commands, `PHILOSOPHY.md`.

## Definition of done

- [ ] Guard passed (Phases 1–8 verified) and the user confirmed the destructive run.
- [ ] `PHILOSOPHY.md` trimmed (callout + table removed; rest intact).
- [ ] `README.md` rewritten to built-state form (no build-process sections).
- [ ] `.claude/commands/implement.md` + `.claude/commands/update.md` deleted.
- [ ] `docs/phase-*.md` deleted (research kept-or-deleted decision stated).
- [ ] No dangling references; runtime surface intact; daily commands resolve.
- [ ] One commit.

## Commits

A single `chore: finalize template — strip build scaffolding`.

## Gotchas & pitfalls

- **Never run before Phases 1–8 are verified.** This phase deletes the only instructions for
  building the template — running it early is unrecoverable except via git.
- **It removes the command that runs it.** Deleting `.claude/commands/implement.md` (+
  `update.md`) and this guide is the intended final act; do the deletions last.
- **Recoverable only via git history** — there is no in-tree undo. The destructive-gate
  confirmation (Step 1) exists for exactly this reason.

## Open questions / deferred

- **`docs/research/` retention** — kept by default; whether to delete it is a per-team call
  (audit trail vs. minimal tree). Surfaced at Step 5, not decided here.
