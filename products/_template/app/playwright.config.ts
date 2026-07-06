// Web E2E (PHILOSOPHY Testing strategy): full stack — exported dist + API + Supabase
// local — signup → login → items CRUD → realtime invalidation. Nightly in
// e2e-nightly.yml (+ workflow_dispatch) and locally on demand.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  use: { baseURL: "http://localhost:8081", trace: "on-first-retry" },
  // Process orchestration (guide ⚠️ OPEN, resolved): BOTH long-lived processes run as
  // Playwright webServer entries — Playwright owns start, readiness and teardown, so
  // no hand-rolled background-PID glue is needed. global-setup only prepares state
  // (supabase up, migrate, seed, export dist).
  webServer: [
    {
      // -s = SPA fallback: the exported single-output bundle routes /signup etc.
      // client-side, so deep links must fall back to index.html.
      command: "npx serve dist -s -l 8081",
      url: "http://localhost:8081",
      reuseExistingServer: !process.env.CI,
    },
    {
      // cwd api/ so pydantic-settings picks up api/.env (local) — CI provides env vars.
      command: "uv run uvicorn template_api.main:app --port 8000",
      cwd: "../api",
      url: "http://localhost:8000/healthz",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
