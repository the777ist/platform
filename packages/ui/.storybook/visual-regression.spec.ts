// Iterates the static Storybook build's index.json and screenshots EVERY story in
// light AND dark (the preview's `theme` toolbar global), diffing against committed
// baselines. Build first: pnpm --filter @platform/ui build-storybook
// Author/refresh baselines: pnpm --filter @platform/ui exec playwright test --update-snapshots
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

const indexPath = path.resolve(__dirname, "../storybook-static/index.json");
if (!fs.existsSync(indexPath)) {
  throw new Error(
    "storybook-static/index.json not found — run `pnpm --filter @platform/ui build-storybook` first.",
  );
}
const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
  entries: Record<string, { id: string; type?: string }>;
};
const stories = Object.values(index.entries).filter((e) => e.type === "story");

for (const story of stories) {
  for (const theme of ["light", "dark"] as const) {
    test(`${story.id} [${theme}]`, async ({ page }) => {
      await page.goto(`/iframe.html?id=${story.id}&globals=theme:${theme}`);
      await page.waitForSelector("#storybook-root");
      await expect(page).toHaveScreenshot(`${story.id}--${theme}.png`, {
        animations: "disabled",
      });
    });
  }
}
