// The devbox wrapper's two protective rules, tested as pure functions (no flyctl, no network):
// the PLACEHOLDER refusal is what stops a cloned repo from parking a company workstation on
// `example-devbox`, and the one-machine arity rule is what stops a broken invariant (two
// machines fighting over one identity volume) from being silently "resolved" by picking one.
import test from "node:test";
import assert from "node:assert/strict";

import { PLACEHOLDER, hasDataVolume, pickMachine, readFlyConfig, resolveApp } from "../devbox.mjs";

const toml = (app) => `app = "${app}"\nprimary_region = "lhr"\n`;

test("the committed fly.toml still carries the org placeholder", () => {
  // Template discipline: if someone swaps the committed name for a real org, the template
  // stops being portable and the PHILOSOPHY naming audit (`git grep example`) loses this
  // swap-point. The real name belongs in each clone, never here.
  //
  // IN AN ACTIVATED CLONE this test is SUPPOSED to change: org activation
  // (devbox/README.md) swaps the placeholder AND updates this expectation to the clone's
  // own <org>-devbox name — the template-discipline pin becomes that org's baked-name pin.
  // If this just failed your first push after activation, that is the missing edit.
  assert.equal(readFlyConfig().app, PLACEHOLDER);
});

test("readFlyConfig parses app and region and tolerates absence", () => {
  assert.deepEqual(readFlyConfig(toml("acme-devbox")), { app: "acme-devbox", region: "lhr" });
  assert.deepEqual(readFlyConfig("# empty\n"), { app: null, region: null });
});

test("resolveApp REFUSES the unswapped placeholder", () => {
  assert.throws(
    () => resolveApp({}, readFlyConfig(toml(PLACEHOLDER))),
    /placeholder/i,
    "operating on example-devbox must never be a default",
  );
});

test("resolveApp accepts a swapped app name from the config", () => {
  assert.equal(resolveApp({}, readFlyConfig(toml("acme-devbox"))), "acme-devbox");
});

test("an explicit --app overrides everything, placeholder included", () => {
  // The escape hatch is EXPLICIT: the operator typed a name, so nothing was guessed.
  assert.equal(
    resolveApp({ app: "acme-devbox-sam" }, readFlyConfig(toml(PLACEHOLDER))),
    "acme-devbox-sam",
  );
});

test("pickMachine returns the single machine and refuses every other arity", () => {
  const one = { id: "m1", state: "stopped" };
  assert.equal(pickMachine([one]), one);
  assert.throws(() => pickMachine([]), /create/i, "zero machines points at create");
  assert.throws(
    () => pickMachine([{ id: "m1" }, { id: "m2" }]),
    /invariant/i,
    "two machines is a broken invariant, never a choice",
  );
});

test("volume creation is guarded by a LIST, because fly volumes create is not idempotent", () => {
  // Verified live: a failed first deploy plus a retried create minted a SECOND 40GB volume —
  // a monthly bill and a machine-placement footgun. Existence checks must never rely on the
  // create call erroring, because it happily succeeds.
  assert.equal(hasDataVolume([{ name: "data" }]), true);
  assert.equal(hasDataVolume([]), false);
  assert.equal(hasDataVolume([{ name: "other" }]), false);
  assert.equal(hasDataVolume([{ name: "data", pending_destroy: true }]), false);
});
