// .lefthook/pre-push.sh decides what the pre-push gate actually checks. Every failure mode here
// is silent in the direction that matters: a base that scopes to nothing makes the gate pass
// instantly while checking nothing, and looks exactly like a clean push.
//
// The rules it encodes are subtle and were each learned the hard way — `exec < /dev/null` must
// come AFTER the read or the refs are gone; several refs pushed at once cannot share one base;
// a base that will not resolve must widen rather than skip (it used to `exit 0`). None of it was
// tested, because the script ends in `exec node scripts/pre-push.mjs "$base"` and running it for
// real means running the whole gate.
//
// So these run the REAL script, unmodified, inside a throwaway git repo where scripts/pre-push.mjs
// is a stub that prints the base it was handed. Nothing here is a reimplementation of the logic.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(ROOT, ".lefthook", "pre-push.sh");

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** A throwaway repo containing the real hook and a stub gate that reports its argument. */
function scratchRepo({ withOriginMain = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "prepush-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.test");
  git(dir, "config", "user.name", "T");
  git(dir, "config", "commit.gpgsign", "false");

  mkdirSync(join(dir, ".lefthook"), { recursive: true });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  copyFileSync(HOOK, join(dir, ".lefthook", "pre-push.sh"));
  // The stub stands in for the gate: it prints the base so the test can see what was derived.
  writeFileSync(
    join(dir, "scripts", "pre-push.mjs"),
    'process.stdout.write("GATE_BASE=" + process.argv[2]);',
  );

  writeFileSync(join(dir, "file.txt"), "one\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "first");
  const first = git(dir, "rev-parse", "HEAD");

  writeFileSync(join(dir, "file.txt"), "two\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "second");

  // `origin/main` is what the script falls back to; some cases need it absent.
  if (withOriginMain) git(dir, "update-ref", "refs/remotes/origin/main", first);
  return { dir, first, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function runHook(dir, stdin) {
  return execFileSync("sh", [".lefthook/pre-push.sh"], {
    cwd: dir,
    input: stdin,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

const ZERO = "0".repeat(40);

test("a single ref scopes to the REMOTE sha — what the remote already has", () => {
  // The whole point: gate the commits CI is about to see for the first time, not everything
  // since main.
  const repo = scratchRepo();
  try {
    const out = runHook(
      repo.dir,
      `refs/heads/main ${git(repo.dir, "rev-parse", "HEAD")} refs/heads/main ${repo.first}\n`,
    );
    assert.match(out, new RegExp(`GATE_BASE=${repo.first}`), out);
  } finally {
    repo.cleanup();
  }
});

test("a NEW branch (zero remote sha) falls back to the trunk", () => {
  const repo = scratchRepo();
  try {
    const out = runHook(
      repo.dir,
      `refs/heads/feat ${git(repo.dir, "rev-parse", "HEAD")} refs/heads/feat ${ZERO}\n`,
    );
    assert.match(out, /GATE_BASE=origin\/main/, out);
  } finally {
    repo.cleanup();
  }
});

test("a deletion-only push gates nothing and exits 0 — the ONLY case that may skip", () => {
  const repo = scratchRepo();
  try {
    const out = runHook(
      repo.dir,
      `(delete) ${ZERO} refs/heads/gone ${git(repo.dir, "rev-parse", "HEAD")}\n`,
    );
    assert.match(out, /branch deletion only/, out);
    assert.doesNotMatch(out, /GATE_BASE=/, "the gate must not run for a deletion");
  } finally {
    repo.cleanup();
  }
});

test("SEVERAL refs at once widen to __ALL__ rather than scoping to whichever came last", () => {
  // `git push --all`, or a branch plus a tag. One base cannot describe two ranges, and picking
  // one would leave every other ref's commits ungated.
  const repo = scratchRepo();
  try {
    const head = git(repo.dir, "rev-parse", "HEAD");
    const out = runHook(
      repo.dir,
      `refs/heads/main ${head} refs/heads/main ${repo.first}\nrefs/tags/v1 ${head} refs/tags/v1 ${ZERO}\n`,
    );
    assert.match(out, /GATE_BASE=__ALL__/, out);
  } finally {
    repo.cleanup();
  }
});

test("a deletion alongside a real ref still gates the real one", () => {
  // The deletion is skipped without counting toward nrefs, so this stays a single-range push.
  const repo = scratchRepo();
  try {
    const head = git(repo.dir, "rev-parse", "HEAD");
    const out = runHook(
      repo.dir,
      `(delete) ${ZERO} refs/heads/gone ${head}\nrefs/heads/main ${head} refs/heads/main ${repo.first}\n`,
    );
    assert.match(out, new RegExp(`GATE_BASE=${repo.first}`), out);
  } finally {
    repo.cleanup();
  }
});

test("EMPTY stdin with no usable base widens to __ALL__ — it never exits 0", () => {
  // This is the regression that matters most. Empty stdin means "could not scope" (a missing
  // `use_stdin: true`, a lefthook that does not forward it), NOT "nothing to push". The script
  // used to exit 0 here, which skipped the gate entirely and looked identical to passing it.
  const repo = scratchRepo({ withOriginMain: false });
  try {
    const out = runHook(repo.dir, "");
    assert.match(out, /GATE_BASE=__ALL__/, out);
  } finally {
    repo.cleanup();
  }
});

test("empty stdin WITH a trunk falls back to it rather than widening", () => {
  // The fallback chain still prefers a real range when one exists; widening is the last resort,
  // not the first.
  const repo = scratchRepo();
  try {
    assert.match(runHook(repo.dir, ""), /GATE_BASE=origin\/main/);
  } finally {
    repo.cleanup();
  }
});

test("a remote sha this clone does not have falls back instead of failing", () => {
  // A shallow clone, or a ref fetched by someone else. `git cat-file -e` is what detects it.
  const repo = scratchRepo();
  try {
    const missing = "1".repeat(40);
    const out = runHook(
      repo.dir,
      `refs/heads/main ${git(repo.dir, "rev-parse", "HEAD")} refs/heads/main ${missing}\n`,
    );
    assert.match(out, /GATE_BASE=origin\/main/, out);
  } finally {
    repo.cleanup();
  }
});

test("a 64-zero (SHA-256) deletion is recognised too", () => {
  // is_zero_sha matches by SHAPE. A hardcoded 40-zero constant would silently stop recognising
  // deletions and new branches in a SHA-256 repository.
  const repo = scratchRepo();
  try {
    const out = runHook(
      repo.dir,
      `(delete) ${"0".repeat(64)} refs/heads/gone ${git(repo.dir, "rev-parse", "HEAD")}\n`,
    );
    assert.match(out, /branch deletion only/, out);
  } finally {
    repo.cleanup();
  }
});
