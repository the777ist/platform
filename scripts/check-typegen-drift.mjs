#!/usr/bin/env node
// scripts/check-typegen-drift.mjs — the generated api-client and openapi.json must match the API.
//
// CLAUDE.md: "The generated api-client is NEVER hand-edited — regen via /typegen; CI fails on
// drift." This is that check, in ONE place, called by both the pre-push hook and CI so the two
// cannot enforce different things.
//
// It replaces `git diff --exit-code`, which had a hole big enough to drive a router through:
// `git diff` does not look at UNTRACKED files. Regenerating a client after adding a router
// produces NEW files — a service module, a types module — and those are untracked, so the diff
// came back empty and CI went green while the committed client was missing them. That is the
// normal growth path for every product, not an edge case, and the failure only surfaces later as
// a client that cannot call an endpoint the API definitely has.
//
// `git status --porcelain` reports modified, deleted AND untracked in one pass. It is also
// READ-ONLY, which matters here: the obvious alternative, `git add --intent-to-add`, would leave
// intent-to-add entries in the developer's index every time the pre-push hook ran.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Literal paths, resolved here, NEVER a wildcard pathspec.
//
// This is the bug that made the pre-push copy of this check inert for its entire life. Git
// matches a non-literal pathspec against the WHOLE path, so `products/*/api-client` matches the
// directory itself and nothing inside it: `git diff -- "products/*/api-client"` returned 0 with
// a modified file sitting right there. CI only worked by accident — its glob is unquoted, so
// the SHELL expanded it into real directory names before git ever saw it, and a literal
// directory prefix does match its contents.
//
// Resolving the paths in JS removes the shell, the pathspec rules and the platform differences
// from the answer in one go.
export function driftPaths(root = ROOT) {
  const products = join(root, "products");
  if (!existsSync(products)) return [];
  const paths = [];
  for (const name of readdirSync(products).sort()) {
    // Keyed off the API, not off the client: a product whose api-client directory was deleted
    // wholesale is the most severe drift there is, and keying off the client would skip it.
    if (!existsSync(join(root, "products", name, "api"))) continue;
    paths.push(`products/${name}/api-client`, `products/${name}/api/openapi.json`);
  }
  return paths;
}

/** `git status --porcelain` lines -> [{ code, path }]. */
export function parsePorcelain(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({ code: line.slice(0, 2), path: line.slice(3).trim() }));
}

/** Plain English for a porcelain code, so the failure says what to do about it. */
export function describeEntry({ code, path }) {
  const trimmed = code.trim();
  if (trimmed === "??") return `${path} — NEW, never committed`;
  if (trimmed.includes("D")) return `${path} — deleted by the regen`;
  return `${path} — modified by the regen`;
}

/** Everything under the generated paths that differs from HEAD, untracked files included. */
export function findDrift(root = ROOT) {
  const out = execFileSync("git", ["status", "--porcelain", "--", ...driftPaths(root)], {
    cwd: root,
    encoding: "utf8",
  });
  return parsePorcelain(out);
}

function main() {
  if (!existsSync(join(ROOT, "products"))) {
    console.log("check-typegen-drift: no products/ directory");
    return;
  }

  const drift = findDrift();
  if (drift.length > 0) {
    console.error("");
    console.error("❌ Generated-artifact drift — the API and its committed client disagree:");
    for (const entry of drift) console.error(`     ${describeEntry(entry)}`);
    console.error("");
    // Shown for context, and deliberately not the check itself: this prints nothing at all for
    // the untracked case, which is exactly why it could not be trusted to detect drift.
    try {
      const diff = execFileSync("git", ["diff", "--", ...driftPaths()], {
        cwd: ROOT,
        encoding: "utf8",
      });
      if (diff.trim()) console.error(diff);
    } catch {
      /* the porcelain listing above is the finding; a diff is a nicety */
    }
    console.error("   Commit the regenerated output, or re-run /typegen <product>.");
    process.exit(1);
  }

  console.log("check-typegen-drift: generated api-client + openapi.json match the API");
}

// Guarded so importing this module (to test the rules) does not run git or exit the process.
if (
  process.argv[1] &&
  process.argv[1]
    .split(String.fromCharCode(92))
    .join("/")
    .endsWith("scripts/check-typegen-drift.mjs")
) {
  main();
}
