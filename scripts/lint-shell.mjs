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
// Discovery is by DIRECTORY WALK, not a hardcoded list, so a new hook script is covered the moment
// it is added rather than the day someone remembers to add it here.
import { execFileSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEARCH_DIRS = [".lefthook", "scripts"];

function shellScriptsIn(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sh"))
    .map((entry) => join(abs, entry.name))
    .sort();
}

const scripts = SEARCH_DIRS.flatMap(shellScriptsIn);
if (scripts.length === 0) {
  console.log("lint-shell: no shell scripts found");
  process.exit(0);
}

let failed = 0;
for (const script of scripts) {
  try {
    execFileSync("sh", ["-n", script], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    failed += 1;
    console.error(`❌ ${relative(ROOT, script)}`);
    const detail = (error.stderr ?? "").toString().trim();
    if (detail) console.error(detail);
  }
}

if (failed > 0) {
  console.error(`lint-shell: ${failed} shell script(s) failed to parse`);
  process.exit(1);
}
console.log(`lint-shell: ${scripts.length} shell script(s) parse cleanly`);
