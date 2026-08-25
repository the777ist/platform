#!/usr/bin/env node
// scripts/alembic-heads.mjs — assert exactly ONE alembic head per api, shared by the pre-push hook
// and by CI.
//
// Why it exists in CI too: a hook is bypassable with --no-verify, so anything that runs ONLY in a
// hook is not actually enforced. Every gate the hook runs must have a CI counterpart that reruns it
// unconditionally; this one had none.
//
// `alembic heads` reads the migration script directory only — no database, no env, ~1s — so it is
// cheap enough for both tiers. Two heads mean two branches each added a migration; catching it
// while it is still one branch's problem is far easier than untangling it after a merge.
//
// CLI:
//   node scripts/alembic-heads.mjs                  every products/*/api
//   node scripts/alembic-heads.mjs products/x/api   just these
import { execSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function allApiDirs() {
  const products = join(ROOT, "products");
  if (!existsSync(products)) return [];
  return readdirSync(products)
    .map((name) => `products/${name}/api`)
    .filter((dir) => existsSync(join(ROOT, dir, "alembic.ini")))
    .sort();
}

// Returns the failures rather than exiting, so the hook can fold this into its own exit handling.
export function checkAlembicHeads(apiDirs) {
  const failures = [];
  for (const dir of apiDirs) {
    if (!existsSync(join(ROOT, dir, "alembic.ini"))) continue;
    let out;
    try {
      out = execSync("uv run alembic heads", {
        cwd: join(ROOT, dir),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      // Tooling absence is not a migration problem. Say so out loud rather than passing silently:
      // an unreported skip is indistinguishable from a pass.
      console.warn(`⚠️  ${dir}: could not run \`alembic heads\` — multi-head check SKIPPED`);
      continue;
    }
    const heads = out.split(/\r?\n/).filter((line) => line.includes("(head)"));
    if (heads.length > 1) failures.push({ dir, heads });
  }
  return failures;
}

export function reportFailures(failures) {
  for (const { dir, heads } of failures) {
    console.error(`❌ ${dir}: ${heads.length} alembic heads — merge them before this lands:`);
    for (const head of heads) console.error(`     ${head.trim()}`);
  }
}

// --- CLI ---------------------------------------------------------------------------------------
if (
  process.argv[1] &&
  process.argv[1].split(String.fromCharCode(92)).join("/").endsWith("scripts/alembic-heads.mjs")
) {
  const args = process.argv.slice(2).filter(Boolean);
  const dirs = args.length > 0 ? args : allApiDirs();
  const failures = checkAlembicHeads(dirs);
  reportFailures(failures);
  if (failures.length > 0) process.exit(1);
  console.log(`✅ one alembic head in each of: ${dirs.join(", ") || "(no apis)"}`);
}
