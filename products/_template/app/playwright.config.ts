// Web E2E (PHILOSOPHY Testing strategy): full stack — exported dist + API + Supabase
// local — signup → login → items CRUD → realtime invalidation. Nightly in
// e2e-nightly.yml (+ workflow_dispatch) and locally on demand.
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Ports derive from product.json's portIndex (API 8000+10i — PHILOSOPHY generator
// spec) so the stamped copy of this config targets ITS OWN product's stack.
const { portIndex } = JSON.parse(readFileSync(path.join(__dirname, "../product.json"), "utf8")) as {
  portIndex: number;
};
const API_PORT = 8000 + 10 * portIndex;

export default defineConfig({
  testDir: "./e2e",
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
