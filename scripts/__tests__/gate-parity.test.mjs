// A gate that runs ONLY in the hook is not enforced: `git push --no-verify` skips it, and so
// does a machine where lefthook never installed (see verify-hooks.mjs — a global core.hooksPath
// disables every hook while `lefthook install` still reports success). CI is the tier that
// actually decides whether something lands, so every gate the hook runs must ALSO run there.
//
// This repo keeps rediscovering the same failure in different clothes: two lists that quietly
// disagree. A hardcoded product roster in two deploy workflows; a task list in the hook and
// again in the workflow YAML; a drift command written one way in CI and another in the hook,
// where it turned out to be inert. Each was found by hand, months apart.
//
// So the parity is asserted rather than remembered. This reads both files and compares them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const HOOK = read("scripts/pre-push.mjs");
const CI = read(".github/workflows/ci.yml");

/**
 * Gate scripts referenced by a file — both `node scripts/x.mjs` invocations and `./x.mjs`
 * imports, since the hook reaches alembic-heads by importing it while CI calls its CLI.
 */
function gateScripts(source) {
  const names = [
    ...[...source.matchAll(/scripts\/([a-z0-9-]+)\.mjs/g)].map((m) => m[1]),
    ...[...source.matchAll(/from "\.\/([a-z0-9-]+)\.mjs"/g)].map((m) => m[1]),
  ];
  return new Set(names.filter((n) => !NOT_A_GATE.has(n)));
}

/**
 * Modules that appear in the hook but are not gates, each with the reason it cannot fail a run.
 * Written down rather than inferred: an unexplained exclusion here would let a real gate be
 * dropped from CI by adding one word to a list.
 */
const NOT_A_GATE = new Map([
  ["pre-push", "the hook itself, not a gate within it"],
  [
    "test-db-target",
    "a pure helper that resolves where a product's pytest expects Postgres, used only to decide " +
      "whether the hook may SKIP that suite locally. CI never skips — it always has a service " +
      "container — so it has nothing to call.",
  ],
]);

test("every gate the pre-push hook runs is also run by CI", () => {
  const inHook = gateScripts(HOOK);
  const inCi = gateScripts(CI);
  const hookOnly = [...inHook].filter((name) => !inCi.has(name)).sort();
  assert.deepEqual(
    hookOnly,
    [],
    `these run in the hook but NOT in CI, so --no-verify skips them entirely: ${hookOnly.join(", ")}`,
  );
});

test("every non-gate exclusion carries a written reason", () => {
  // The exclusion list is the one place this test could be defeated by editing it, so the cost
  // of adding an entry is having to justify it.
  assert.ok(NOT_A_GATE.size > 0);
  for (const [name, reason] of NOT_A_GATE) {
    assert.equal(typeof reason, "string");
    assert.ok(reason.length > 30, `${name}: reason too thin to be a reason: "${reason}"`);
  }
});

test("the hook is actually running the gates this repo has", () => {
  // Guards the test above from passing vacuously: if gateScripts stopped matching, both sets
  // would be empty and the subset check would succeed while enforcing nothing.
  const inHook = gateScripts(HOOK);
  assert.ok(inHook.size >= 8, `only found ${inHook.size} gates in the hook: ${[...inHook]}`);
  for (const required of [
    "check-focused-tests",
    "check-stamp-tokens",
    "check-committed-secrets",
    "check-semantic-tokens",
    "check-theme-tokens",
    "check-package-tasks",
    "check-typegen-drift",
    "alembic-heads",
    "affected",
  ]) {
    assert.ok(inHook.has(required), `${required} is not run by the pre-push hook`);
  }
});

test("CI additionally runs the gates a hook CANNOT enforce", () => {
  // These have no useful hook equivalent, or the hook version is bypassable in a way that
  // matters. Named explicitly so removing one from CI fails here.
  assert.match(CI, /pnpm run format:check/, "prettier is otherwise only enforced pre-commit");
  assert.match(CI, /pnpm exec commitlint/, "the commit-msg hook is skipped by --no-verify");
  assert.match(
    CI,
    /pnpm run lint:root/,
    "root-owned files belong to no package, so turbo misses them",
  );
  assert.match(CI, /pnpm run test:scripts/, "the gate scripts themselves need testing in CI");
  assert.match(CI, /pnpm turbo run/, "the actual lint/typecheck/test/build/openapi run");
});

test("CI checks the deploy path filters, which only run on push-to-main and tags", () => {
  // Otherwise product-filters.mjs goes unexercised on Linux until the moment a deploy needs it,
  // and its failure is a broken deploy rather than a red PR check.
  assert.match(CI, /product-filters\.mjs/);
});

test("both tiers resolve scope through the SAME module", () => {
  // The hook imports scopeFilter/TURBO_TASKS; CI shells out to the same file. A second copy of
  // that logic is exactly how a hook and a CI job end up selecting different things.
  assert.match(HOOK, /from "\.\/affected\.mjs"/);
  assert.match(CI, /scripts\/affected\.mjs scope/);
  assert.match(CI, /scripts\/affected\.mjs tasks/);
});
