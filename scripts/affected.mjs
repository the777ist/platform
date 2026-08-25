#!/usr/bin/env node
// scripts/affected.mjs — ONE answer to "what does this change actually affect", shared by the
// pre-push hook and by CI so the two can never disagree about scope. A second copy of this logic
// is exactly how a monorepo ends up with a hook, a CI job and a deploy filter that quietly select
// different things.
//
// Exports:
//   scopeFilter(base, head) -> { filter, reason }   the turbo --filter that scopes a run
//   affectedApiDirs(filter) -> [{ pkg, dir }]       products/<name>/api with a test task selected
//
// CLI, for the CI workflow (a YAML step cannot import):
//   node scripts/affected.mjs scope <base> [head]   prints the filter, or nothing for "everything"
//   node scripts/affected.mjs apis  <base> [head]   prints affected api dirs, one per line
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Windows turbo reports directories with backslashes. Written this way because a literal
// backslash in source is fragile to pass through tooling; the intent is p.replace(/\\/g, "/").
const BACKSLASH = String.fromCharCode(92);
const posix = (p) => p.split(BACKSLASH).join("/");

const capture = (cmd, cwd = ROOT) =>
  execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// turbo prints a version banner before the JSON, hence the slice to the first brace.
function turboDry(filter = "") {
  // Quote only when there IS a filter: an empty "" argument is not the same as no argument, and
  // the filter contains [ ] which /bin/sh would treat as a glob if left bare.
  const args = filter ? ` "${filter}"` : "";
  const out = capture(`pnpm turbo run test${args} --dry=json`);
  return JSON.parse(out.slice(out.indexOf("{")));
}

export function changedFiles(base, head = "HEAD") {
  return capture(`git diff --name-only ${base}...${head}`)
    .split(/\r?\n/)
    .filter(Boolean)
    .map(posix);
}

// The root files that affect EVERY package while living in no package directory —
// tsconfig.base.json (every package tsconfig extends @platform/config/tsconfig/* ->
// packages/config/tsconfig/base.json -> ../../../tsconfig.base.json), eslint.config.mjs, and so on.
//
// Asked of TURBO rather than re-read from turbo.json, for two reasons: turbo.json is JSONC (it
// carries comments, so JSON.parse would throw), and globalCacheInputs.files IS turbo's own
// resolution of globalDependencies — so the list used for cache invalidation and the list used for
// scoping are physically the same list and cannot drift apart.
export function globalInputFiles(dry = turboDry()) {
  return Object.keys(dry.globalCacheInputs?.files ?? {}).map(posix);
}

// `...[base...head]` = changed packages AND their dependents (the co-evolve guard). It is what
// --affected is shorthand for, spelled out because --affected is mutually exclusive with --filter.
//
// The escalation matters: a change to a global input selects NO package, so a naively scoped gate
// would run zero tasks on a change that alters how every package compiles. Verified: editing
// `strict` in tsconfig.base.json left every task hash byte-identical and selected nothing before
// globalDependencies was declared. No filter at all means every package.
export function scopeFilter(base, head = "HEAD") {
  // An unusable base must widen to everything, never narrow to nothing. CI derives its base from
  // `github.event.before`, which is all-zeros on a branch's first push and unreachable after a
  // force-push; a shallow clone can also lack the commit. Scoping to a base git cannot resolve
  // would silently gate NOTHING, which is the one outcome a gate must never have.
  for (const ref of [base, head]) {
    try {
      capture(`git rev-parse --verify --quiet "${ref}^{commit}"`);
    } catch {
      return { filter: "", reason: `'${ref}' is not a resolvable commit — cannot scope` };
    }
  }
  const globals = globalInputFiles();
  const hits = changedFiles(base, head).filter((f) => globals.includes(f));
  if (hits.length > 0) return { filter: "", reason: `global input changed: ${hits.join(", ")}` };
  return { filter: `--filter=...[${base}...${head}]`, reason: "" };
}

// Asked of turbo rather than derived from paths, so the hook, CI and the scheduler agree on which
// APIs are in play. `task === "test"` matters: a dry run of `test` also reports the dependency
// tasks it pulls in (openapi, ^build), so matching on package alone counts each api twice.
export function affectedApiDirs(filter) {
  return [
    ...new Map(
      turboDry(filter)
        .tasks.filter((t) => t.task === "test" && t.command && t.command !== "<NONEXISTENT>")
        .map((t) => ({ pkg: t.package, dir: posix(t.directory) }))
        .filter((t) => /^products\/[^/]+\/api$/.test(t.dir))
        .map((t) => [t.pkg, t]),
    ).values(),
  ];
}

// --- CLI ---------------------------------------------------------------------------------------
if (process.argv[1] && posix(process.argv[1]).endsWith("scripts/affected.mjs")) {
  const [mode, base, head = "HEAD"] = process.argv.slice(2);
  if (!mode || !base) {
    console.error("usage: node scripts/affected.mjs <scope|apis> <base> [head]");
    process.exit(2);
  }
  const { filter, reason } = scopeFilter(base, head);
  if (mode === "scope") {
    if (reason) console.error(`affected: selecting EVERY package — ${reason}`);
    process.stdout.write(filter);
  } else if (mode === "apis") {
    // One dir per line, INCLUDING a trailing newline: `while read -r` returns non-zero on a final
    // unterminated line, so the shell loop in CI would silently skip the last api without it.
    const dirs = affectedApiDirs(filter).map((a) => a.dir);
    process.stdout.write(dirs.length ? dirs.join("\n") + "\n" : "");
  } else {
    console.error(`affected: unknown mode '${mode}' (expected: scope | apis)`);
    process.exit(2);
  }
}
