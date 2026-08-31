#!/usr/bin/env node
// scripts/ptfm-stage.mjs — entry detection for /ptfm-pipeline-run: which stage runs next?
//
// The checkpointed pipeline (plan → implement → audit → simplify → commonify → review →
// test-ui) resumes by RE-DERIVING its position from disk, never by remembering it — the same
// artifacts-are-the-state principle as the slug ladder. A wrong answer here is SILENT (the
// wrong stage runs against half-built artifacts), which is why this is a tested pure function
// instead of prose in the command doc.
//
// Two detection classes, mirroring the pipeline's own artifact contract:
//   - HARD-ARTIFACT stages: plan (docs/plans/<T>*_plan.md), implement (the implementation
//     log), audit (the log's mandated `## Feature file inventory` section), review (the
//     report), test-ui (the playbook). Disk is truth — work done OUTSIDE the orchestrator
//     still counts, and a silent ledger never blocks an artifact that exists.
//   - LEDGER stages: simplify and commonify leave no mandated artifact (they comb and
//     relocate). They advance only via the run ledger's checked boxes, and are assumed
//     PENDING when no ledger says otherwise — safe, because both are idempotent passes that
//     no-op on already-clean code.
//
// CLI (what the orchestrator and humans run):
//   node scripts/ptfm-stage.mjs <product> <TICKET-ID>
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The execution half of the pipeline, in order. product/architect are human-driven. */
export const STAGES = ["plan", "implement", "audit", "simplify", "commonify", "review", "test-ui"];

const INVENTORY_HEADING = "## Feature file inventory";

/** Case-insensitive `<TICKET>-*<suffix>` filename match in one docs subdirectory. */
function findArtifact(docsDir, subdir, ticket, suffix) {
  const dir = join(docsDir, subdir);
  if (!existsSync(dir)) return null;
  const prefix = `${ticket.toUpperCase()}-`;
  const match = readdirSync(dir).find(
    (f) => f.toUpperCase().startsWith(prefix) && f.endsWith(suffix),
  );
  return match ? join(dir, match) : null;
}

/** Has the ledger's checkbox for `stage` been ticked? null/absent text means no. */
export function ledgerDone(text, stage) {
  if (!text) return false;
  const re = new RegExp(`^- \\[x\\] ${stage}\\b`, "mi");
  return re.test(text);
}

/**
 * The next stage for this ticket, or `{ stage: null }` when the pipeline is complete.
 * Every answer carries a human-readable `reason` — the orchestrator's kickoff checkpoint
 * shows it to the user for confirmation before anything runs.
 */
export function detectStage({ product, ticket, root = ROOT }) {
  const docs = join(root, "products", product, "docs");

  const plan = findArtifact(docs, "plans", ticket, "_plan.md");
  if (!plan) return { stage: "plan", reason: `no plan doc for ${ticket} under docs/plans/` };

  const log = findArtifact(docs, "implementation", ticket, "_implementation.md");
  if (!log) {
    return { stage: "implement", reason: "plan exists but no implementation log yet" };
  }

  const logText = readFileSync(log, "utf8");
  if (!logText.includes(INVENTORY_HEADING)) {
    return {
      stage: "audit",
      reason: `implementation log lacks audit's mandated "${INVENTORY_HEADING}" section`,
    };
  }

  const ledgerFile = findArtifact(docs, "implementation", ticket, "_pipeline.md");
  const ledger = ledgerFile ? readFileSync(ledgerFile, "utf8") : null;
  // Artifact-stage evidence below can OVERRIDE a quiet ledger (disk is truth); the ledger
  // only ever advances the two stages that have nothing on disk to show for themselves.
  const review = findArtifact(docs, "reviews", ticket, "_review.md");
  const playbook = findArtifact(docs, "implementation", ticket, "_testing_playbook.md");

  if (!ledgerDone(ledger, "simplify") && !review && !playbook) {
    return {
      stage: "simplify",
      reason: ledger
        ? "ledger has no completed simplify entry"
        : "no run ledger — the idempotent stages are assumed pending (they no-op when clean)",
    };
  }
  if (!ledgerDone(ledger, "commonify") && !review && !playbook) {
    return { stage: "commonify", reason: "ledger has no completed commonify entry" };
  }

  if (!review) return { stage: "review", reason: "no review report under docs/reviews/" };
  if (!playbook) {
    return { stage: "test-ui", reason: "no testing playbook under docs/implementation/" };
  }

  return { stage: null, reason: `pipeline complete for ${ticket} — every artifact is present` };
}

// --- CLI ---------------------------------------------------------------------------------------
if (
  process.argv[1] &&
  process.argv[1].split(String.fromCharCode(92)).join("/").endsWith("scripts/ptfm-stage.mjs")
) {
  const [product, ticket] = process.argv.slice(2);
  if (!product || !ticket) {
    console.error("usage: node scripts/ptfm-stage.mjs <product> <TICKET-ID>");
    process.exit(2);
  }
  if (!existsSync(join(ROOT, "products", product))) {
    console.error(`❌ ptfm-stage: products/${product}/ does not exist`);
    process.exit(1);
  }
  const { stage, reason } = detectStage({ product, ticket: ticket.toUpperCase() });
  console.log(`stage: ${stage ?? "COMPLETE"}`);
  console.log(`reason: ${reason}`);
}
