// Prepares the real stack the web E2E runs against (PHILOSOPHY: "exported dist +
// api + supabase local"). The API and static server themselves are Playwright
// webServer entries (see playwright.config.ts) — this only prepares state.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const appDir = path.resolve(__dirname, "..");
const productDir = path.resolve(appDir, "..");
const apiDir = path.join(productDir, "api");

// Ports derive from product.json's portIndex (Supabase block 54321+100i — PHILOSOPHY
// generator spec) so the stamped copy targets ITS OWN product's stack.
const { portIndex } = JSON.parse(readFileSync(path.join(productDir, "product.json"), "utf8")) as {
  portIndex: number;
};
const SUPABASE_PORT = 54321 + 100 * portIndex;

async function supabaseIsUp(): Promise<boolean> {
  try {
    // Kong healthcheck on this product's offset port.
    const res = await fetch(`http://localhost:${SUPABASE_PORT}/auth/v1/health`, {
      headers: { apikey: "ignored" },
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<void> {
  // 1. local Supabase (per-product offset ports from supabase/config.toml)
  if (!(await supabaseIsUp())) {
    execSync("supabase start", { cwd: productDir, stdio: "inherit" });
  }
  // 2. migrate + seed (seed targets a fixture owner; E2E users are fresh signups)
  execSync("uv run alembic upgrade head", { cwd: apiDir, stdio: "inherit" });
  execSync("uv run python -m demo_api.seed", { cwd: apiDir, stdio: "inherit" });
  // NOTE: the web-bundle export deliberately does NOT live here — Playwright launches
  // webServer processes BEFORE global setup, so it runs as the first half of the serve
  // webServer's command chain (e2e/export-web.mjs, see playwright.config.ts).
}
