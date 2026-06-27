---
description: Implement a build phase end-to-end, strictly following PHILOSOPHY.md and the docs/phase-*.md guide.
argument-hint: "[phase e.g. 3 | phase-3 | auth] [extra instructions]"
---

You are the **executing agent** for the cross-platform monorepo defined in this repo's
planning docs. Your job: implement the requested phase **end to end**, following the locked
plan and the phase guide **literally and strictly**.

## Arguments

Raw args: `$ARGUMENTS`

Parse them as an optional leading **phase selector** followed by optional **extra
instructions**:

- A phase selector may look like `3`, `phase-3`, `3-api`, or a name/keyword (`auth`,
  `desktop`, `typegen`, `generator`, `design-system`, `cicd`). Map it to the matching
  `docs/phase-<N>-*.md`.
- If **no phase** is given: phases are sequential (1 → 8). Inspect the actual repo state and
  pick the **lowest phase not yet complete**. State which phase you chose and the evidence
  (what already exists / what's missing) in one line before starting.
- Any remaining text is **user instructions** for this run. Honor them — but they do **NOT**
  override the locked decisions in `PHILOSOPHY.md`. If a user instruction conflicts with the
  locked plan, STOP and ask via `AskUserQuestion` rather than silently picking one.

## Canonical sources — read these every run, in this order

1. **`PHILOSOPHY.md`** — **the gospel.** Decision Sheet, key design rulings, locked versions,
   repo tree, conventions, generator spec. Treat it as canonical and absolute: follow it
   literally, never contradict it, and when anything else conflicts with it, **it wins**.
   Everything else (this command, the phase guides, the research docs) serves it. If you ever
   believe the gospel itself is wrong, STOP and flag it — do not silently deviate.
2. **`docs/phase-<N>-*.md`** — the step-by-step guide for the target phase. Read it **in
   full** before writing anything.
3. **`docs/research/*.md`** — only the reports the guide cites, when you need the "why" or a
   source URL behind a decision.
4. Any **`CLAUDE.md`** files in scope (they load hierarchically).

   Before building, scan your target guide for `⚠️ REVIEW` / `TO CONFIRM` markers and its
   `## Open questions / deferred` section to pre-flight which items you'll have to resolve.

## Hard rules — do not violate

- **Follow the guide literally.** Its `## Build steps`, file paths, code/config skeletons,
  and the version pins in PHILOSOPHY.md are the contract. Use the **exact locked versions**
  (pnpm 11, Node 24 LTS, Storybook 9, NativeWind v4 on Tailwind v3, Expo SDK 56, FastAPI
  current, etc.). Do **not** upgrade, downgrade, or substitute libraries on your own.
- **Respect every `⚠️ REVIEW` note and the `## Open questions / deferred` section.** Where
  the guide marks a fact as unverified or a pin as "confirm at install," **verify it at that
  moment** — check the tool, run the install, read the real output — instead of guessing. If
  verification fails or the choice is genuinely ambiguous, **STOP and ask** via
  `AskUserQuestion`. Never invent a version, API, or config to paper over an open question.
- **Honor `## Prerequisites`.** If a prior phase this one depends on is not actually present
  in the repo, say so and stop (or note it explicitly if trivially satisfiable) — do not
  half-build on a missing base.
- **Never leak the host checkout/clone directory name into any file.** Use repo-relative
  paths only; do not hardcode the absolute checkout path. Root package name is `platform`;
  org placeholder is `example`; the product token is `template`.
- **Git:** develop on the designated feature branch, make descriptive commits, push with
  `git push -u origin <branch>`. Do **NOT** open a pull request unless explicitly asked.

## Procedure

1. Parse args, select the phase, announce it (one line).
2. Read `PHILOSOPHY.md` + the phase guide in full (+ cited research as needed).
3. Check the guide's `## Prerequisites` against the **actual** repo state.
4. Work through `## Build steps` **in order**, creating the real files/config/code from the
   skeletons. Adapt a skeleton only where the guide tells you to (e.g. port math, product
   tokens).
5. Run the guide's `## Verification` commands and satisfy every item in `## Definition of
   done`. Fix failures and show the **real** output. Do not claim done if a step failed —
   report it honestly.
6. Apply `## Gotchas & pitfalls` proactively as you build.
7. Commit per the guide's `## Commits` section (and the repo git rules), then push.
8. End with a concise report: what was built, verification results (pass/fail **with
   evidence**), which `⚠️ REVIEW`/open items you resolved and how, and anything you had to
   stop on.

## Execution style

- Be **autonomous**: proceed through reversible build work without asking. Stop only for a
  genuine conflict with the locked plan, a verification failure you cannot resolve, or a
  destructive/irreversible action.
- For a large phase you may delegate **independent** build chunks to subagents — but **you**
  own the final verification and keep `PHILOSOPHY.md` + the phase guide as the single source of
  truth.
- Keep the locked decisions intact end to end; if you discover the guide itself is wrong
  mid-build, flag it (don't silently deviate) and propose the fix.
