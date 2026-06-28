---
description: Refresh a build phase (or the whole template) to the latest — re-run deep web research against current official docs for that phase's stack, then fold findings into the phase guide, the research reports, PHILOSOPHY.md, the ptfm commands, and the README. Maps to phases EXACTLY like /implement. Research is compulsory; if web research is unavailable, STOP.
argument-hint: "[phase e.g. 3 | all] [extra instructions]"
---

You are the **maintainer's updater** for this monorepo template. Where `/implement <N>` *builds*
phase N, `/update <N>` *refreshes* phase N against current reality — newest stable versions,
changed APIs, deprecations, breaking changes, shifted best practices — by doing **deep web
research against official sources**, then reconciling every finding back into the repo's docs.
**`/update <N>` targets the exact same phase as `/implement <N>` (`docs/phase-<N>-*.md`).**

Engage **maximum reasoning / extended thinking** — wide blast radius; correctness + consistency
matter more than speed.

## ⛔ HARD GATE — web research is COMPULSORY

Before anything else, confirm you can fetch **current** web content:
- A working web-search + web-fetch capability (e.g. WebSearch + WebFetch), or the
  `deep-research` skill.
- Verify it live: fetch one official source (e.g. the Expo or FastAPI releases page) and
  confirm a real, current response.

**If you cannot do live web research, STOP immediately and report that the update cannot run.**
Never update versions or "facts" from training knowledge alone — stale pins are exactly what
this command exists to prevent. No research → no update. Non-negotiable.

## Arguments

Raw args: `$ARGUMENTS`. A leading **phase selector** maps **exactly like `/implement`**:

- **`/update <N>`** — `N` is `1`–`9` (or a phase keyword: `root-tooling`, `design-system`,
  `api`, `typegen`, `desktop`, `auth`, `generator`, `cicd`, `finalize`). Resolves to the single
  guide `docs/phase-<N>-*.md` — the **same exact phase** `/implement <N>` builds. Refresh that
  phase only (plus propagate any *shared-version* change everywhere — see rules).
- **No phase (or `all`)** — refresh **every phase, 1 → 9, sequentially**, and do not stop until
  all are done and the repo is internally consistent.

Any remaining text is extra instructions for this run.

## What each phase covers (the stack to re-verify, and which research report backs it)

| Phase | Stack to re-research against current official docs | Research report(s) |
|---|---|---|
| 1 root-tooling | pnpm, Turborepo, mise, Node LTS, lefthook | `01-monorepo-build` |
| 2 design-system | Expo SDK/RN/React, NativeWind+Tailwind, react-native-reusables + `@rn-primitives`, Storybook + `react-native-web-vite`, Figma Code Connect/Variables + Style Dictionary, TanStack Query/Zustand, jest-expo/RNTL | `02-expo`, `03-styling`, `04-data`, `05-storybook`, `06-figma`, `11-testing` |
| 3 api | FastAPI, Pydantic, SQLModel, Alembic, uv, Ruff, pyright, `uuid-utils`, slowapi, pytest | `07-backend`, `11-testing` |
| 4 typegen | `@hey-api/openapi-ts` + the TanStack Query plugin | `04-data` |
| 5 desktop | Electron, electron-builder, electron-updater, the Expo web export | `09-electron`, `02-expo` |
| 6 auth | Supabase (Auth/JWKS, pooler, RLS, CLI, Storage) | `08-supabase` |
| 7 generator | (plain-Node generator — only its pnpm/Node assumptions) | — *(currency review; no external stack)* |
| 8 cicd | GitHub Actions, Vercel, Fly, EAS, Sentry, Playwright/Maestro | `10-cicd`, `02-expo`, `11-testing` |
| 9 finalize | (procedure only — no external stack) | — *(consistency review only)* |

Phases 7 & 9 have **no pinned external stack** — there `/update` is a currency/consistency
review of the guide, not a version refresh.

## Canonical sources (read first, every run)

- **`PHILOSOPHY.md`** — the gospel: Decision Sheet, key rulings, **locked version baseline**,
  the "Stack provenance" note. `/update` is the **sanctioned mechanism** for changing a locked
  version — but only with research + rationale recorded.
- **`docs/phase-<N>-*.md`** — the target phase guide (+ its playbooks).
- **`docs/research/<...>.md`** — the research report(s) backing the phase (table above). Your
  starting baseline and a primary update target.
- **`README.md`** (Tech-stack tables), the `.claude/commands/ptfm-*.md` pipeline, and
  `packages/ui/FIGMA.md` — wherever a version/API is pinned or named.

## Procedure — for the target phase (repeat per phase when `all`, in order 1 → 9)

1. **Re-research, deep + current.** For every tool/version/API in the phase's scope (table),
   fetch the **official** source (release notes, changelog, docs, registry) and determine: the
   current stable version, any breaking change / deprecation / renamed API since the report's
   date, and any shifted best practice. Cross-check; prefer primary sources. Capture **source
   URL + access date** per finding. (You may delegate the searches to subagents; YOU own the
   reconciliation.)
2. **Diff vs. the locked choices** — PHILOSOPHY baseline + the phase guide + the research
   report. Classify each delta: *version bump*, *API change*, *deprecation*, *new gotcha*,
   *best-practice shift*, or *no change*.
3. **Refresh the phase's research report(s)** — findings, versions, verdicts, source URLs, and
   the header date.
4. **Update `docs/phase-<N>-*.md`** — code/config skeletons, version pins, prose, gotchas,
   playbooks.
5. **Propagate every confirmed delta EVERYWHERE it appears** — PHILOSOPHY (Decision Sheet /
   rulings / locked-version baseline / gotchas), the README Tech-stack tables, the `ptfm-*`
   commands + `FIGMA.md`, and — **critically — any OTHER phase guide that shares the changed
   version** (e.g. an Expo SDK bump on `/update 2` must also update Phases 5 & 8). Grep the old
   pin across the whole repo so nothing dangles.
6. **Verify consistency, then commit** — `chore(update): phase <N> — <old→new headline>` with
   the key source URLs in the body.

When `all`: do every phase 1 → 9 in order; **do not stop** until all are done and the repo is
internally consistent (no mixed versions, no dangling refs).

## ABSOLUTE, NON-NEGOTIABLE RULES

- **No research, no change.** Every version bump / API change / new gotcha MUST be backed by a
  **live official source** captured with a URL + access date. Never bump a pin from memory; if
  a fact can't be verified against a current source, leave it and flag it.
- **Web research is mandatory** (the hard gate). Missing/broken capability → STOP the command.
- **Record every locked-decision change** — old → new + one-line rationale + source, in the
  research report AND PHILOSOPHY's baseline. `/update` makes these changes *with evidence*.
- **Propagate completely.** A single `/update <N>` still fixes a shared version in EVERY file it
  appears (other phase guides, PHILOSOPHY, README, ptfm commands, FIGMA.md). Grep to prove it; a
  half-updated pin is a bug.
- **Preserve the architecture unless research forces a change.** Refresh versions/APIs/best
  practices freely; but if research shows a *locked architectural pillar* is dead (a framework
  fully deprecated with no in-paradigm successor), **STOP and surface it to the user** with the
  evidence — never silently swap a pillar.
- **Maximum reasoning.** Verify against changelogs, not summaries; primary sources over blogs.
- **Do not stop until done.** For `all`, every phase is refreshed, committed, and consistent
  before you finish. Mixed-version partial states are failures.
- Repo-relative paths only; never leak the host checkout/clone directory name; keep
  `PHILOSOPHY.md` the gospel.

## Report (at the end)

Per phase: each confirmed delta as `old → new` with its source URL + date, the files touched
(incl. cross-phase propagation), anything left unverified (with why), and any architectural
change you stopped to surface. State plainly that every change is backed by a live source — or
that the run aborted at the hard gate because web research was unavailable.
