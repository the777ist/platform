#!/usr/bin/env node
// scripts/pre-push.mjs — the pre-push gate body (lefthook pre-push → .lefthook/pre-push.sh → here).
//
// TIER BUDGET: ~90s, scoped to what is actually being pushed. Correctness on the diff — type
// checks, builds, unit tests, generated-artifact drift. Nothing that needs a container, a
// browser, or a device; those live in CI (PHILOSOPHY "Testing strategy").
//
// Invoked with the diff base derived from git's pre-push refs, so the turbo selection covers
// exactly the commits the remote has not seen. Run it by hand with:
//   node scripts/pre-push.mjs origin/main
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2];
if (!BASE) {
  console.error("pre-push: missing diff base argument");
  process.exit(2);
}

// HOW the scope is expressed: turbo's `--affected` flag is MUTUALLY EXCLUSIVE with `--filter` —
// pass both and the filters are SILENTLY dropped (verified with --dry=json: the selection comes
// back byte-identical with and without them). Every exclusion below is a filter, so spell out
// what the flag is shorthand for instead: `...[<base>...HEAD]` — changed packages AND their
// dependents, which is the co-evolve guard. Written as a filter, it composes.
// One behavioural difference is deliberate: the flag also counts UNCOMMITTED work, while a
// pre-push gate should judge the commits actually being pushed.
const SCOPE = `"--filter=...[${BASE}...HEAD]"`;
const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: "inherit" });
const capture = (cmd, cwd = ROOT) =>
  execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const posix = (p) => p.replaceAll("\\", "/");

// --- selection -------------------------------------------------------------------------------
// Every list below is DERIVED from the workspace. A hardcoded package list drifts silently, and
// every new product would opt out of the gate by default (CLAUDE.md: the generator stamps
// products; nothing should need editing here when it does).

// turbo's own answer to "what does --affected select", so the gate and the scheduler can never
// disagree about it. The banner line before the JSON is turbo's, not ours.
function turboDry(tasks) {
  const out = capture(`pnpm turbo run ${tasks} ${SCOPE} --dry=json`);
  return JSON.parse(out.slice(out.indexOf("{")));
}

// products/<name>/desktop — `desktop#build` dependsOn `^export:web`, i.e. a full
// `expo export --platform web` (minutes). It cannot hit this tier's budget, so the whole package
// moves out to CI. NOTE: turbo silently IGNORES a task-scoped negative filter
// (`--filter=!./products/*/desktop#build` selects the identical graph — verified with --dry=json),
// so excluding the package is the only mechanism that actually works.
const desktopPackages = existsSync(join(ROOT, "products"))
  ? readdirSync(join(ROOT, "products"))
      .map((p) => join(ROOT, "products", p, "desktop", "package.json"))
      .filter(existsSync)
      .map((f) => JSON.parse(readFileSync(f, "utf8")).name)
  : [];

const dry = turboDry("test");
// `task === "test"` matters: a dry run of `test` also reports the dependency tasks it pulls in
// (openapi, ^build), so matching on the package alone counts each api twice.
const affectedApis = [
  ...new Map(
    dry.tasks
      .filter((t) => t.task === "test" && t.command && t.command !== "<NONEXISTENT>")
      .map((t) => ({ pkg: t.package, dir: posix(t.directory) }))
      .filter((t) => /^products\/[^/]+\/api$/.test(t.dir))
      .map((t) => [t.pkg, t]),
  ).values(),
];

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
const filters = desktopPackages.map((p) => `--filter=!${p}`).join(" ");
const TASKS = ["lint", "typecheck", "test", "build", "openapi"];

try {
  if (down.length === 0) {
    // Fast path: ONE scheduler invocation. Three sequential turbo calls would be two artificial
    // barriers — lint has no dependencies at all and would sit idle behind a build it never needed.
    run(`pnpm turbo run ${TASKS.join(" ")} ${SCOPE} ${filters}`);
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
    run(`pnpm turbo run ${withoutTest} ${SCOPE} ${filters}`);
    run(`pnpm turbo run test ${SCOPE} ${filters} ${holdBack}`);
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

  // One alembic head per api. `heads` reads the script directory only — no DB, ~1s — and catches a
  // multi-head merge while it is still one branch's problem. Driven off the pushed diff rather than
  // turbo's selection: the api `test` inputs cover src/ and tests/, so a migration-only change
  // would not select the task that is supposed to guard migrations.
  const changed = capture(`git diff --name-only ${BASE}...HEAD`).split(/\r?\n/).filter(Boolean);
  const migrationApis = [
    ...new Set(
      changed.map((f) => posix(f).match(/^(products\/[^/]+\/api)\//)?.[1]).filter(Boolean),
    ),
  ];
  for (const apiDir of migrationApis) {
    let heads;
    try {
      heads = capture(`uv run alembic heads`, join(ROOT, apiDir));
    } catch {
      console.warn(
        `⚠️  ${apiDir}: could not run \`alembic heads\` — skipping the multi-head check`,
      );
      continue;
    }
    const found = heads.split(/\r?\n/).filter((l) => l.includes("(head)"));
    if (found.length > 1) {
      console.error(
        `❌ ${apiDir}: ${found.length} alembic heads — merge them before pushing:\n` +
          found.map((l) => `     ${l.trim()}`).join("\n"),
      );
      process.exit(1);
    }
  }
} catch (error) {
  if (typeof error?.status === "number") process.exit(error.status || 1);
  throw error;
}

console.log(
  `✅ pre-push gate passed in ${Math.round((Date.now() - started) / 1000)}s (budget 90s)`,
);
