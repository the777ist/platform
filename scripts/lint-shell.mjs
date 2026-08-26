#!/usr/bin/env node
// scripts/lint-shell.mjs — syntax-check every shell script the git hooks execute.
//
// Why this earns its place: `.lefthook/*.sh` is run by EVERY commit and EVERY push. A syntax error
// in one of them does not fail a test somewhere — it blocks every developer from committing at all,
// and the error surfaces as raw sh noise in the middle of a hook. Nothing else in the repo looks at
// these files: eslint does not read shell, and prettier does not format it.
//
// `sh -n` parses without executing, so this is a few milliseconds and has no side effects.
//
// Discovery follows GIT, not a list of directories, so a shell script added anywhere in the repo
// is covered the moment it is committed rather than the day someone remembers to add it here.
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every shell script the repo tracks, wherever it lives.
 *
 * Asked of git rather than walked from a list of directories. An earlier version read
 * `.lefthook/` and `scripts/` non-recursively, which covered both scripts that exist today and
 * would silently have skipped one added in a subdirectory or under products/ — while the comment
 * above it claimed otherwise. Following the repo also means node_modules and .venv are never
 * walked, the same reason the other guards use `git ls-files`.
 */
export function shellScripts(root = ROOT) {
  return execFileSync("git", ["ls-files", "*.sh"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
}

/**
 * Parse one script without executing it. Returns null when it parses, else the reason.
 *
 * `sh -n` is a few milliseconds and has no side effects. ENOENT is reported separately because
 * it means `sh` itself is missing, not that the script is broken — say which, or the next person
 * spends an hour looking for a syntax error that is not there.
 */
export function checkScript(absPath) {
  try {
    execFileSync("sh", ["-n", absPath], { stdio: ["ignore", "pipe", "pipe"] });
    return null;
  } catch (error) {
    if (error.code === "ENOENT") return { kind: "no-shell", detail: "" };
    return { kind: "parse-error", detail: (error.stderr ?? "").toString().trim() };
  }
}

function main() {
  const scripts = shellScripts();
  if (scripts.length === 0) {
    console.log("lint-shell: no shell scripts found");
    return;
  }

  let failed = 0;
  for (const script of scripts) {
    const problem = checkScript(join(ROOT, script));
    if (!problem) continue;
    failed += 1;
    if (problem.kind === "no-shell") {
      console.error(`❌ cannot run \`sh\` — no POSIX shell on PATH (needed to check ${script})`);
      continue;
    }
    console.error(`❌ ${script}`);
    if (problem.detail) console.error(problem.detail);
  }

  if (failed > 0) {
    console.error(`lint-shell: ${failed} shell script(s) failed to parse`);
    process.exit(1);
  }
  console.log(`lint-shell: ${scripts.length} shell script(s) parse cleanly`);
}

// Guarded so importing this module (to test the rules) does not shell out or exit the process.
if (
  process.argv[1] &&
  process.argv[1].split(String.fromCharCode(92)).join("/").endsWith("scripts/lint-shell.mjs")
) {
  main();
}
