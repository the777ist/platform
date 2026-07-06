// Full-stack flow (PHILOSOPHY Testing strategy): signup → login-state → items CRUD →
// realtime. The second browser context proves broadcast-only realtime: a mutation in
// client A invalidates client B's list over the per-product channel, and B refetches
// through the API — no manual refresh.
import { test, expect } from "@playwright/test";

test("signup → login → items CRUD → realtime", async ({ browser }) => {
  const a = await browser.newContext();
  const pageA = await a.newPage();
  const email = `e2e+${Date.now()}@example.com`;

  // Signup lands a session immediately (local Supabase: confirmations disabled).
  await pageA.goto("/signup");
  await pageA.getByPlaceholder("Email").fill(email);
  await pageA.getByPlaceholder("Password").fill("Passw0rd!");
  await pageA.getByRole("button", { name: "Sign up" }).click();

  // The guard redirects into the (tabs) group — the Home tab and the add-item row
  // are the signed-in landmarks.
  await expect(pageA.getByPlaceholder("Title")).toBeVisible({ timeout: 15_000 });

  // create an item
  await pageA.getByPlaceholder("Title").fill("first item");
  await pageA.getByRole("button", { name: "Add item" }).click();
  await expect(pageA.getByText("first item")).toBeVisible();

  // realtime: a SECOND client sees the next mutation without manual refresh.
  // NOTE: B deliberately starts from A's PERSISTED cache (storageState copies
  // localStorage) — it may paint the stale pre-mutation list, since the persisted
  // query is fresh enough not to refetch. Only the broadcast → invalidate → refetch
  // path can bring the next item in.
  const b = await browser.newContext({ storageState: await a.storageState() });
  const pageB = await b.newPage();
  await pageB.goto("/");
  await expect(pageB.getByPlaceholder("Title")).toBeVisible({ timeout: 15_000 });

  await pageA.getByPlaceholder("Title").fill("broadcast item");
  await pageA.getByRole("button", { name: "Add item" }).click();
  await expect(pageA.getByText("broadcast item")).toBeVisible();
  // pageB is never reloaded/refocused — this is the broadcast-only realtime proof
  // (and the refetch also pulls in "first item", proving it re-read through the API).
  await expect(pageB.getByText("broadcast item")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByText("first item")).toBeVisible();

  await a.close();
  await b.close();
});
