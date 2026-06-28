---
description: Refresh the ENTIRE template to the latest — re-run deep web research for every surface/phase against current official docs, then fold the findings into the research reports, PHILOSOPHY.md, every phase guide & playbook, the ptfm commands, and the README. Research is compulsory; if web research is unavailable, STOP.
argument-hint: "[surface|phase | 'all'] [extra instructions]"
---

You are the **updater** for this monorepo template. Your job: bring the **entire** template up
to date with current reality — newest stable versions, changed APIs, deprecations, breaking
changes, and shifted best practices — by doing **deep web research against official sources**,
then reconciling every finding into the repo's docs. Go surface by surface, one at a time, and
**do not stop until the whole repo is current**.

Engage **maximum reasoning / extended thinking** throughout — this is a high-stakes, wide-blast
update; correctness and consistency matter more than speed.

## ⛔ HARD GATE — web research is COMPULSORY

Before anything else, confirm you can actually fetch **current** web content:
- A working web-search + web-fetch capability (e.g. WebSearch + WebFetch), or the
  `deep-research` skill.
- Verify it live: fetch one official source (e.g. the Expo or FastAPI releases page) and
  confirm you got a real, current response.

**If you cannot do live web research, STOP immediately and report that the update cannot run.**
Do NOT update versions or "facts" from training knowledge alone — stale pins are exactly what
this command exists to prevent. No research → no update. This is non-negotiable.

## Arguments

Raw args: `$ARGUMENTS`. Optional leading **surface/phase selector** (a surface key like
`expo`, `supabase`, `testing`, a phase number `1`–`8`, or `all`); default = **`all`**. Any
remaining text is extra instructions for this run. With `all` (the default), update every
surface, sequentially, and do not stop until all are done.

## Canonical sources (read first, every run)

- **`PHILOSOPHY.md`** — the gospel: Decision Sheet, key rulings, **locked version baseline**,
  conventions, the "Stack provenance" note. `/update` is the **sanctioned mechanism** for
  changing a locked version — but only with research + rationale recorded (see rules).
- **`docs/research/*.md`** — the 11 per-surface fact-check reports (with source URLs + dates).
  These are your starting baseline and your primary update target.
- **`docs/phase-*.md`** — the per-phase build guides + playbooks.
- **`README.md`** — the canonical project reference (Tech stack tables, etc.).
- The `.claude/commands/ptfm-*.md` pipeline + `packages/ui/FIGMA.md` where they pin versions.

## The surfaces (cover ALL of these, one by one)

Map to the existing research reports + the phase guide(s) each feeds:

| Surface (research report) | Primarily feeds |
|---|---|
| `01-monorepo-build` (pnpm, Turborepo, mise, Node) | Phase 1 |
| `02-expo-rn-eas` (Expo SDK, RN, React, EAS) | Phases 2 / 5 / 8 |
| `03-styling-ui` (NativeWind, Tailwind, rn-reusables, @rn-primitives) | Phase 2 |
| `04-data-state-typegen` (TanStack Query, Zustand, hey-api) | Phases 2 / 4 |
| `05-storybook-vr` (Storybook, react-native-web-vite) | Phase 2 |
| `06-figma` (Code Connect, Variables API, Style Dictionary) | Phase 2 |
| `07-backend-python` (FastAPI, Pydantic, SQLModel, Alembic, Ruff, uv, pyright) | Phase 3 |
| `08-supabase` (Auth/JWKS, pooler, RLS, CLI) | Phase 6 |
| `09-electron` (Electron, builder, updater) | Phase 5 |
| `10-cicd-infra` (GitHub Actions, Vercel, Fly, EAS) | Phase 8 |
| `11-testing` (jest-expo, RNTL, pytest, Playwright, Maestro) | Phases 2 / 3 / 8 |

## Procedure — per surface (repeat for every surface, in order)

1. **Re-research, deep + current.** For every tool/version/API the surface covers, fetch the
   **official** source (release notes, changelog, docs, the package registry) and determine:
   the current stable version, any breaking changes / deprecations / renamed APIs since the
   report's last date, and any shifted best practice. Cross-check claims; prefer primary
   sources. Capture **source URL + access date** for every finding. (You may delegate the
   per-surface searches to subagents, but YOU own the reconciliation and consistency.)
2. **Diff vs. the locked choices.** Compare findings against `PHILOSOPHY.md`'s locked versions /
   rulings and the surface's research report. Classify each delta: *version bump*, *API change*,
   *deprecation*, *new gotcha*, *best-practice shift*, or *no change*.
3. **Refresh `docs/research/<surface>.md`.** Update findings, version numbers, verdicts, and the
   source URLs + date. Keep the report's structure; update its header date.
4. **Fold corrections everywhere they live.** Propagate each confirmed delta into: the relevant
   **phase guide(s)** (code/config skeletons, version pins, prose, gotchas, playbooks), the
   **`PHILOSOPHY.md`** Decision Sheet / rulings / locked-version baseline / gotchas, the
   **README** Tech stack tables, the **ptfm-\*** commands and `packages/ui/FIGMA.md` where they
   pin a version or name an API, and any `CLAUDE.md` once those exist. Update EVERY occurrence —
   grep for the old version/API across the repo so nothing dangles.
5. **Verify consistency.** No contradictory versions across files; no dangling refs; cross-links
   intact; repo-relative paths only; no `creator`/old-clone-dir leakage. Run a grep sweep for
   the surface's old pins to confirm full propagation.
6. **Commit** this surface: `chore(update): refresh <surface> — <old→new headline>` with the
   key source URLs in the body.

Then move to the next surface. **Do not stop until every surface in scope is done**, the README
+ PHILOSOPHY reflect the new baseline, and the repo is internally consistent.

## ABSOLUTE, NON-NEGOTIABLE RULES

- **No research, no change.** Every version bump / API change / new gotcha MUST be backed by a
  **live official source** captured with a URL + access date. Never bump a pin from memory. If a
  fact can't be verified against a current source, leave it and flag it — don't guess.
- **Web research is mandatory (the hard gate above).** If the capability is missing or broken,
  STOP the whole command — do not "update" from training knowledge.
- **Record every locked-decision change.** Changing a locked version is a deliberate decision:
  log old → new + one-line rationale + source in the research report AND update PHILOSOPHY's
  baseline. The whole point of `/update` is to make these changes *with evidence*.
- **Propagate completely.** A version/API that changes must change in ALL of: research report,
  phase guide(s), PHILOSOPHY, README, ptfm commands, FIGMA.md — wherever it appears. Grep to
  prove it; a half-updated pin is a bug.
- **Preserve the architecture unless research forces a change.** Refresh versions/APIs/best
  practices freely. But if research shows a *locked architectural choice* is dead (a framework
  fully deprecated with no in-paradigm successor), **STOP and surface that to the user** with the
  evidence — do not silently swap a pillar of the stack.
- **Maximum reasoning.** Think hard; verify; don't pattern-match. Prefer primary sources over
  blog posts; confirm breaking changes against the changelog, not a summary.
- **Do not stop until done.** With `all` (default), every surface is updated, committed, and the
  repo is consistent before you finish. Partial updates that leave mixed versions are failures.
- Repo-relative paths only; never the old clone-dir name; keep `PHILOSOPHY.md` the gospel.

## Report (at the end)

A per-surface summary: each confirmed delta as `old → new` with its source URL + date, the files
touched, anything left unverified (with why), and any architectural change you stopped to surface.
State plainly that every change is backed by a live source — or that the run was aborted at the
hard gate because web research was unavailable.
