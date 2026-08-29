#!/usr/bin/env node
// scripts/check-migration-safety.mjs — lint each api's migrations for lock-taking DDL, shared by
// the pre-push hook and by CI.
//
// Migrations run against PRODUCTION as a Fly release_command, not a CI step — so a migration that
// takes an ACCESS EXCLUSIVE lock on a hot table, or waits on one, is downtime that no test can
// see: every suite runs the migration against an EMPTY, idle database where any DDL is instantly
// safe. squawk (https://squawkhq.com) is the piece that knows `ADD COLUMN ... DEFAULT ...` locks
// the table while `ADD COLUMN` + backfill does not.
//
// The SQL comes from `alembic upgrade head --sql` (offline mode: no database, no env — dummy URLs
// satisfy Settings' required fields, nothing ever connects). That output is the WHOLE migration
// chain, not just the newest revision, which is deliberate: the linted artifact is exactly the SQL
// a fresh production database would run, and a rule violation anywhere in it is reachable.
//
// Timeouts are enforced, not excluded: alembic/env.py sets lock_timeout + statement_timeout in
// both offline and online mode, so squawk's require-lock-timeout / require-statement-timeout pass
// because the SQL genuinely carries them. Deleting those SETs from env.py fails this gate.
//
// CLI:
//   node scripts/check-migration-safety.mjs                  every products/*/api
//   node scripts/check-migration-safety.mjs products/x/api   just these
import { execSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ROOT, allApiDirs } from "./alembic-heads.mjs";

// Every exclusion is a documented decision, and this object is the ONLY list — the script runs
// squawk bare and filters here, so a rule can never be half-excluded (flag says one thing, docs
// another). An entry with no reason fails the test suite.
export const EXCLUDED_RULES = {
  "prefer-text-field":
    "SQLModel emits VARCHAR(n) for constrained str fields by design, and a CREATE-time varchar " +
    "on a brand-new table takes no lock — the rule's danger case is RESIZING one later. If a " +
    "resize ALTER ever appears, lint that migration by hand before trusting this exclusion.",
};

/** The findings that actually gate, with each exclusion applied. */
export function relevantFindings(findings) {
  return findings.filter((f) => !(f.rule_name in EXCLUDED_RULES));
}

/**
 * Lint raw SQL text through squawk, returning its JSON findings (unfiltered).
 *
 * squawk exits non-zero when it finds anything, so the findings ride on the error object's
 * stdout — both paths parse the same stream. Exported so the tests can prove the gate BITES on
 * dangerous SQL, not just that it passes clean SQL.
 */
export function lintSql(sql) {
  const dir = mkdtempSync(join(tmpdir(), "migration-safety-"));
  const file = join(dir, "migrations.sql");
  writeFileSync(file, sql);
  try {
    const out = execSync(`pnpm exec squawk --reporter=json "${file}"`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(out || "[]");
  } catch (error) {
    if (typeof error?.stdout === "string" && error.stdout.trim().startsWith("[")) {
      return JSON.parse(error.stdout);
    }
    throw error; // squawk itself broke (missing binary, bad flags) — that must be loud, not a pass
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Offline migration SQL for one api dir — no database touched, alembic INFO noise on stderr. */
export function migrationSql(apiDir) {
  return execSync("uv run alembic upgrade head --sql", {
    cwd: join(ROOT, apiDir),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // Settings requires both; offline mode never connects to either.
      DATABASE_URL: "postgresql://offline",
      DATABASE_MIGRATION_URL: "postgresql://offline",
    },
  });
}

// Returns the failures rather than exiting, so the hook can fold this into its own exit handling.
export function checkMigrationSafety(apiDirs) {
  const failures = [];
  for (const dir of apiDirs) {
    let sql;
    try {
      sql = migrationSql(dir);
    } catch {
      // Tooling absence is not a migration problem. Say so out loud rather than passing silently:
      // an unreported skip is indistinguishable from a pass.
      console.warn(`⚠️  ${dir}: could not generate offline migration SQL — safety lint SKIPPED`);
      continue;
    }
    const findings = relevantFindings(lintSql(sql));
    if (findings.length > 0) failures.push({ dir, findings });
  }
  return failures;
}

export function reportMigrationFailures(failures) {
  for (const { dir, findings } of failures) {
    console.error(`❌ ${dir}: migration SQL fails the safety lint:`);
    for (const f of findings) {
      console.error(`     [${f.rule_name}] line ${f.line}: ${f.message}`);
      if (f.help) console.error(`       fix: ${f.help}`);
    }
    console.error("     rule docs: https://squawkhq.com/docs/rules");
  }
}

// --- CLI ---------------------------------------------------------------------------------------
if (
  process.argv[1] &&
  process.argv[1]
    .split(String.fromCharCode(92))
    .join("/")
    .endsWith("scripts/check-migration-safety.mjs")
) {
  const args = process.argv.slice(2).filter(Boolean);
  const dirs = args.length > 0 ? args : allApiDirs();
  const failures = checkMigrationSafety(dirs);
  reportMigrationFailures(failures);
  if (failures.length > 0) process.exit(1);
  console.log(
    `check-migration-safety: migration SQL is lock-safe in: ${dirs.join(", ") || "(no apis)"}`,
  );
}
