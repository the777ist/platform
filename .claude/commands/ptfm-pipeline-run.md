---
description: Run the ptfm execution pipeline (plan → implement → audit → simplify → commonify → review → test-ui) as a CHECKPOINTED orchestrator — one fresh subagent per stage with that stage's full instructions, halting at every human gate with a terminal question + push notification, resuming the same run or a dead one by re-deriving position from the artifacts on disk. One run = one phase ticket. /ptfm-product and /ptfm-architect stay human-driven.
argument-hint: "<product> <ticket-id> [stage] [primary user instruction]"
---

Args: $ARGUMENTS

Expected shape: `<product> <TICKET-ID> [stage] [primary user instruction]`

- **`<product>`** — first token; else infer from cwd (`products/<name>/...`); else STOP and ASK. Confirm `products/<product>/` exists.
- **`<TICKET-ID>`** — the PHASE ticket (one run = one phase; an epic is N runs). Same resolution as every stage: explicit token, else the branch, matched case-insensitively and normalised to UPPERCASE.
- **`[stage]`** — optional explicit entry override (`plan|implement|audit|simplify|commonify|review|test-ui`). Without it, entry is DETECTED (below). With it, detection still runs and a mismatch is surfaced at the kickoff checkpoint rather than silently obeyed.
- **`[primary user instruction]`** — freeform guidance threaded into EVERY stage's spawn as its own `[primary user instruction]`. It never overrides a stage's absolute rules.

You are the ORCHESTRATOR. You do not plan, implement, audit, review, or test anything yourself — stages do, each in a fresh subagent carrying its complete instructions. Your job is: resolve position, spawn stages one at a time, relay gates to the user, verify the floor between stages, keep the ledger true, and stop cleanly.

---

## Why this shape (read once, it explains every rule below)

- **Fidelity**: each `ptfm-*.md` is a mega-prompt. Seven of them plus real work cannot share one context — later stages would run on a compacted memory of their instructions. A fresh subagent per stage runs on the FULL text, every time.
- **Artifacts are the interface**: the stages already hand off through `docs/{product,architecture,plans,implementation,reviews}/` and resolve their slug from filenames. You add no new state channel — the ledger is a record, never the authority for anything a hard artifact can prove.
- **Checkpointed by decision**: every place a stage's instructions say STOP-and-ASK becomes a halt that reaches the user (terminal + push). There is no policy file, no auto-approve. The user is the gate.
- **Resume IS entry**: a run that died, was abandoned, or finished a gate the user never answered is resumed by running this command again — position is re-derived from disk, mid-stage progress is preserved to whatever granularity the stage's own artifacts capture (the implementation log's as-you-go batches, the playbook's checked cases).

## Step 1 — Resolve and preflight

1. Resolve `<product>`, `<TICKET-ID>`, and the slug (the standard ladder: explicit arg → existing artifact filename → branch → title). Uppercase the ticket everywhere.
2. Preflight per the pre-flight rule: name anything already visible that will block — a missing upstream architecture doc when the plan will need one, MCPs the stages will want that are absent/unauthenticated, a product stack that is down for implement/test-ui. Surface them ALL at once at the kickoff checkpoint; a surfaced blocker is the user's to answer while you proceed on what is not blocked.

## Step 2 — Entry detection + the kickoff checkpoint

Run the tested detector — never re-derive its logic in prose:

```bash
node scripts/ptfm-stage.mjs <product> <TICKET-ID>
```

It walks the ticket's artifacts (plan file → implementation log → audit's `## Feature file inventory` section → ledger boxes for simplify/commonify → review report → playbook) and prints the next stage + the reason. Disk is truth for artifact stages; only simplify/commonify advance via the ledger.

**KICKOFF CHECKPOINT (always, even on a fresh run):** present to the user — the detected stage and its reason, the explicit `[stage]` override if one was given (and any mismatch with detection), the preflight blockers, and the remaining stage sequence. WAIT for confirmation before spawning anything. This is where a wrong read gets corrected for free.

## Step 3 — The stage loop

For each stage from the entry point to `test-ui`, in order:

1. **Compose the spawn prompt**: read `.claude/commands/ptfm-<stage>.md` IN FULL and pass it VERBATIM — never summarised, never excerpted — preceded by this harness preamble (adapt the bracketed values):

   > You are running as one stage of a checkpointed pipeline (`/ptfm-pipeline-run`). Execute the stage instructions below exactly, with `$ARGUMENTS` = `[<product> <TICKET-ID> <slug> <primary user instruction>]`. Three overrides, and only these: (1) wherever the instructions say to STOP and ASK the user, do not stall — return a result of `BLOCKED` with the exact question and the minimal context needed to answer it; the orchestrator relays it to the human and will send you the answer to continue with. (2) Ignore the "Next stage" section — the orchestrator owns sequencing; when your deliverables are complete, return `DONE` with a summary and the paths of every artifact you wrote. (3) If you are genuinely unable to finish AFTER exhausting your instructions' persistence ladder, return `FAILED` with what you tried and what you observed. Your final message MUST end with exactly one of `RESULT: DONE`, `RESULT: BLOCKED`, or `RESULT: FAILED` and its payload.

2. **Spawn it as a subagent** (general-purpose; it needs full tools). Record `entered` in the ledger.

   **Model — do NOT pass a `model` override.** Omitting it makes each stage inherit the
   orchestrator's model, which is the design: the operator picks the capability for a whole run
   by choosing the model they invoke `/ptfm-pipeline-run` with, and nothing here hardcodes a
   model name that would rot as models change or suit one org's cost appetite and not another's.
   These stages do the heaviest work in the repo — TDD implementation cycles, adversarial
   security review, whole-browser test passes — so they are the LAST place to economise; a run
   is only as good as the model executing its stages.
   **The trap:** a configured default-subagent-model (settings' subagent-model setting, or a
   `model:` in an agent definition's frontmatter) takes precedence over inheritance, so it can
   silently downgrade every stage — no error, no warning, only output that quietly gets worse.
   If a clone's config does that, either remove the default or pass an explicit `model` on each
   spawn so the choice is visible; do not let a stage run on an unknown model.

3. **On `BLOCKED`**: append the question to the ledger (so a dead session still re-surfaces it), print it to the user, and send a push notification (load `PushNotification` via ToolSearch if deferred; one line: which ticket, which stage, the question's first clause). WAIT. Relay the user's answer INTO THE SAME SUBAGENT via SendMessage — it continues with its context intact. A stage may block more than once; loop.
4. **On `DONE`**: run the TRUST-BUT-VERIFY floor before advancing —
   - the stage's expected artifact physically exists (`node scripts/ptfm-stage.mjs` must no longer name this stage);
   - the stage's own cheap gates are green: for implement/audit/simplify/commonify at minimum `pnpm turbo run lint typecheck test --filter=...{products/<product>/app} --filter=...{products/<product>/api} --filter=...{products/<product>/api-client}` plus `node scripts/check-typegen-drift.mjs` when the API surface changed; for plan/review/test-ui, the artifact check plus prettier cleanliness of what they wrote.
     A `DONE` that fails the floor is a `FAILED` — treat it as such, verbatim gate output in hand.
5. **On `FAILED`** (returned or demoted): halt the pipeline. Ledger the reason, push a notification, and report: what the stage tried, the gate output, and that re-running this command resumes at this stage. Do NOT advance past a failure, ever.
6. Tick the stage's ledger box, append its summary, and continue to the next stage.

## Step 4 — The ledger

`products/<product>/docs/implementation/<TICKET-ID>-<slug>_pipeline.md` — a WRITE-tier doc (the doc-tier rules apply; it never touches the brief or architecture). Maintain it AS EVENTS HAPPEN, not at the end:

```
# <TICKET-ID> pipeline run ledger

- [x] plan — DONE <iso-time> (artifacts: docs/plans/...)
- [x] implement — DONE <iso-time>
      gate: "<question>" → answered: "<answer>"
- [ ] audit — BLOCKED <iso-time>: "<pending question>"
```

Checked box = stage completed AND floor-verified. The pending-question line is what lets a resumed run re-ask instead of forgetting. `scripts/ptfm-stage.mjs` reads only the checked boxes, and only for simplify/commonify.

## Step 5 — Completion

When `test-ui` passes the floor: final ledger entry, push notification, and a report containing — stages run and their one-line outcomes, every gate Q&A, artifacts produced, the four-gates status, and **the next phase's sub-issue** (from the architecture doc's handoff brief) so the user can fire the next `/ptfm-pipeline-run` with one paste. One run = one phase; you never start the next phase yourself.

## ABSOLUTE, NON-NEGOTIABLE RULES

- **Stages get their instructions VERBATIM and IN FULL.** Summarising a stage's command file into the spawn prompt defeats the entire design; if a file cannot be read, that is a FAILED run, not an improvised stage.
- **Never advance past a gate on the user's behalf.** No default answers, no timeouts, no "reasonable assumption" — the checkpointed stance was chosen explicitly over a policy file. An unanswered gate is where the run stays.
- **Never advance past a red floor.** A stage's word is not verification.
- **One stage at a time, in order.** No parallel stages, no skipping (an explicit `[stage]` entry point skips PRIOR stages, never interior ones).
- **The orchestrator writes only the ledger.** Every product/plan/implementation/review artifact belongs to its stage; the brief and architecture are read-only for the whole run (doc tiers).
- **Push notifications fire on exactly three events** — BLOCKED, FAILED, COMPLETE — and never for routine progress.
- **This command owns plan → test-ui only.** If detection says the plan is missing AND no architecture/brief exists to plan from, stop at the kickoff checkpoint and hand the user `/ptfm-plan`'s own guidance — do not spawn `product` or `architect`; their debates need the human in the driver's seat, not at a checkpoint.

What `/ptfm-pipeline-run` does NOT mean:

- Not an epic runner — one run, one phase ticket (`--all-phases` is a possible later flag, on this same machinery).
- Not unattended — gates reach a human, always.
- Not a replacement for running a single stage by hand: `/ptfm-implement` etc. still work standalone, and work done standalone is picked up by detection (disk is truth).

Works anywhere a session runs — including a devbox tmux: fire it, detach, answer gates when pushed, re-attach.
