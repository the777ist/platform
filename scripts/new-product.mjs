#!/usr/bin/env node
// scripts/new-product.mjs — stamp a new product from products/_template.
// Plain Node, ZERO runtime deps (node: builtins only). Implements PHILOSOPHY.md's 6-step
// Generator spec: (1) validate+collision+portIndex, (2) copy w/ skip-list keep uv.lock,
// (3) whole-word token replace in CONTENTS and PATHS, (4) port offsets, (5) write
// .env.example + product.json + pnpm install, (6) print infra checklist.
//
// Key ruling #7: the template uses the literal token `template`; we whole-word replace
// `template` (kebab) / `Template` (Pascal) / `template_api` (snake module) variants.
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { join, dirname, sep } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_DIR = join(ROOT, "products", "_template");
const PRODUCTS_DIR = join(ROOT, "products");

// Directory/file names NOT to copy — build artifacts + local state. uv.lock is KEPT
// (Python lock must travel with the api). Beyond PHILOSOPHY's five, this also skips the
// other gitignored artifact dirs that exist in a live working tree (turbo cache, compiled
// desktop output, Python caches, Supabase CLI state) and — critically — the SECRET-bearing
// `.env` / `.env.local` (gitignored; the committed `.env.example` / `.env.development` etc.
// still travel).
const SKIP = new Set([
  "node_modules",
  ".venv",
  "dist",
  ".expo",
  "release",
  ".turbo",
  "build",
  "renderer",
  "__pycache__",
  ".pytest_cache",
  ".ruff_cache",
  ".mypy_cache",
  ".expo-shared",
  "web-build",
  ".temp", // supabase CLI state
  ".branches", // supabase CLI state
  ".env", // SECRETS — never stamp a filled local env into a new product
  ".env.local",
  ".DS_Store",
]);
const isLogFile = (name) => name.endsWith(".log"); // stray tool logs (gitignored)

// ---- Step 1: validate, refuse collisions, compute portIndex ----------------------------
function parseArgs() {
  const name = process.argv[2];
  if (!name) die("usage: pnpm new-product <name>");
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    die(
      `invalid name "${name}": must match /^[a-z][a-z0-9-]*$/ (lowercase, digits, hyphens; start with a letter)`,
    );
  }
  if (name === "template" || name.startsWith("_")) {
    die(`name "${name}" is reserved (template token / underscore-prefixed)`);
  }
  const dest = join(PRODUCTS_DIR, name);
  if (existsSync(dest)) die(`product "${name}" already exists at products/${name}`);
  return { name, dest };
}

function nextPortIndex() {
  // Scan EVERY products/*/product.json, take the SMALLEST unused index (_template = 0).
  // Reusing freed indexes (instead of max+1) keeps the documented demo re-stamp
  // (`rm -rf products/demo && pnpm new-product demo`) idempotent even when a
  // higher-indexed product exists — max+1 would silently reassign demo's ports and
  // break its byte-derived-snapshot property. Ports are a purely LOCAL concern
  // (cloud infra derives from names), so reuse after remove-product is always safe.
  const used = new Set();
  for (const entry of readdirSync(PRODUCTS_DIR)) {
    const pj = join(PRODUCTS_DIR, entry, "product.json");
    if (!existsSync(pj)) continue;
    const meta = JSON.parse(readFileSync(pj, "utf8"));
    if (typeof meta.portIndex === "number") used.add(meta.portIndex);
  }
  let i = 0;
  while (used.has(i)) i++;
  return i;
}

// ---- Naming variants (PHILOSOPHY.md: kebab / Pascal / snake) ----------------------------
export function toPascal(kebab) {
  return kebab
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}
export function toSnake(kebab) {
  return kebab.replace(/-/g, "_");
}

// Whole-word replacements. ORDER MATTERS: replace the longest/most-specific token first
// (`products/_template` path self-references, then `template_api`, then `template`) so
// multi-word tokens are rewritten as a unit. \b word boundaries ensure we never
// partial-match a word that merely CONTAINS "template" (e.g. "templated", "templates",
// "templating") — those stay untouched. NOTE: `products/_template` needs its own rule —
// the underscore is a word character, so \btemplate\b can NOT match inside `_template`
// (and `git grep -iw` wouldn't flag it either — it would silently survive).
export function buildReplacers(name) {
  const kebab = name; // e.g. "demo"
  const Pascal = toPascal(name); // e.g. "Demo"
  const snake = toSnake(name); // e.g. "demo" (or "my_app" for "my-app")
  return [
    [/products\/_template\b/g, `products/${kebab}`], // path self-references in docs/comments
    [/\btemplate_api\b/g, `${snake}_api`], // Python module: template_api -> demo_api
    [/\bTemplate\b/g, Pascal], // Pascal symbols/types
    [/\btemplate\b/g, kebab], // kebab token: package names, slug, ids, fly, project_id
  ];
}

export function rewrite(text, replacers) {
  let out = text;
  for (const [re, to] of replacers) out = out.replace(re, to);
  return out;
}

// TOML defines KEYS literally named `template` (supabase config.toml: the [auth.sms] /
// [auth.mfa.phone] OTP message template). Those are config-schema names, NOT product
// tokens — rewriting them produces an invalid config ("'auth.sms' has invalid keys").
// Mask `template =` keys in .toml files before the token pass, restore after.
const TOML_KEY_GUARD = /^(\s*)template(\s*=)/gm;
const TOML_KEY_MASK = "__TOML_TEMPLATE_KEY__";
export function rewriteContents(fileName, text, replacers) {
  const isToml = fileName.endsWith(".toml");
  let out = isToml ? text.replace(TOML_KEY_GUARD, `$1${TOML_KEY_MASK}$2`) : text;
  out = rewrite(out, replacers);
  return isToml ? out.replaceAll(TOML_KEY_MASK, "template") : out;
}

// ---- Step 2 + 3: recursive copy with token replacement in CONTENTS and PATHS ------------
// Text files get token replacement; anything else (PNG brand assets, ...) is copied
// verbatim. `.lock` (uv.lock — carries the project name), `.sql` (migrations) and `.mako`
// (alembic template) are text and MUST be rewritten.
const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".py",
  ".toml",
  ".yml",
  ".yaml",
  ".css",
  ".ini",
  ".cfg",
  ".txt",
  ".svg",
  ".sql",
  ".mako",
  ".lock",
  ".env",
  "", // "" = extensionless files like Dockerfile
]);
export function isText(path) {
  const base = path.split(sep).pop();
  if (base.startsWith(".env")) return true; // .env.example/.development/.staging/.production
  const dot = base.lastIndexOf(".");
  const ext = dot === -1 ? "" : base.slice(dot);
  return TEXT_EXT.has(ext);
}

function copyTree(srcDir, destDir, replacers) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    if (SKIP.has(entry) || isLogFile(entry)) continue; // build artifacts; uv.lock NOT here
    const src = join(srcDir, entry);
    const renamed = rewrite(entry, replacers); // <-- token replacement in PATHS
    const dest = join(destDir, renamed);
    const st = statSync(src);
    if (st.isDirectory()) {
      copyTree(src, dest, replacers);
    } else if (isText(src)) {
      writeFileSync(dest, rewriteContents(entry, readFileSync(src, "utf8"), replacers)); // <-- in CONTENTS
    } else {
      copyFileSync(src, dest); // binaries (PNG brand assets) verbatim
    }
  }
}

// ---- Step 4: port offsets ---------------------------------------------------------------
// API port  = apiBase + 10*i ;  Supabase block base = supabaseBase + 100*i.
// The bases are PER-REPO (root platform.json; defaults below): portIndex de-conflicts the
// products WITHIN one repo, but every repo stamped from this platform starts numbering at the
// same bases — so two org-repos on one machine collide the moment both run stacks. A repo gets
// its own bases via scripts/set-port-base.mjs, and this generator honours them ever after.
// Default repo, template (i=0): api 8000, supabase 54321..; demo (i=1): api 8010, supabase 54421..
export const DEFAULT_PORT_BASES = { api: 8000, supabase: 54321 };

/** This repo's port bases: root platform.json when present, else the platform defaults. */
export function portBases(root = ROOT) {
  const f = join(root, "platform.json");
  if (!existsSync(f)) return { ...DEFAULT_PORT_BASES };
  const cfg = JSON.parse(readFileSync(f, "utf8"));
  return {
    api: cfg?.ports?.api ?? DEFAULT_PORT_BASES.api,
    supabase: cfg?.ports?.supabase ?? DEFAULT_PORT_BASES.supabase,
  };
}

/** The concrete ports a given portIndex resolves to under a repo's bases. */
export function portPlan(i, bases = DEFAULT_PORT_BASES) {
  return {
    apiPort: bases.api + 10 * i,
    sbBase: bases.supabase + 100 * i,
    sbDelta: 100 * i,
    // The template's whole supabase block (e.g. 54300-54399): api/db/studio/smtp/pooler/
    // analytics all live inside one hundred, so the shift matches the WINDOW numerically
    // rather than a hardcoded digit pattern — a rebased repo's block is not 543xx.
    sbWindow: Math.floor(bases.supabase / 100) * 100,
  };
}

/** Shift every port inside one hundred-window by delta, leaving every other number alone. */
export function shiftSupabaseBlock(text, window, delta) {
  if (delta === 0) return text;
  return text.replace(/\b(\d{4,5})\b/g, (m) => {
    const n = Number(m);
    return n >= window && n < window + 100 ? String(n + delta) : m;
  });
}

function applyPorts(dest, i, bases = portBases()) {
  const { apiPort, sbBase, sbDelta, sbWindow } = portPlan(i, bases);

  // (a) supabase/config.toml — shift every default 543xx port by sbDelta, plus the
  //     edge-runtime `inspector_port` (8083 — OUTSIDE the 543xx block; without an offset
  //     two products could not run `supabase functions serve --inspect` simultaneously).
  //     8083+10i never collides with API ports 8000+10j (83 is not a multiple of 10).
  const cfg = join(dest, "supabase", "config.toml");
  if (existsSync(cfg)) {
    let toml = shiftSupabaseBlock(readFileSync(cfg, "utf8"), sbWindow, sbDelta);
    toml = toml.replace(/^(inspector_port = )(\d+)$/m, (_, k, p) => k + String(Number(p) + 10 * i));
    writeFileSync(cfg, toml);
  }

  // (b) api dev script (package.json "dev": "... --port 8000") -> apiPort.
  const apiPkg = join(dest, "api", "package.json");
  if (existsSync(apiPkg)) {
    writeFileSync(
      apiPkg,
      readFileSync(apiPkg, "utf8").replace(
        new RegExp(`--port\\s+${bases.api}\\b`, "g"),
        `--port ${apiPort}`,
      ),
    );
  }

  // (c) committed app/.env.{development,staging,production} — EXPO_PUBLIC_API_URL +
  //     supabase URL ports. Only the local-dev hosts carry the offset ports (staging/
  //     production carry real per-product hostnames already rewritten by the token pass).
  for (const env of ["development", "staging", "production"]) {
    const f = join(dest, "app", `.env.${env}`);
    if (!existsSync(f)) continue;
    let txt = readFileSync(f, "utf8");
    const host = "(localhost|127\\.0\\.0\\.1)";
    txt = txt.replace(new RegExp(`${host}:${bases.api}\\b`, "g"), `$1:${apiPort}`); // API url
    txt = txt.replace(new RegExp(`${host}:${bases.supabase}\\b`, "g"), `$1:${sbBase}`); // supabase url
    writeFileSync(f, txt);
  }

  // (d) server-side .env.example + the product README — same local-host offsets so a dev
  //     copying/pasting from them starts against the product's OWN stack ports. Shift the
  //     whole 543xx block (like config.toml): SUPABASE_URL is 54321, both DATABASE_*URLs
  //     are 54322 (the local stack has no pooler — direct DB port for runtime AND
  //     migrations). NOTE: these files must not contain literal `543xx + …` port FORMULAS
  //     (the shift would corrupt the base); spell formulas without the literal base.
  for (const rel of [".env.example", "README.md"]) {
    const f = join(dest, rel);
    if (!existsSync(f)) continue;
    writeFileSync(f, shiftSupabaseBlock(readFileSync(f, "utf8"), sbWindow, sbDelta));
  }
}

// ---- Figma bridge: register the new product's brand mode (placeholder modeId) -----------
// Edits the TOKEN-PIPELINE config `tokens.config.json` (fileKey + modes) — NOT Code
// Connect's root `figma.config.json` (which is repo-wide, not per-product, and untouched).
function addFigmaMode(name) {
  const f = join(ROOT, "tokens.config.json");
  if (!existsSync(f)) return;
  const cfg = JSON.parse(readFileSync(f, "utf8"));
  cfg.modes = cfg.modes || {};
  // Placeholder until the designer creates the brand mode (matches the Phase 2 convention
  // TODO-MODE-ID-<NAME>); idempotent if the mode is already registered.
  if (!(name in cfg.modes)) cfg.modes[name] = `TODO-MODE-ID-${name.toUpperCase()}`;
  writeFileSync(f, JSON.stringify(cfg, null, 2) + "\n");
}

// ---- Step 5: write product.json (.env.example travels via the copy) ---------------------
function writeMeta(dest, name, portIndex) {
  writeFileSync(join(dest, "product.json"), JSON.stringify({ name, portIndex }, null, 2) + "\n");
  // .env.example was copied + token-rewritten in copyTree; nothing more to write here.
  // PHILOSOPHY.md: ".env.example documents every consumed var".
}

// ---- Step 6: print infra checklist ------------------------------------------------------
// Pure so the banner is testable: the ports it prints MUST come from the same portPlan(bases)
// the stamp itself applied. Recomputing from the 8000/54321 defaults here printed the wrong
// first-run ports in every rebased repo — the stamped files said one stack, the banner told the
// human to target another.
export function checklistText(name, portIndex, bases = portBases()) {
  const org = "example"; // placeholder org (Naming conventions header)
  const { apiPort, sbBase } = portPlan(portIndex, bases);
  const mod = name.replace(/-/g, "_") + "_api"; // python module (mirrors buildReplacers)
  return `
✅ Stamped products/${name} (portIndex=${portIndex})
   local ports: API http://localhost:${apiPort} · Supabase block base ${sbBase}

 LOCAL FIRST RUN (no cloud accounts needed — the stack starts EMPTY):
   pnpm bootstrap                             # if the local stacks aren't up yet
   cd products/${name} && supabase status     # note the service_role key
   cd api && cp ../.env.example .env          # ports are already this product's
   #  -> paste the service_role key into SUPABASE_SERVICE_ROLE_KEY
   uv run alembic upgrade head                # create the schema
   uv run python -m ${mod}.seed               # seed demo data
   pnpm turbo run dev --filter=*${name}-*     # Expo app + API

────────────────────────────────────────────────────────────────────
 INFRA CHECKLIST for "${name}" (swap the ${org} placeholders for real org values)
────────────────────────────────────────────────────────────────────
 [ ] Supabase: create 2 projects  ${org}-${name}-stg  and  ${org}-${name}-prod
 [ ] Fly: flyctl apps create ${org}-${name}-api-stg
          flyctl apps create ${org}-${name}-api-prod
          then set per-app secrets (DATABASE_URL, DATABASE_MIGRATION_URL,
          SUPABASE_JWT_SECRET, SENTRY_DSN, EXPO_ACCESS_TOKEN, ...)
 [ ] Vercel: new project, root = products/${name}/app, build via turbo filter,
          output dir = dist, ignored-build-step = npx turbo-ignore
 [ ] EAS: eas init  -> paste the projectId into app.config.ts
          (replace TODO-EAS-PROJECT-ID)
 [ ] Desktop: create repo <org>/${name}-desktop-releases  + a GH_TOKEN with repo scope
          (electron-updater publish target)
 [ ] Sentry: create 4 projects (app stg/prod, api stg/prod) -> paste DSNs into env
 [ ] GitHub Actions: add per-product secrets (FLY_API_TOKEN_${name.toUpperCase().replace(/-/g, "_")},
          EXPO_TOKEN, VERCEL_*, GH_TOKEN, SENTRY_AUTH_TOKEN, ...)
 [ ] BRAND: replace placeholder assets in products/${name}/app/assets/brand/source.svg
          then run: node products/${name}/app/assets/brand/gen-brand.mjs
 [ ] FIGMA: ask design to create the "${name}" brand mode, then replace the
          TODO-MODE-ID-${name.toUpperCase()} in tokens.config.json and run /sync-tokens
────────────────────────────────────────────────────────────────────
`;
}

function printChecklist(name, portIndex) {
  console.log(checklistText(name, portIndex));
}

function die(msg) {
  console.error("✖ " + msg);
  process.exit(1);
}

// ---- main -------------------------------------------------------------------------------
function main() {
  const { name, dest } = parseArgs();
  const portIndex = nextPortIndex();
  const replacers = buildReplacers(name);

  console.log(`→ stamping "${name}" (portIndex=${portIndex}) from products/_template`);
  copyTree(TEMPLATE_DIR, dest, replacers); // Steps 2 + 3 (contents + paths)
  applyPorts(dest, portIndex); // Step 4
  writeMeta(dest, name, portIndex); // Step 5 (product.json)
  addFigmaMode(name); // Figma bridge

  console.log("→ pnpm install (resolving the new workspaces)...");
  execSync("pnpm install", { cwd: ROOT, stdio: "inherit" }); // Step 5

  printChecklist(name, portIndex); // Step 6
}
// Guarded so importing this module (to test the token rewrite) does not stamp a product.
if (
  process.argv[1] &&
  process.argv[1].split(String.fromCharCode(92)).join("/").endsWith("scripts/new-product.mjs")
) {
  main();
}
