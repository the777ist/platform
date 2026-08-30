#!/usr/bin/env node
// scripts/set-port-base.mjs — give THIS repo its own local port bases, so several repos
// stamped from this platform can run their stacks on one machine at the same time.
//
// portIndex de-conflicts products WITHIN a repo, but every stamped org-repo starts numbering
// at the same bases (api 8000, supabase 54321) — so repo A's template and repo B's template
// fight over identical ports the moment both stacks run. Hit live: an `octavia-demo` stack
// held 54422 and this repo's demo could not start.
//
// This rewrites EVERY product (products/_template included — it runs as portIndex 0 and its
// committed files carry the base literally) to the new bases, keeping each product's
// portIndex offsets intact, and records the bases in root platform.json, which
// new-product.mjs reads for every future stamp. Everything else in the repo READS ports from
// each product's supabase/config.toml (test-db-target, the E2E setup, e2e-nightly) — a
// deliberate prior decision that makes this the only file set a rebase has to touch.
//
// CLI:
//   node scripts/set-port-base.mjs <supabaseBase> <apiBase>     e.g. 56321 8200
//
// The run is a plain working-tree edit — review the diff, run the gates, commit. Re-running
// with the ORIGINAL bases round-trips to a byte-identical tree (proven in the tests' repo).
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_PORT_BASES, portBases, portPlan, shiftSupabaseBlock } from "./new-product.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Why a candidate pair of bases is unusable, or null when it is fine.
 *
 * The last digits are load-bearing: intra-block offsets are conventions the whole repo
 * documents (supabase api = xx21, db = xx22, …; api ports end in 0 so `+10·i` stays
 * collision-free with the inspector's `+83`). A base that moves those digits would silently
 * re-map every documented offset, so it is refused rather than absorbed.
 */
export function basesProblem(sb, api) {
  if (!Number.isInteger(sb) || !Number.isInteger(api)) return "bases must be integers";
  if (sb % 100 !== DEFAULT_PORT_BASES.supabase % 100) {
    return `supabase base must end in ${String(DEFAULT_PORT_BASES.supabase % 100)} (block offsets are conventions: xx21 api, xx22 db, ...)`;
  }
  if (api % 10 !== 0) return "api base must end in 0 (products step by +10)";
  if (sb < 1024 || sb > 64900) return "supabase base out of sane range (1024..64900)";
  if (api < 1024 || api > 65000) return "api base out of sane range (1024..65000)";
  // Both windows grow by 100/10 per product — keep them from ever overlapping each other.
  const sbWindow = Math.floor(sb / 100) * 100;
  if (api >= sbWindow - 1000 && api < sbWindow + 1000) {
    return "api base sits inside the supabase block's neighbourhood — pick bases at least 1000 apart";
  }
  return null;
}

/** Every product dir (INCLUDING _template — it runs as portIndex 0) with its portIndex. */
export function allProducts(root = ROOT) {
  const productsDir = join(root, "products");
  if (!existsSync(productsDir)) return [];
  return readdirSync(productsDir)
    .map((name) => ({ name, dir: join(productsDir, name) }))
    .filter((p) => existsSync(join(p.dir, "product.json")))
    .map((p) => ({
      ...p,
      portIndex: JSON.parse(readFileSync(join(p.dir, "product.json"), "utf8")).portIndex,
    }))
    .filter((p) => typeof p.portIndex === "number")
    .sort((a, b) => a.portIndex - b.portIndex);
}

/** Rewrite one product's files from `cur` bases to `next` bases; returns the files touched. */
export function rebaseProduct(product, cur, next) {
  const curPlan = portPlan(product.portIndex, cur);
  const nextPlan = portPlan(product.portIndex, next);
  const sbShift = nextPlan.sbBase - curPlan.sbBase;
  const apiShift = nextPlan.apiPort - curPlan.apiPort;
  const touched = [];
  const edit = (rel, fn) => {
    const f = join(product.dir, rel);
    if (!existsSync(f)) return;
    const before = readFileSync(f, "utf8");
    const after = fn(before);
    if (after !== before) {
      writeFileSync(f, after);
      touched.push(rel);
    }
  };

  // The SAME file set the generator's applyPorts writes, plus the stamped docs' formula text.
  edit("supabase/config.toml", (t) => {
    // This product's own hundred-window under the CURRENT bases, then the inspector port
    // (apiBase + 83 + 10·i — outside the supabase window) by the api delta.
    let out = shiftSupabaseBlock(t, curPlan.sbWindow + 100 * product.portIndex, sbShift);
    out = out.replace(/^(inspector_port = )(\d+)$/m, (_, k, p) => k + String(Number(p) + apiShift));
    return out;
  });
  edit("api/package.json", (t) =>
    t.replace(new RegExp(`--port\\s+${curPlan.apiPort}\\b`, "g"), `--port ${nextPlan.apiPort}`),
  );
  for (const env of ["development", "staging", "production"]) {
    edit(`app/.env.${env}`, (t) =>
      t
        .replace(
          new RegExp(`(localhost|127\\.0\\.0\\.1):${curPlan.apiPort}\\b`, "g"),
          `$1:${nextPlan.apiPort}`,
        )
        .replace(
          new RegExp(`(localhost|127\\.0\\.0\\.1):${curPlan.sbBase}\\b`, "g"),
          `$1:${nextPlan.sbBase}`,
        ),
    );
  }
  for (const rel of [".env.example", "README.md"]) {
    edit(rel, (t) => shiftSupabaseBlock(t, curPlan.sbWindow + 100 * product.portIndex, sbShift));
  }
  // The stamped CLAUDE.md states the formulas with the BASE as a literal.
  edit("CLAUDE.md", (t) =>
    t
      .replaceAll(`\`${cur.api} + 10·i\``, `\`${next.api} + 10·i\``)
      .replaceAll(`\`${cur.supabase} + 100·i\``, `\`${next.supabase} + 100·i\``),
  );
  return touched;
}

// --- CLI ---------------------------------------------------------------------------------------
if (
  process.argv[1] &&
  process.argv[1].split(String.fromCharCode(92)).join("/").endsWith("scripts/set-port-base.mjs")
) {
  const [sbArg, apiArg] = process.argv.slice(2);
  const next = { supabase: Number(sbArg), api: Number(apiArg) };
  const problem = basesProblem(next.supabase, next.api);
  if (!sbArg || !apiArg || problem) {
    console.error(
      `✖ ${problem ?? "usage: node scripts/set-port-base.mjs <supabaseBase> <apiBase>  (e.g. 56321 8200)"}`,
    );
    process.exit(1);
  }
  const cur = portBases();
  if (cur.supabase === next.supabase && cur.api === next.api) {
    console.log(`ports already based at supabase ${cur.supabase} / api ${cur.api} — nothing to do`);
    process.exit(0);
  }

  for (const product of allProducts()) {
    const touched = rebaseProduct(product, cur, next);
    const plan = portPlan(product.portIndex, next);
    console.log(
      `→ ${product.name} (portIndex ${product.portIndex}) — api ${plan.apiPort}, supabase ${plan.sbBase}` +
        (touched.length ? `\n    ${touched.join(", ")}` : "  (nothing to touch)"),
    );
  }

  writeFileSync(
    join(ROOT, "platform.json"),
    JSON.stringify({ ports: { api: next.api, supabase: next.supabase } }, null, 2) + "\n",
  );
  console.log(`
✅ Rebased to supabase ${next.supabase} / api ${next.api} (recorded in platform.json)

   Review the diff, run the gate (node scripts/pre-push.mjs origin/main), commit.
   THEN, per product with a running/initialized local stack:
     - restart it: supabase stop && supabase start  (containers bind the OLD ports until then)
     - api/.env is GITIGNORED and still carries the old ports — re-copy .env.example and
       re-paste SUPABASE_SERVICE_ROLE_KEY (the stamped README's first-run recipe)
`);
}
