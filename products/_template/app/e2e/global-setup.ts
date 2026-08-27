// Prepares the real stack the web E2E runs against (PHILOSOPHY: "exported dist +
// api + supabase local"). The API and static server themselves are Playwright
// webServer entries (see playwright.config.ts) — this only prepares state.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const appDir = path.resolve(__dirname, "..");
const productDir = path.resolve(appDir, "..");
const apiDir = path.join(productDir, "api");

// The Supabase API port is READ from this product's supabase/config.toml, not re-derived from
// `54321 + 100·portIndex`. The generator owns that formula and writes the result into
// config.toml; anything that recomputes it is a second copy that can disagree with the file the
// CLI actually reads (CLAUDE.md: "a fifth copy is a fifth thing to drift").
//
// Disagreeing here is worse than it looks: the health check would target a port this product's
// stack is not on, and on a machine running several products it can hit ANOTHER product's Kong,
// conclude "up", skip `supabase start`, and let the suite run against the wrong project's auth.
function supabaseApiPort(): number {
  const config = readFileSync(path.join(productDir, "supabase", "config.toml"), "utf8");
  // Split on section headers and take the one that IS `[api]` — `startsWith("api]")` excludes
  // `[api.tls]` and friends. The port line is anchored so a `*_port` key cannot match.
  const section = config.split(/^\[/m).find((s) => s.startsWith("api]"));
  const match = section?.match(/^\s*port\s*=\s*(\d+)/m);
  if (!match) throw new Error("no [api] port in supabase/config.toml — cannot locate the stack");
  return Number(match[1]);
}

const SUPABASE_PORT = supabaseApiPort();

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
  execSync("uv run python -m template_api.seed", { cwd: apiDir, stdio: "inherit" });
  // NOTE: the web-bundle export deliberately does NOT live here — Playwright launches
  // webServer processes BEFORE global setup, so it runs as the first half of the serve
  // webServer's command chain (e2e/export-web.mjs, see playwright.config.ts).
}
