#!/usr/bin/env node
// scripts/remove-product.mjs — the inverse of new-product.mjs: delete a stamped product.
// Plain Node, ZERO runtime deps (node: builtins only). Undoes everything the generator
// created: (1) validate + confirm (destructive!), (2) stop the product's local Supabase
// stack BEFORE its config.toml disappears (the CLI resolves containers by the CURRENT
// config — delete first and the containers/volumes orphan), (3) delete products/<name>,
// (4) drop the product's brand-mode entry from tokens.config.json, (5) pnpm install to
// drop the workspaces from the lockfile, (6) print the de-provision checklist (the
// external infra the generator's checklist had you create).
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTS_DIR = join(ROOT, "products");

// ---- Step 1: validate + confirm ----------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const yes = args.includes("--yes") || args.includes("-y");
  const name = args.find((a) => !a.startsWith("-"));
  if (!name) die("usage: pnpm remove-product <name> [--yes]");
  if (name === "template" || name.startsWith("_")) {
    die(`refusing to remove "${name}" — products/_template is the mold every product stamps from`);
  }
  const dest = join(PRODUCTS_DIR, name);
  if (!existsSync(dest)) die(`product "${name}" does not exist at products/${name}`);
  return { name, dest, yes };
}

async function confirm(name) {
  if (!process.stdin.isTTY) {
    die(`non-interactive session — re-run with --yes to confirm removing products/${name}`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `⚠ This DELETES products/${name} (files, local Supabase stack + data volumes).\n` +
      `  Type the product name to confirm: `,
  );
  rl.close();
  if (answer.trim() !== name) die("confirmation did not match — nothing was removed");
}

// ---- Step 2: stop the local Supabase stack (BEFORE the config is deleted) ----------------
function stopSupabase(name, dest) {
  if (!existsSync(join(dest, "supabase", "config.toml"))) return;
  try {
    // --no-backup also removes the stack's data volumes — this product is going away.
    execSync("supabase stop --no-backup", { cwd: dest, stdio: "inherit" });
  } catch {
    console.warn(
      `⚠ could not stop the "${name}" Supabase stack (CLI missing, Docker down, or not running) — ` +
        `if containers/volumes linger: docker volume ls --filter label=com.supabase.cli.project=example-${name}`,
    );
  }
}

// ---- Step 4: drop the brand-mode entry the generator registered ---------------------------
function removeFigmaMode(name) {
  const f = join(ROOT, "tokens.config.json");
  if (!existsSync(f)) return;
  const cfg = JSON.parse(readFileSync(f, "utf8"));
  if (cfg.modes && name in cfg.modes) {
    delete cfg.modes[name];
    writeFileSync(f, JSON.stringify(cfg, null, 2) + "\n");
  }
}

// ---- Step 6: print the de-provision checklist ---------------------------------------------
function printChecklist(name) {
  const org = "example"; // placeholder org (Naming conventions header)
  console.log(`
✅ Removed products/${name} (workspaces dropped from the lockfile)

────────────────────────────────────────────────────────────────────
 DE-PROVISION CHECKLIST for "${name}" (skip whatever was never created)
────────────────────────────────────────────────────────────────────
 [ ] Supabase: delete projects  ${org}-${name}-stg  and  ${org}-${name}-prod
 [ ] Fly: flyctl apps destroy ${org}-${name}-api-stg
          flyctl apps destroy ${org}-${name}-api-prod
 [ ] Vercel: delete the ${name} project
 [ ] EAS: delete the ${name} project (expo.dev dashboard)
 [ ] Desktop: archive/delete the ${org}/${name}-desktop-releases repo
 [ ] Sentry: delete the 4 ${name} projects (app stg/prod, api stg/prod)
 [ ] GitHub Actions: remove per-product secrets (FLY_API_TOKEN_${name.toUpperCase().replace(/-/g, "_")}, ...)
     and the "${name}" filter entries in deploy-api.yml / eas-update.yml (if added)
 [ ] FIGMA: ask design to retire the "${name}" brand mode
 [ ] git: the deletion is in your working tree — review and commit it
────────────────────────────────────────────────────────────────────
`);
}

function die(msg) {
  console.error("✖ " + msg);
  process.exit(1);
}

// ---- main ---------------------------------------------------------------------------------
async function main() {
  const { name, dest, yes } = parseArgs();
  if (!yes) await confirm(name);

  console.log(`→ stopping the "${name}" local Supabase stack (if running)...`);
  stopSupabase(name, dest); // Step 2 — must precede the delete

  console.log(`→ deleting products/${name}`);
  rmSync(dest, { recursive: true, force: true }); // Step 3

  removeFigmaMode(name); // Step 4

  console.log("→ pnpm install (dropping the removed workspaces)...");
  execSync("pnpm install", { cwd: ROOT, stdio: "inherit" }); // Step 5

  printChecklist(name); // Step 6
}
await main();
