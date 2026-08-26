// scripts/affected.mjs decides what the pre-push hook AND ci.yml actually check. Everything else
// in the gate trusts its answer, which makes it the one file where a silent failure disables the
// whole system: an empty filter selects nothing, turbo reports success having run no tasks, and
// CI goes green. That is exactly the false-green class this repo's gates exist to prevent — and
// until now the enforcer itself had no enforcement.
//
// Run with `node --test` (no test runner dependency for root-owned scripts).
import test from "node:test";
import assert from "node:assert/strict";

import { TURBO_TASKS, globalInputFiles, scopeFilter } from "../affected.mjs";

test("TURBO_TASKS is non-empty", () => {
  // An empty list makes `turbo run` a no-op that still exits 0. ci.yml guards against this at
  // runtime too; this catches it at the source.
  assert.ok(TURBO_TASKS.length > 0);
});

test("TURBO_TASKS covers every gate the tiers rely on", () => {
  // Spelled out rather than compared to the export, so dropping one is a failure and not a
  // silently-updated expectation.
  for (const task of ["lint", "typecheck", "test", "build", "openapi"]) {
    assert.ok(TURBO_TASKS.includes(task), `TURBO_TASKS is missing ${task}`);
  }
});

test("globalInputFiles reports the root files turbo.json declares", () => {
  const files = globalInputFiles();
  // These live in no package directory, so without a globalDependencies entry they are invisible
  // to BOTH cache invalidation and affected-selection — a change to them would gate nothing.
  for (const file of ["tsconfig.base.json", "eslint.config.mjs", "pnpm-workspace.yaml"]) {
    assert.ok(files.includes(file), `${file} is not a declared globalDependency`);
  }
});

test("an unresolvable base widens to EVERY package instead of narrowing to none", () => {
  // CI derives its base from github.event.before, which is all-zeros on a first push and
  // unreachable after a force-push. Narrowing there would gate nothing at all.
  const { filter, reason } = scopeFilter("0000000000000000000000000000000000000000");
  assert.equal(filter, "", "an unusable base must produce NO filter, i.e. select everything");
  assert.match(reason, /not a resolvable commit/);
});

test("an unresolvable HEAD also widens", () => {
  const { filter, reason } = scopeFilter("HEAD", "refs/heads/does-not-exist-anywhere");
  assert.equal(filter, "");
  assert.match(reason, /not a resolvable commit/);
});

test("a resolvable range produces a dependents-inclusive filter", () => {
  const { filter, reason } = scopeFilter("HEAD", "HEAD");
  assert.equal(reason, "");
  // The leading `...` is the co-evolve guard: changed packages AND their dependents. Without it
  // a shared packages/* change would gate only that package.
  assert.equal(filter, "--filter=...[HEAD...HEAD]");
});

test("the filter is emitted BARE so callers control quoting", () => {
  // ci.yml passes it through an env var and quotes it only when non-empty; embedded quotes here
  // would reach turbo as part of the argument and match nothing.
  const { filter } = scopeFilter("HEAD", "HEAD");
  assert.ok(!filter.includes('"'), `filter must not carry quotes: ${filter}`);
});
