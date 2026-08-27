#!/usr/bin/env node
// scripts/test-db-target.mjs — where a product's pytest suite expects to find Postgres.
//
// The pre-push gate probes this address and SKIPS that product's pytest when nothing answers,
// so that a developer without their stack up can still push (CI runs them regardless). That
// makes this function the switch deciding whether the Python suite runs at all — and every way
// it can be wrong ends in the suite being skipped on every push, for everyone, forever. The
// gate does print which product it skipped, so it is not silent; it is just very easy to stop
// reading.
//
// Read from the stack's config.toml rather than re-deriving 54322 + 100·i — that formula already
// lives in config.toml, the api dev script, the generator and tests/__init__.py, and a fifth copy
// is a fifth thing to drift (CLAUDE.md gotcha).
//
// config.toml holds THREE ports in the [db] family and only one of them is right:
//   [db]        port = 54322   <- this one
//   [db]        shadow_port    <- migration shadow database
//   [db.pooler] port           <- the transaction pooler
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** `[db] port` from a config.toml's text, or null. Exported so the parsing is testable alone. */
export function dbPortFrom(configText) {
  // Split on section headers and take the one that IS `[db]` — `.startsWith("db]")` excludes
  // `[db.pooler]` and `[db.migrations]`, whose ports are not the one we want.
  const section = configText.split(/^\[/m).find((s) => s.startsWith("db]"));
  // Anchored at line start so `shadow_port = …`, which sits in this very section, cannot match.
  const m = section?.match(/^\s*port\s*=\s*(\d+)/m);
  return m ? Number(m[1]) : null;
}

/**
 * The host/port a product's test suite will connect to, or null when it cannot be determined.
 *
 * The precedence matches tests/__init__.py exactly, and has to: if the gate probed one address
 * while the suite connected to another, it would skip a suite that would have run, or run one
 * that cannot connect.
 */
export function testDbTarget(apiDir, { env = process.env, root = ROOT } = {}) {
  const url = env.TEST_DATABASE_URL; // honoured verbatim, exactly as the suite honours it
  if (url) {
    const m = url.match(/@([^/:]+)(?::(\d+))?/);
    if (m) return { host: m[1], port: Number(m[2] ?? 5432) };
  }
  if (env.CI) return { host: "localhost", port: 5432 }; // the CI service container
  const cfg = join(root, apiDir, "..", "supabase", "config.toml");
  if (!existsSync(cfg)) return null;
  const port = dbPortFrom(readFileSync(cfg, "utf8"));
  return port === null ? null : { host: "127.0.0.1", port };
}
