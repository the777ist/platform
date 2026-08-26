#!/usr/bin/env node
// scripts/check-focused-tests.mjs — fail on a focused test that escaped into a commit.
//
// The failure mode is a FALSE GREEN, which is the only kind of CI failure that actually matters:
// `describe.only` / `it.only` / `test.only` makes Jest run that one test and exit 0, so the suite
// goes green having verified almost nothing. Playwright has its own guard (`forbidOnly` in CI),
// but Jest has no equivalent flag and this repo carries no eslint-plugin-jest — so nothing caught
// it. The ptfm prompts demand "zero .only, zero .skip"; this is what makes that enforceable rather
// than aspirational.
//
// `.only` is an ERROR: it is never correct in committed code.
// `.skip` is reported but does NOT fail: a deliberately quarantined test is legitimate, and making
// it fatal would just push people to delete tests instead of skipping them.
//
// Files come from `git ls-files`, so it follows the repo rather than a hardcoded path list and
// never walks node_modules or a .venv.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// `\b` before the call keeps `foo.only(` from matching things like `readOnly(`.
const ONLY = /\b(?:describe|it|test)\s*\.\s*only\s*\(/;
const SKIP = /\b(?:describe|it|test)\s*\.\s*skip\s*\(/;

/** Exported so the rules are testable directly, with no filesystem and no git. */
export function isFocused(line) {
  return ONLY.test(line);
}
export function isSkipped(line) {
  return SKIP.test(line);
}
export function isTestFile(path) {
  return TEST_FILE.test(path);
}

function main() {
  const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/)
    .filter((f) => f && isTestFile(f));

  const focused = [];
  const skipped = [];
  for (const file of files) {
    const lines = readFileSync(join(ROOT, file), "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (isFocused(line)) focused.push(`${file}:${i + 1}: ${line.trim()}`);
      else if (isSkipped(line)) skipped.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }

  for (const hit of skipped) console.warn(`⚠️  skipped test: ${hit}`);

  if (focused.length > 0) {
    console.error("");
    console.error("❌ Focused test(s) found — CI would go green having run almost nothing:");
    for (const hit of focused) console.error(`     ${hit}`);
    console.error("   Remove the `.only` before this lands.");
    process.exit(1);
  }

  console.log(
    `check-focused-tests: ${files.length} test file(s) scanned, no .only` +
      (skipped.length ? `, ${skipped.length} skipped test(s) reported above` : ""),
  );
}

// Guarded so importing this module (to test the rules) does not run the scan or exit the process.
if (
  process.argv[1] &&
  process.argv[1]
    .split(String.fromCharCode(92))
    .join("/")
    .endsWith("scripts/check-focused-tests.mjs")
) {
  main();
}
