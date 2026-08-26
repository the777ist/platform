// "The generated api-client is NEVER hand-edited — regen via /typegen; CI fails on drift"
// (CLAUDE.md). This is the check behind that sentence, and both of its previous implementations
// were broken in ways nothing could see from the outside:
//
//   pre-push  `git diff --exit-code -- "products/*/api-client"` — INERT. Git matches a
//             non-literal pathspec against the whole path, so the wildcard matched the directory
//             and never its contents. It returned 0 with a modified client sitting right there.
//   CI        the same command UNQUOTED, so the shell expanded it into real directory names and
//             modified files were caught — but `git diff` never looks at untracked files, and a
//             regen after adding a router produces new ones. A client missing an entire service
//             module reported clean.
//
// A drift check that cannot fail is worse than no drift check: it is a green tick that means
// nothing. So these tests exercise the real repo and real git, not a parser in isolation.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync, existsSync, mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  driftPaths,
  parsePorcelain,
  describeEntry,
  findDrift,
  ROOT,
} from "../check-typegen-drift.mjs";

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

test("drift paths are literal, never wildcards", () => {
  // The entire pre-push bug in one assertion. A `*` here means git matches the pathspec against
  // whole paths and silently sees nothing inside the directory.
  for (const path of driftPaths()) {
    assert.ok(!path.includes("*"), `pathspec must be literal, got: ${path}`);
  }
});

test("every product with an api contributes both artefacts", () => {
  const paths = driftPaths();
  assert.ok(paths.includes("products/_template/api-client"), paths.join(", "));
  assert.ok(paths.includes("products/_template/api/openapi.json"), paths.join(", "));
  assert.ok(paths.includes("products/demo/api-client"), paths.join(", "));
});

test("a product whose api-client directory is GONE still gets checked", () => {
  // Keyed off the api, not off the client. Keying off the client looks equivalent — every
  // product has one today — but it means a wholesale deletion of api-client removes the product
  // from the check entirely and the run reports clean. That is the most severe drift there is
  // reported as success, so it is asserted against a fixture with the directory actually absent
  // rather than against the repo, where it can never happen.
  const root = mkdtempSync(join(tmpdir(), "drift-paths-"));
  try {
    mkdirSync(join(root, "products/ghost/api"), { recursive: true });
    // note: no products/ghost/api-client on disk
    assert.deepEqual(driftPaths(root), [
      "products/ghost/api-client",
      "products/ghost/api/openapi.json",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("porcelain codes are classified into the three shapes that matter", () => {
  // The expected strings live here rather than being imported, so a change to the wording of the
  // failure has to be made deliberately in both places.
  assert.match(describeEntry({ code: "??", path: "a.ts" }), /NEW, never committed/);
  assert.match(describeEntry({ code: " D", path: "a.ts" }), /deleted/);
  assert.match(describeEntry({ code: " M", path: "a.ts" }), /modified/);
  assert.match(describeEntry({ code: "M ", path: "a.ts" }), /modified/);
});

test("porcelain parsing keeps the path intact", () => {
  const parsed = parsePorcelain(
    "?? products/demo/api-client/new.ts\n M products/demo/api-client/x.ts\n",
  );
  assert.deepEqual(
    parsed.map((e) => e.path),
    ["products/demo/api-client/new.ts", "products/demo/api-client/x.ts"],
  );
  assert.equal(parsed[0].code.trim(), "??");
});

test("empty porcelain output is no drift, not one blank entry", () => {
  assert.deepEqual(parsePorcelain(""), []);
  assert.deepEqual(parsePorcelain("\n"), []);
});

test("the committed api-client currently matches the API", () => {
  // If this fails, the repo genuinely has drift — which is the check working.
  assert.deepEqual(findDrift(), []);
});

test("an UNTRACKED generated file is detected — the case CI was blind to", () => {
  // The realistic trigger: a product gains a router, the regen emits a new service module, and
  // it is never committed. `git diff` reports nothing at all for this.
  const probe = join(ROOT, "products/demo/api-client/__drift_probe__.ts");
  try {
    writeFileSync(probe, "// probe\n");
    const drift = findDrift();
    assert.ok(
      drift.some((e) => e.path.endsWith("__drift_probe__.ts")),
      `untracked file not detected: ${JSON.stringify(drift)}`,
    );
  } finally {
    rmSync(probe, { force: true });
  }
  assert.deepEqual(findDrift(), [], "the probe must not outlive the test");
});

test("a MODIFIED generated file is detected — the case pre-push was blind to", () => {
  const tracked = git("ls-files", "products/demo/api-client").split(/\r?\n/).filter(Boolean)[0];
  assert.ok(tracked, "expected demo's api-client to have tracked files");
  const abs = join(ROOT, tracked);
  assert.ok(existsSync(abs));
  try {
    writeFileSync(abs, "// drift probe\n", { flag: "a" });
    const drift = findDrift();
    assert.ok(
      drift.some((e) => e.path === tracked),
      `modified file not detected: ${JSON.stringify(drift)}`,
    );
  } finally {
    git("checkout", "--", tracked);
  }
  assert.deepEqual(findDrift(), [], "the probe must not outlive the test");
});
