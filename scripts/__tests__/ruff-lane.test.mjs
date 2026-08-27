// .lefthook/ruff.sh is the pre-commit Ruff lane. "No shared Python between products" (CLAUDE.md)
// means each product api is its OWN uv universe, with its own .venv and its own ruff — so a
// commit touching two products needs ruff invoked once PER project, with only that project's
// files. Resolving one project from the first staged file and applying it to all of them lints
// product B's code with product A's toolchain: a wrong result that still exits 0.
//
// Tested the same way as the pre-push hook — the REAL script, unmodified, with `uv` stubbed on
// PATH so the invocations are observable without running anything.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LANE = join(ROOT, ".lefthook", "ruff.sh");

/** A scratch repo with two uv projects and a `uv` that reports its arguments instead of running. */
function scratch({ uvExit = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ruff-lane-"));
  mkdirSync(join(dir, "bin"), { recursive: true });
  const stub = join(dir, "bin", "uv");
  // One ARG line per argument, so a path containing a space is visibly ONE argument.
  writeFileSync(
    stub,
    `#!/bin/sh\nfor a in "$@"; do printf 'ARG:%s\n' "$a"; done\nexit ${uvExit}\n`,
  );
  chmodSync(stub, 0o755);

  for (const project of ["a", "b"]) {
    mkdirSync(join(dir, "repo", project, "src", "mod", "routers"), { recursive: true });
    writeFileSync(join(dir, "repo", project, "pyproject.toml"), "[project]\n");
  }
  mkdirSync(join(dir, "repo", "loose"), { recursive: true });
  copyFileSync(LANE, join(dir, "repo", "ruff.sh"));
  return {
    dir,
    repo: join(dir, "repo"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function runLane(s, args, { expectFail = false } = {}) {
  try {
    return {
      out: execFileSync("sh", ["ruff.sh", ...args], {
        cwd: s.repo,
        encoding: "utf8",
        env: { ...process.env, PATH: `${join(s.dir, "bin")}:${process.env.PATH}` },
      }),
      code: 0,
    };
  } catch (error) {
    if (!expectFail) throw error;
    return { out: (error.stdout ?? "").toString(), code: error.status };
  }
}

/** The file arguments of each `uv run --project X` invocation, keyed by project. */
function invocations(out) {
  const byProject = {};
  let current = null;
  for (const line of out.split(/\r?\n/).filter(Boolean)) {
    const arg = line.replace(/^ARG:/, "");
    if (arg === "--project") {
      current = "PENDING";
      continue;
    }
    if (current === "PENDING") {
      current = arg;
      byProject[current] ??= [];
      continue;
    }
    if (current && !["run", "ruff", "check", "format", "--fix"].includes(arg)) {
      byProject[current].push(arg);
    }
  }
  return byProject;
}

test("each project is linted with ONLY its own files", () => {
  // The whole reason this is a script. One invocation with both products' files would lint B's
  // code against A's ruff and config, and exit 0 having done the wrong thing.
  const s = scratch();
  try {
    const { out } = runLane(s, ["check", "a/src/one.py", "b/src/two.py"]);
    assert.deepEqual(invocations(out), { a: ["a/src/one.py"], b: ["b/src/two.py"] });
  } finally {
    s.cleanup();
  }
});

test("a deeply nested file still resolves to its own project", () => {
  // `dirname`/.. only works for a file one level down; src/mod/routers/items.py is four.
  const s = scratch();
  try {
    const { out } = runLane(s, ["check", "a/src/mod/routers/items.py"]);
    assert.deepEqual(invocations(out), { a: ["a/src/mod/routers/items.py"] });
  } finally {
    s.cleanup();
  }
});

test("a path containing a SPACE stays one path", () => {
  // The positional-parameter idiom exists for this. Joined into a string it becomes two
  // arguments, and ruff is handed two paths that do not exist.
  const s = scratch();
  try {
    const { out } = runLane(s, ["check", "a/src/two words.py"]);
    assert.deepEqual(invocations(out), { a: ["a/src/two words.py"] });
  } finally {
    s.cleanup();
  }
});

test("format mode runs the formatter, not the checker", () => {
  const s = scratch();
  try {
    assert.match(runLane(s, ["format", "a/src/one.py"]).out, /ARG:format/);
    assert.doesNotMatch(runLane(s, ["format", "a/src/one.py"]).out, /ARG:--fix/);
  } finally {
    s.cleanup();
  }
});

test("an unknown mode exits 2 rather than guessing", () => {
  const s = scratch();
  try {
    assert.equal(runLane(s, ["lint", "a/src/one.py"], { expectFail: true }).code, 2);
  } finally {
    s.cleanup();
  }
});

test("no files means no invocation at all", () => {
  // lefthook passes an empty list when nothing staged matches; running ruff over the whole
  // project then would turn a 5s tier into a slow one.
  const s = scratch();
  try {
    const { out, code } = runLane(s, ["check"]);
    assert.equal(code, 0);
    assert.deepEqual(invocations(out), {});
  } finally {
    s.cleanup();
  }
});

test("a file belonging to no project is skipped, not guessed at", () => {
  const s = scratch();
  try {
    const { out } = runLane(s, ["check", "loose/stray.py"]);
    assert.deepEqual(invocations(out), {});
  } finally {
    s.cleanup();
  }
});

test("a ruff failure propagates and blocks the commit", () => {
  // This tier repairs rather than reports, but a violation ruff CANNOT fix must still stop the
  // commit — otherwise the auto-fixer silently becomes an auto-ignorer.
  const s = scratch({ uvExit: 1 });
  try {
    assert.notEqual(runLane(s, ["check", "a/src/one.py"], { expectFail: true }).code, 0);
  } finally {
    s.cleanup();
  }
});
