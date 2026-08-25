#!/usr/bin/env node
// scripts/pre-push.mjs — the pre-push gate body (lefthook pre-push → .lefthook/pre-push.sh → here).
//
// TIER BUDGET: seconds when cached, ~83s per affected product when the web bundle has to rebuild.
// Scoped to what is actually being pushed. Correctness on the diff — type checks, the web bundle,
// unit tests, generated-artifact drift, alembic heads. Nothing that needs a container, a browser,
// or a device; those live in CI (PHILOSOPHY "Testing strategy"). The budget was deliberately
// raised rather than the coverage narrowed.
//
// Invoked with the diff base derived from git's pre-push refs, so the turbo selection covers
// exactly the commits the remote has not seen. Run it by hand with:
//   node scripts/pre-push.mjs origin/main
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { scopeFilter, affectedApiDirs, TURBO_TASKS } from "./affected.mjs";
import { checkAlembicHeads, reportFailures, allApiDirs } from "./alembic-heads.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2];
if (!BASE) {
  console.error("pre-push: missing diff base argument");
  process.exit(2);
}

// Scope and affected-API detection live in scripts/affected.mjs, shared verbatim with the CI
// workflow so the hook and CI can never select different things. That module also carries the
// two turbo traps this gate depends on: `--affected` is mutually exclusive with `--filter` (pass
// both and the filters are silently dropped), and a change to a GLOBAL input selects no package
// at all unless the scope is widened to everything.
// `__ALL__` is the sentinel .lefthook/pre-push.sh sends when it could not derive ONE range —
// several refs pushed at once, or no resolvable base at all. It means "gate every package", never
// "gate nothing".
const { filter: SCOPE, reason: scopeReason } =
  BASE === "__ALL__"
    ? { filter: "", reason: "the push could not be scoped to a single range" }
    : scopeFilter(BASE);
if (scopeReason) console.warn(`pre-push: selecting EVERY package — ${scopeReason}`);
// Same rule as affected.mjs: quote when present, omit entirely when not.
const SCOPE_ARG = SCOPE ? `"${SCOPE}"` : "";
const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: "inherit" });
const capture = (cmd, cwd = ROOT) =>
  execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const posix = (p) => p.replaceAll("\\", "/");

const affectedApis = affectedApiDirs(SCOPE);

// --- is that product's Postgres actually up? -------------------------------------------------
// Local API tests run against THAT product's own Supabase stack, on the port the CLI listens on.
// Read it from the stack's config.toml rather than re-deriving 54322+100·i — the formula already
// lives in config.toml, the api dev script, the generator and tests/__init__.py; a fifth copy is
// a fifth thing to drift (CLAUDE.md gotcha).
function testDbTarget(apiDir) {
  const url = process.env.TEST_DATABASE_URL; // honoured verbatim, exactly as the suite honours it
  if (url) {
    const m = url.match(/@([^/:]+)(?::(\d+))?/);
    if (m) return { host: m[1], port: Number(m[2] ?? 5432) };
  }
  if (process.env.CI) return { host: "localhost", port: 5432 };
  const cfg = join(ROOT, apiDir, "..", "supabase", "config.toml");
  if (!existsSync(cfg)) return null;
  // `shadow_port` sits in the same section and must not match: anchor on the line start.
  const db = readFileSync(cfg, "utf8")
    .split(/^\[/m)
    .find((s) => s.startsWith("db]"));
  const m = db?.match(/^\s*port\s*=\s*(\d+)/m);
  return m ? { host: "127.0.0.1", port: Number(m[1]) } : null;
}

const probe = (target) =>
  new Promise((resolve) => {
    const socket = createConnection({ host: target.host, port: target.port });
    const settle = (up) => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });

const down = [];
for (const api of affectedApis) {
  const target = testDbTarget(api.dir);
  if (!target || !(await probe(target))) down.push(api);
}

// --- the gate --------------------------------------------------------------------------------
const started = Date.now();
// `build` IS included, and it is the expensive part of this tier: desktop#build dependsOn
// `^export:web`, so a full `expo export --platform web` runs for every affected product —
// measured at 83s cold for one product, ~0s cached.
//
// It earns that. `expo export` is a Metro BUNDLE, and bundling fails in ways typecheck cannot
// see: an import that does not resolve at bundle time, a native-only module dragged into the web
// target, a path-alias or metro/NativeWind config break. Those are exactly the failures that are
// most annoying to discover after a push. It was omitted here at first purely to defend a 90s
// budget; correctness wins over the budget.
//
// The cost scales with the number of AFFECTED products, so a single-product change pays it once —
// only a shared packages/* change fans it out. If it ever becomes intolerable, drop "build" from
// this list rather than filtering the desktop package out: turbo ignores a task-scoped negative
// filter (`--filter=!<pkg>#build` silently changes nothing), and excluding the whole package would
// take desktop's cheap lint and typecheck down with it.
const TASKS = TURBO_TASKS; // shared with ci.yml via `affected.mjs tasks`

try {
  if (down.length === 0) {
    // Fast path: ONE scheduler invocation. Three sequential turbo calls would be two artificial
    // barriers — lint has no dependencies at all and would sit idle behind a build it never needed.
    run(`pnpm turbo run ${TASKS.join(" ")} ${SCOPE_ARG}`);
  } else {
    // Degraded path only: a product's local stack is down, so its pytest cannot run. Excluding the
    // package would also drop its ruff + pyright, so instead the run splits — everything except
    // `test` over the full selection, then `test` with only the unreachable APIs held back.
    for (const api of down) {
      console.warn(
        `⚠️  ${api.pkg}: Postgres unreachable — API tests SKIPPED, CI will run them.` +
          ` (start it with: pnpm bootstrap)`,
      );
    }
    const holdBack = down.map((a) => `--filter=!${a.pkg}`).join(" ");
    const withoutTest = TASKS.filter((t) => t !== "test").join(" ");
    run(`pnpm turbo run ${withoutTest} ${SCOPE_ARG}`);
    run(`pnpm turbo run test ${SCOPE_ARG} ${holdBack}`);
  }

  // Generated-artifact drift — the SAME command CI runs. `api-client#build` dependsOn `^openapi`,
  // so the run above already regenerated both; this is the near-free half of the highest-cost CI
  // failure there is. The generated client is never hand-edited (CLAUDE.md).
  try {
    run(`git diff --exit-code -- "products/*/api-client" "products/*/api/openapi.json"`);
  } catch {
    console.error("");
    console.error("❌ Generated-artifact drift: the diff above came from the build you just ran.");
    console.error("   Commit it (or re-run /typegen <product>) before pushing.");
    process.exit(1);
  }

  // Root-owned files (scripts/, *.config.mjs) belong to NO package, so `turbo run lint` never
  // reaches them — including these gate scripts themselves. Same entry point CI calls.
  run("pnpm run lint:root");

  // Two false-GREEN guards. A focused test makes the suite pass having run almost nothing, and an
  // embedded template token makes a stamped product document the template's own names. Both are
  // silent by nature, which is exactly why they are asserted rather than reviewed for.
  run("node scripts/check-focused-tests.mjs");
  run("node scripts/check-stamp-tokens.mjs");
  run("node scripts/check-committed-secrets.mjs");

  // One alembic head per api, through the SAME checker CI runs: a gate that lives only in a hook is
  // not actually enforced, because --no-verify skips it. Driven off the pushed diff rather than
  // turbo's selection so a migration-only change is covered no matter what got selected.
  // When the push could not be scoped (the __ALL__ sentinel), there is no range to diff — check
  // every api rather than letting `git diff __ALL__...HEAD` blow up and block the push on a raw
  // git error.
  const migrationApis =
    SCOPE === "" && BASE === "__ALL__"
      ? allApiDirs()
      : [
          ...new Set(
            capture(`git diff --name-only ${BASE}...HEAD`)
              .split(/\r?\n/)
              .filter(Boolean)
              .map((f) => posix(f).match(/^(products\/[^/]+\/api)\//)?.[1])
              .filter(Boolean),
          ),
        ];
  const headFailures = checkAlembicHeads(migrationApis);
  if (headFailures.length > 0) {
    reportFailures(headFailures);
    process.exit(1);
  }
} catch (error) {
  if (typeof error?.status === "number") process.exit(error.status || 1);
  throw error;
}

console.log(`✅ pre-push gate passed in ${Math.round((Date.now() - started) / 1000)}s`);
