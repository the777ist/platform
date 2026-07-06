// Visual regression (PHILOSOPHY Design-system workbench): Playwright screenshots of
// the static Storybook build, each story × {light,dark}, committed baselines —
// self-hosted (Chromatic deliberately declined). Runs in e2e-nightly.yml + locally.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".storybook",
  testMatch: "visual-regression.spec.ts",
  // Baselines live next to the spec and are committed. Platform/browser suffixes are
  // dropped from the template so the names stay stable; regenerate ON THE CI PLATFORM
  // (pnpm exec playwright test --update-snapshots) if font rendering drifts locally.
  snapshotPathTemplate: "{testDir}/visual-regression.spec.ts-snapshots/{arg}{ext}",
  use: { baseURL: "http://localhost:6006" },
  webServer: {
    command: "npx http-server storybook-static -p 6006 -s",
    url: "http://localhost:6006",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
