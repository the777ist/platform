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
  // 3. export the web bundle `npx serve dist` will serve. `expo export` FORCES
  // NODE_ENV=production, so it would bake the .env.production PLACEHOLDER fly.dev
  // URLs and the E2E would target infra that doesn't exist. Direct env vars beat
  // dotenv files in @expo/env — inject .env.development's EXPO_PUBLIC_* explicitly
  // so the bundle points at the LOCAL stack.
  const env = { ...process.env, ...readEnvFile(path.join(appDir, ".env.development")) };
  // expo-cli parses CI with getenv.boolish, which THROWS on an empty string
  // (CI= from a wrapping shell) — drop it unless it carries a real value.
  if (!env.CI) delete env.CI;
  // --clear: Metro's transform cache does NOT key on EXPO_PUBLIC_* values — without
  // it a previous export's bundle (wrong env baked in) is replayed byte-identical.
  execSync("npx expo export --platform web --clear", { cwd: appDir, stdio: "inherit", env });
}

function readEnvFile(file: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) vars[match[1]] = match[2].trim(); // trim strips CRLF remnants on Windows
  }
  return vars;
}
