// The .lefthook/*.sh scripts run on EVERY commit and EVERY push. A syntax error in one of them
// does not fail a test somewhere — it blocks every developer from committing at all, and it
// surfaces as raw sh noise in the middle of a hook. Nothing else in the repo reads these files:
// eslint does not parse shell, prettier does not format it.
//
// So the checker itself has to be right about two things: it must FIND every script, and it must
// tell a broken script apart from a missing shell.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { shellScripts, checkScript } from "../lint-shell.mjs";

const withScript = (contents, fn) => {
  const dir = mkdtempSync(join(tmpdir(), "lint-shell-"));
  try {
    const file = join(dir, "probe.sh");
    writeFileSync(file, contents);
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("a valid script parses", () => {
  const problem = withScript('set -e\nif [ -n "$1" ]; then echo ok; fi\n', checkScript);
  assert.equal(problem, null);
});

test("an unbalanced construct is reported as a parse error", () => {
  // The realistic failure: an `if` whose `fi` was lost in an edit. sh accepts the file as text
  // and only discovers this when the hook runs, i.e. when it is already blocking someone.
  const problem = withScript('if [ -n "$1" ]; then\n  echo ok\n', checkScript);
  assert.equal(problem?.kind, "parse-error");
});

test("an unterminated quote is reported as a parse error", () => {
  const problem = withScript('echo "unterminated\n', checkScript);
  assert.equal(problem?.kind, "parse-error");
});

test("the check does not EXECUTE the script", () => {
  // `sh -n` parses only. If this ever became a real run, checking a hook script would fire that
  // hook's side effects — deleting files, pushing, whatever it does — every time anyone linted.
  const dir = mkdtempSync(join(tmpdir(), "lint-shell-canary-"));
  const canary = join(dir, "written-by-side-effect").split(String.fromCharCode(92)).join("/");
  try {
    const problem = withScript(
      `echo side-effect > "${canary}"
`,
      checkScript,
    );
    assert.equal(problem, null, "the script is valid shell and must parse");
    assert.ok(!existsSync(canary), "checkScript RAN the script instead of parsing it");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("discovery finds the hook scripts that actually gate this repo", () => {
  const found = shellScripts();
  // These two are what pre-commit and pre-push execute. A discovery change that stops finding
  // them leaves the gate scripts unchecked while still reporting success.
  assert.ok(
    found.includes(".lefthook/pre-push.sh"),
    `pre-push.sh not discovered — found: ${found.join(", ")}`,
  );
  assert.ok(found.includes(".lefthook/ruff.sh"), found.join(", "));
});

test("discovery is repo-wide, not limited to a fixed directory list", () => {
  // Every result is a repo-relative path from git, so a script added under products/ or in a
  // subdirectory is covered the moment it is committed.
  for (const path of shellScripts()) {
    assert.ok(path.endsWith(".sh"), path);
    assert.ok(
      !path.startsWith("/") && !path.includes(".."),
      `expected a repo-relative path: ${path}`,
    );
  }
});

test("discovery is sorted, so output is stable across platforms", () => {
  const found = shellScripts();
  assert.deepEqual(found, [...found].sort());
});
