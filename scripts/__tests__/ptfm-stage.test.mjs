// Entry detection for /ptfm-pipeline-run: given a product + ticket, which stage runs next?
//
// This is the one piece of the orchestrator where drift would be SILENT — a wrong answer
// doesn't error, it runs the wrong stage against half-built artifacts — so it gets the
// machinery treatment (pure function + tests) instead of living as prose in the command doc.
//
// The rules mirror the pipeline's own artifact contract:
//   - plan/implement/audit/review/test-ui leave HARD artifacts (a file, or a mandated
//     section), so they are detected from disk even for work never run under the
//     orchestrator.
//   - simplify/commonify leave no mandated artifact (they comb and relocate); they are
//     tracked via the run LEDGER, and assumed pending when no ledger says otherwise —
//     safe, because both are idempotent passes that no-op on already-clean code.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { STAGES, detectStage, ledgerDone } from "../ptfm-stage.mjs";

/** Build a fake products/<p>/docs tree with the named artifacts present. */
function scaffold(artifacts = {}, ledger = null) {
  const root = mkdtempSync(join(tmpdir(), "ptfm-stage-"));
  const docs = join(root, "products", "pad", "docs");
  for (const dir of ["product", "architecture", "plans", "implementation", "reviews"]) {
    mkdirSync(join(docs, dir), { recursive: true });
  }
  const T = "BMK-1-item-bookmarks";
  if (artifacts.plan) writeFileSync(join(docs, "plans", `${T}_plan.md`), "# plan\n");
  if (artifacts.impl) {
    writeFileSync(
      join(docs, "implementation", `${T}_implementation.md`),
      artifacts.inventory
        ? "# log\n\n## Feature file inventory\n\n| f |\n"
        : "# log\n\n## What got built\n",
    );
  }
  if (artifacts.review) writeFileSync(join(docs, "reviews", `${T}_review.md`), "# review\n");
  if (artifacts.playbook) {
    writeFileSync(join(docs, "implementation", `${T}_testing_playbook.md`), "# playbook\n");
  }
  if (ledger) writeFileSync(join(docs, "implementation", `${T}_pipeline.md`), ledger);
  return root;
}

const detect = (root) => detectStage({ product: "pad", ticket: "BMK-1", root });

test("the stage order is the pipeline's execution half, in order", () => {
  assert.deepEqual(STAGES, [
    "plan",
    "implement",
    "audit",
    "simplify",
    "commonify",
    "review",
    "test-ui",
  ]);
});

test("no artifacts at all -> enter at plan", () => {
  const root = scaffold();
  try {
    assert.equal(detect(root).stage, "plan");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plan exists, no implementation log -> implement", () => {
  const root = scaffold({ plan: true });
  try {
    assert.equal(detect(root).stage, "implement");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("implementation log without the audit inventory section -> audit", () => {
  // The inventory is audit's MANDATED final section — its absence is what distinguishes
  // "implement wrote its log" from "audit reconciled it".
  const root = scaffold({ plan: true, impl: true });
  try {
    assert.equal(detect(root).stage, "audit");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("audited but no ledger -> simplify (idempotent stages are assumed pending)", () => {
  const root = scaffold({ plan: true, impl: true, inventory: true });
  try {
    const result = detect(root);
    assert.equal(result.stage, "simplify");
    assert.match(result.reason, /ledger/i, "the reason must say WHY simplify is assumed pending");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the ledger advances simplify and commonify — they have no artifact of their own", () => {
  const ledger = "# run\n- [x] simplify — DONE\n";
  const root = scaffold({ plan: true, impl: true, inventory: true }, ledger);
  try {
    assert.equal(detect(root).stage, "commonify");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("both idempotent stages ledger-done but no review report -> review", () => {
  const ledger = "# run\n- [x] simplify — DONE\n- [x] commonify — DONE\n";
  const root = scaffold({ plan: true, impl: true, inventory: true }, ledger);
  try {
    assert.equal(detect(root).stage, "review");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("review report exists, no playbook -> test-ui", () => {
  const ledger = "# run\n- [x] simplify — DONE\n- [x] commonify — DONE\n";
  const root = scaffold({ plan: true, impl: true, inventory: true, review: true }, ledger);
  try {
    assert.equal(detect(root).stage, "test-ui");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("everything present -> complete (stage null)", () => {
  const ledger = "# run\n- [x] simplify — DONE\n- [x] commonify — DONE\n";
  const root = scaffold(
    { plan: true, impl: true, inventory: true, review: true, playbook: true },
    ledger,
  );
  try {
    const result = detect(root);
    assert.equal(result.stage, null);
    assert.match(result.reason, /complete/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a HARD artifact beats a SILENT ledger — disk is truth for artifact stages", () => {
  // A review report on disk with NO ledger at all (work done outside the orchestrator) must
  // advance past the ledger-tracked stages: blocking on absent bookkeeping would send the
  // pipeline BACKWARDS to simplify when review has already happened. (The first version of
  // this test marked both ledger stages done, so it could never catch that regression —
  // caught by mutation testing.)
  const root = scaffold({ plan: true, impl: true, inventory: true, review: true }, null);
  try {
    assert.equal(detect(root).stage, "test-ui");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ledgerDone reads only checked boxes for the named stage", () => {
  const text = "- [x] simplify — DONE\n- [ ] commonify — BLOCKED: question pending\n";
  assert.equal(ledgerDone(text, "simplify"), true);
  assert.equal(ledgerDone(text, "commonify"), false);
  assert.equal(ledgerDone(text, "review"), false);
  assert.equal(ledgerDone(null, "simplify"), false);
});

test("ticket matching is case-insensitive on the filename, like the resolve ladder", () => {
  const root = mkdtempSync(join(tmpdir(), "ptfm-stage-"));
  try {
    const docs = join(root, "products", "pad", "docs");
    mkdirSync(join(docs, "plans"), { recursive: true });
    mkdirSync(join(docs, "implementation"), { recursive: true });
    mkdirSync(join(docs, "reviews"), { recursive: true });
    writeFileSync(join(docs, "plans", "bmk-1-item-bookmarks_plan.md"), "# plan\n");
    assert.equal(detectStage({ product: "pad", ticket: "BMK-1", root }).stage, "implement");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
