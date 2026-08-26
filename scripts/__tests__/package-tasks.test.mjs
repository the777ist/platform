// `turbo run test` silently skips a package with no `test` script — no warning, no non-zero
// exit, the task simply is not in the graph. That is how a monorepo loses coverage: not by a
// test failing, but by a package quietly ceasing to have any. The desktop packages sat like
// that, with the Electron main process as the only shipped surface with nothing asserting it.
//
// The rules are tested against hand-written package shapes, so they hold for packages that do
// not exist yet — which is the entire point of a guard in a repo built to spawn products.
import test from "node:test";
import assert from "node:assert/strict";

import {
  REQUIRED_TASKS,
  exemptionsFor,
  missingTasks,
  staleExemptions,
  workspacePackages,
} from "../check-package-tasks.mjs";

const ALL = { lint: "eslint .", typecheck: "tsc --noEmit", test: "jest" };

test("the three gate tasks are required", () => {
  // Spelled out here rather than read from the module: this list is the contract, and a test
  // that imports it would agree with whatever it became.
  assert.deepEqual([...REQUIRED_TASKS].sort(), ["lint", "test", "typecheck"]);
});

test("a package with all three tasks is fine", () => {
  assert.deepEqual(missingTasks("@platform/anything", ALL), []);
});

test("a missing test script is reported", () => {
  const noTest = { lint: ALL.lint, typecheck: ALL.typecheck };
  assert.deepEqual(missingTasks("@platform/some-app", noTest), ["test"]);
});

test("a package with NO scripts at all is reported for every task", () => {
  assert.deepEqual(missingTasks("@platform/empty", undefined).sort(), [
    "lint",
    "test",
    "typecheck",
  ]);
  assert.deepEqual(missingTasks("@platform/empty", {}).sort(), ["lint", "test", "typecheck"]);
});

test("a generated api-client is excused from lint and test, but never from typecheck", () => {
  // Typecheck is the one gate that still means something for generated code: it is what proves
  // the client the API produced actually compiles against its consumers.
  assert.deepEqual(missingTasks("@platform/demo-api-client", { typecheck: "tsc" }), []);
  assert.deepEqual(missingTasks("@platform/demo-api-client", {}), ["typecheck"]);
});

test("every exemption carries a written reason", () => {
  // An exemption with no reason is an omission with better paperwork.
  for (const name of ["@platform/config", "@platform/demo-api-client"]) {
    const reasons = Object.values(exemptionsFor(name));
    assert.ok(reasons.length > 0, name);
    for (const reason of reasons) {
      assert.equal(typeof reason, "string");
      assert.ok(reason.length > 20, `${name}: reason too thin to be a reason: "${reason}"`);
    }
  }
});

test("an ordinary package is exempt from nothing", () => {
  assert.deepEqual(exemptionsFor("@platform/demo-app"), {});
  assert.deepEqual(exemptionsFor("@platform/ui"), {});
});

test("the api-client rule matches by SUFFIX, not by containment", () => {
  // The name must CONTAIN `-api-client` without ending in it, or the test does not touch the
  // anchor at all: `@platform/api-client-tools` has `/api-client`, not `-api-client`, so it is
  // excused by an unanchored pattern and by an anchored one alike, and proves nothing.
  assert.deepEqual(exemptionsFor("@platform/demo-api-client-helpers"), {});
  assert.deepEqual(exemptionsFor("@platform/demo-api-clients"), {});
  assert.notDeepEqual(exemptionsFor("@platform/template-api-client"), {});
});

test("an exemption that is no longer needed is reported as stale", () => {
  // The failure this prevents is subtler than a missing task: an exemption nobody revisits stops
  // describing reality, and a list of stale excuses is how the next real omission gets waved
  // through.
  assert.deepEqual(staleExemptions("@platform/demo-api-client", { lint: "eslint ." }), ["lint"]);
  assert.deepEqual(staleExemptions("@platform/demo-api-client", { typecheck: "tsc" }), []);
});

test("every real package in this repo satisfies the rule", () => {
  const packages = workspacePackages();
  assert.ok(packages.length >= 8, `only found ${packages.length} packages`);
  for (const pkg of packages) {
    assert.deepEqual(missingTasks(pkg.name, pkg.scripts), [], `${pkg.name} is missing tasks`);
    assert.deepEqual(
      staleExemptions(pkg.name, pkg.scripts),
      [],
      `${pkg.name} has a stale exemption`,
    );
  }
});

test("both desktop packages are among them, with a test script", () => {
  // The regression that motivated this guard. Named explicitly so removing their tests fails
  // here as well as in the generic sweep above.
  const byName = new Map(workspacePackages().map((p) => [p.name, p]));
  for (const name of ["@platform/template-desktop", "@platform/demo-desktop"]) {
    assert.ok(byName.has(name), `${name} not found`);
    assert.ok(byName.get(name).scripts?.test, `${name} has no test script`);
  }
});
