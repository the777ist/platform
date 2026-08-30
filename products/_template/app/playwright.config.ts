// Web E2E (PHILOSOPHY Testing strategy): full stack — exported dist + API + Supabase
// local — signup → login → items CRUD → realtime invalidation. Nightly in
// e2e-nightly.yml (+ workflow_dispatch) and locally on demand.
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// The API port is READ from api/package.json's dev script, not re-derived from
// `apiBase + 10·portIndex` — the same single-source rule global-setup applies to the
// supabase port (config.toml). The generator (and scripts/set-port-base.mjs, when a repo
// takes its own port bases) writes the real port into that script; a formula here is a
// second copy that disagrees after a rebase, and it disagrees in the worst way: the
// exported web bundle bakes the NEW API URL while this webServer boots the API on the OLD
// one, so every E2E fails on "add-item row never appears" with both halves looking healthy.
const apiDevScript = (
  JSON.parse(readFileSync(path.join(__dirname, "../api/package.json"), "utf8")) as {
    scripts: { dev: string };
  }
).scripts.dev;
const apiPortMatch = /--port\s+(\d+)/.exec(apiDevScript);
if (!apiPortMatch) throw new Error(`no --port in api dev script: ${apiDevScript}`);
const API_PORT = Number(apiPortMatch[1]);

export default defineConfig({
  testDir: "./e2e",
  // A stray `test.only` would otherwise make CI pass having run ONE test. Playwright's own
  // guard: error in CI, still convenient locally.
  forbidOnly: !!process.env.CI,
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  use: { baseURL: "http://localhost:8081", trace: "on-first-retry" },
  // Process orchestration (guide ⚠️ OPEN, resolved): BOTH long-lived processes run as
  // Playwright webServer entries — Playwright owns start, readiness and teardown, so
  // no hand-rolled background-PID glue is needed. Playwright launches webServers
  // BEFORE global setup, so the web export runs as the first half of the serve
  // command chain (a cold environment has no dist/ until it does); global-setup only
  // prepares backend state (supabase up, migrate, seed).
  webServer: [
    {
      // -s = SPA fallback: the exported single-output bundle routes /signup etc.
      // client-side, so deep links must fall back to index.html. --yes: npx must not
      // prompt on a cold cache (CI).
      command: "node e2e/export-web.mjs && npx --yes serve dist -s -l 8081",
      url: "http://localhost:8081",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000, // readiness includes the expo export (~1-2 min cold)
    },
    {
      // cwd api/ so pydantic-settings picks up api/.env (local) — CI provides env vars.
      command: `uv run uvicorn template_api.main:app --port ${API_PORT}`,
      cwd: "../api",
      url: `http://localhost:${API_PORT}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
