// Visual regression (PHILOSOPHY Design-system workbench): Playwright screenshots of
// the static Storybook build, each story × {light,dark}, committed baselines —
// self-hosted (Chromatic deliberately declined). Runs in e2e-nightly.yml + locally.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".storybook",
  testMatch: "visual-regression.spec.ts",
  // Baselines live next to the spec and are committed, one set PER PLATFORM — font
  // rendering differs across OSes, so a shared baseline can't satisfy both a local
  // Windows/mac run and the Linux CI runner (proved by the first nightly CI run).
  // Local: `pnpm --filter @the777incident/ui exec playwright test --update-snapshots`.
  // Linux (CI runner): dispatch e2e-nightly with `update-vr-baselines: true` and
  // commit the uploaded `vr-baselines-linux` artifact.
  snapshotPathTemplate: "{testDir}/visual-regression.spec.ts-snapshots/{arg}-{platform}{ext}",
  use: { baseURL: "http://localhost:6006" },
  webServer: {
    command: "npx http-server storybook-static -p 6006 -s",
    url: "http://localhost:6006",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
