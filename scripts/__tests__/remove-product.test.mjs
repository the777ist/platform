// remove-product deletes a directory with rmSync(recursive, force). It is the only destructive
// command in the repo, and it had no tests.
//
// It also had no name validation, while new-product accepts only /^[a-z][a-z0-9-]*$/. That
// asymmetry meant you could CREATE only a well-formed product but DELETE anything reachable by
// traversal: `remove-product ..` resolved to the REPOSITORY ROOT, and `../packages` to packages/.
// The confirmation prompt is no protection — it asks you to type the name you just typed — and
// --yes skips it entirely.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { NAME_RE, destFor, isFileLockError, nameProblem } from "../remove-product.mjs";

test("a normal product name is accepted", () => {
  assert.equal(nameProblem("demo"), null);
  assert.equal(nameProblem("my-app-2"), null);
});

test("a traversal is REFUSED — it resolved to the repository root", () => {
  // The defect this file exists for. `..` is not a hypothetical: it is one keystroke from `.`,
  // and rmSync(recursive, force) does not ask twice.
  for (const name of ["..", "../packages", "../../platform", "./demo", "a/b", "a\b"]) {
    assert.ok(nameProblem(name), `should be refused: ${name}`);
  }
});

test("the template is refused in both spellings", () => {
  // It is the mold every product stamps from; deleting it takes every future product with it.
  assert.match(nameProblem("template") ?? "", /mold/);
  assert.match(nameProblem("_template") ?? "", /mold/);
  assert.ok(nameProblem("_anything"));
});

test("a missing name is refused with usage rather than a crash", () => {
  assert.match(nameProblem(undefined) ?? "", /usage:/);
  assert.match(nameProblem("") ?? "", /usage:/);
});

test("names the generator could never produce are refused", () => {
  // Removal accepts exactly what creation produces; anything else is a typo or an attack.
  for (const name of ["Demo", "1demo", "-demo", "demo!", "demo.old", "demo ", " demo"]) {
    assert.ok(nameProblem(name), `should be refused: ${name}`);
  }
});

test("the accepted pattern is the same one new-product enforces", () => {
  // Spelled out rather than imported from the generator: if the two ever diverge, the divergence
  // should be a failing test, not a silently wider delete.
  assert.equal(NAME_RE.source, "^[a-z][a-z0-9-]*$");
});

test("a legal name resolves to a DIRECT child of products/", () => {
  const productsDir = join("/repo", "products");
  assert.equal(destFor("demo", productsDir), join(productsDir, "demo"));
});

test("destFor refuses to resolve outside products/, even if the pattern were loosened", () => {
  // Belt and braces. A destructive command should not have exactly one thing standing between a
  // typo and the repository, so this holds regardless of what nameProblem allows.
  const productsDir = join("/repo", "products");
  for (const name of ["..", "../packages", "a/b"]) {
    assert.throws(() => destFor(name, productsDir), /outside products/, name);
  }
});

test("a Windows file lock is classified as a lock error, with the actionable exit", () => {
  // The shape uvicorn --reload orphans produce: rmSync throws EPERM (or EBUSY/EACCES,
  // depending on which process holds the handle). These must become a "stop your dev
  // servers and re-run" message, never a raw stack trace after the stack was stopped but
  // before tokens.config.json cleanup — that half-completed state is the bug being pinned.
  for (const code of ["EPERM", "EBUSY", "ENOTEMPTY", "EACCES"]) {
    assert.ok(isFileLockError({ code }), code);
  }
});

test("real script failures are NOT swallowed as lock errors", () => {
  // A genuine bug (undefined path, bad permissions model, anything else) must still throw
  // loudly — classifying everything as "re-run" would hide real breakage behind advice.
  for (const error of [{ code: "ENOENT" }, { code: "ERR_FS_EISDIR" }, {}, new Error("boom")]) {
    assert.ok(!isFileLockError(error));
  }
  assert.ok(!isFileLockError(undefined));
  assert.ok(!isFileLockError(null));
});
