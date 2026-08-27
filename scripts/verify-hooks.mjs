#!/usr/bin/env node
// scripts/verify-hooks.mjs — assert the hooks lefthook just installed will actually RUN.
//
// The failure this exists for is silent and total: if `core.hooksPath` is set (some corporate git
// setups and a few dev tools do this globally), git ignores `.git/hooks` entirely. `lefthook
// install` still writes the files and still prints "sync hooks ✔️", so everything looks healthy
// while every commit and every push goes completely ungated. Verified: with a hooksPath set, a
// commit whose message was "bad message that must be blocked" sailed straight through.
//
// This WARNS rather than fails. A global hooksPath may be deliberate (security scanning), and
// breaking `pnpm install` on such a machine would be worse than the thing being warned about —
// CI re-runs every one of these gates unconditionally either way. What matters is that the state
// is VISIBLE instead of silent.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const git = (args) => {
  try {
    return execSync(`git ${args}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

// Not a git repo (a tarball export, a docker build context) — nothing to verify, nothing to warn.
const gitDir = git("rev-parse --git-dir");
if (!gitDir) process.exit(0);

const hooksPath = git("config core.hooksPath");
const warn = (lines) => {
  const width = Math.max(...lines.map((l) => l.length)) + 2;
  console.warn("");
  console.warn("!".repeat(width));
  for (const line of lines) console.warn(`! ${line}`);
  console.warn("!".repeat(width));
  console.warn("");
};

if (hooksPath) {
  warn([
    "GIT HOOKS ARE DISABLED IN THIS REPO",
    "",
    `core.hooksPath is set to: ${hooksPath}`,
    "git therefore ignores .git/hooks, where lefthook just installed the hooks --",
    "so pre-commit, commit-msg and pre-push will NOT run. No formatting, no",
    "commit-message check, no affected gate. CI still runs all of it.",
    "",
    "To use this repo's hooks, point this repo back at them:",
    "  git config --local core.hooksPath .git/hooks",
    "(If your organisation sets core.hooksPath deliberately, leave it and rely on CI.)",
  ]);
  process.exit(0);
}

// hooksPath is unset, so git uses .git/hooks — confirm lefthook actually put them there.
const missing = ["pre-commit", "commit-msg", "pre-push"].filter(
  (hook) => !existsSync(join(gitDir, "hooks", hook)),
);
if (missing.length > 0) {
  warn([
    "GIT HOOKS ARE MISSING",
    "",
    `not installed: ${missing.join(", ")}`,
    "Run `pnpm install` (which runs `lefthook install`) or `pnpm exec lefthook install`.",
  ]);
}
