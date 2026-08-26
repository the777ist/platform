#!/usr/bin/env node
// scripts/check-realtime-broadcast-only.mjs — realtime stays BROADCAST-ONLY.
//
// The locked decision (CLAUDE.md, PHILOSOPHY): tables stay RLS-deny-all, the API broadcasts
// `invalidate` on a per-product channel using the service role, and clients refetch through the
// API. "No Postgres-Changes subscriptions, no RLS holes."
//
// Those two halves are one decision. A `postgres_changes` subscription reads rows straight from
// the database over the client's own credentials, so it returns NOTHING under deny-all — and the
// natural fix, at 5pm, is to add a permissive SELECT policy. That is the RLS hole, and it does
// not arrive labelled as one: it arrives as "realtime wasn't working, so I opened up the table".
// By then the rows are readable by every authenticated user of the project.
//
// Nothing prevented it. The rule was written in two documents and enforced by nobody.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Both spellings: the wire value supabase-js expects, and the camelCase a helper might wrap it in.
const POSTGRES_CHANGES = /\bpostgres[_-]?changes\b|\bpostgresChanges\b/i;

/** Client code — where a subscription would be written. The API is service-role and exempt. */
export function clientSourceFiles(root = ROOT) {
  return execFileSync("git", ["ls-files", "packages/*/src/*", "products/*/app/*"], {
    cwd: root,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((f) => /\.[cm]?[jt]sx?$/.test(f))
    .sort();
}

/** True when a line subscribes to Postgres changes rather than to a broadcast. */
export function usesPostgresChanges(line) {
  // A line that only NAMES the rule is documentation, not a subscription. Without this the
  // guard flags its own explanation and the comments that keep the decision legible.
  const withoutComment = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
  return POSTGRES_CHANGES.test(withoutComment);
}

function main() {
  if (!existsSync(join(ROOT, "packages"))) {
    console.log("check-realtime-broadcast-only: nothing to scan");
    return;
  }
  const files = clientSourceFiles();
  const hits = [];
  for (const file of files) {
    readFileSync(join(ROOT, file), "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (usesPostgresChanges(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
      });
  }

  if (hits.length > 0) {
    console.error("");
    console.error("❌ Postgres-Changes subscription in client code — realtime is BROADCAST-ONLY:");
    for (const hit of hits) console.error(`     ${hit}`);
    console.error("");
    console.error("   Tables are RLS-deny-all, so this returns nothing, and the tempting fix is a");
    console.error("   permissive SELECT policy — which makes every row readable by every");
    console.error("   authenticated user of the project. Broadcast `invalidate` from the API");
    console.error("   instead and let the client refetch through it.");
    process.exit(1);
  }

  console.log(`check-realtime-broadcast-only: ${files.length} client file(s), broadcast only`);
}

// Guarded so importing this module (to test the rule) does not run the scan or exit the process.
if (
  process.argv[1] &&
  process.argv[1]
    .split(String.fromCharCode(92))
    .join("/")
    .endsWith("scripts/check-realtime-broadcast-only.mjs")
) {
  main();
}
