#!/usr/bin/env node
// scripts/bootstrap.mjs — one-command onboarding.
// PHILOSOPHY.md (Operational defaults): root `pnpm bootstrap` = mise -> install -> supabase start.
// Brings up EVERY product's local Supabase stack (offset ports => they coexist).
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTS = join(ROOT, "products");
const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: "inherit" });

run("mise install"); // pin & install Node 24 / pnpm 11 / Python 3.13 / uv
run("pnpm install"); // single JS dependency universe (one lockfile)

// supabase start per product — each reads its own config.toml (offset ports), so all
// stacks run simultaneously without colliding. Data-driven: a no-op until products exist,
// and automatically covers every product the Phase 7 generator stamps later.
if (existsSync(PRODUCTS)) {
  for (const entry of readdirSync(PRODUCTS)) {
    const cfg = join(PRODUCTS, entry, "supabase", "config.toml");
    if (!existsSync(cfg)) continue;
    console.log(`→ supabase start (${entry})`);
    run("supabase start", join(PRODUCTS, entry));
  }
}
console.log("✅ bootstrap complete");
