# Phase 7 — new-product generator & stamping demo

**Goal:** Turn `products/_template` (a complete, working product after Phases 1–6) into a
**stampable template**, and ship the generator that stamps it. `scripts/new-product.mjs`
(plain Node, zero deps) copies `_template → products/<name>`, whole-word-rewrites the
literal product token `template` (kebab/Pascal/snake) in **contents AND paths**, offsets
every port by the new product's `portIndex`, copies the placeholder brand assets, registers
the product's brand mode in the token-pipeline config `tokens.config.json`, runs
`pnpm install`, and prints the infra checklist. Running it once produces `products/demo` (`portIndex=1`) — a second, fully
independent product proving the scaffold is portable. A root `pnpm bootstrap`
(`mise → install → supabase start`) brings every product's local stack up together.

This is the concrete expansion of the PHILOSOPHY.md **Phase 7** row:

> Generator + stamp `demo` product (brand-asset placeholders + regen script;
> `pnpm bootstrap`) | Verify: `pnpm new-product demo`; both products build via
> `--affected`; both local stacks run simultaneously via `pnpm bootstrap`; demo carries
> its own placeholder brand assets; `git grep -iw template products/demo` empty.

**Verify (restated from PHILOSOPHY.md):**
1. `pnpm new-product demo` succeeds (validates name, computes `portIndex=1`, stamps).
2. **Both products build via `--affected`** — `turbo run build --affected` touches
   `template` *and* `demo`.
3. **Both local stacks run simultaneously** via `pnpm bootstrap` — on distinct, offset
   ports (no collisions).
4. **demo carries its own placeholder brand assets** (icon/splash/favicon under
   `products/demo/app/assets/brand/`, copied by the generator).
5. **`git grep -iw template products/demo` returns empty** — no `template` token leaked
   into the stamped product's contents or paths.

This guide stays faithful to PHILOSOPHY.md's locked decisions: the **Multi-product** Decision
Sheet bullet (`products/<name>/` consuming shared `packages/*`, `pnpm new-product <name>`,
infra naming `<org>-<product>-<env>`), the **Branding assets** bullet (single-source
placeholder icon/splash/favicon + regen script + generator copies them + prints a
"replace brand assets" checklist item), the **Operational defaults** bullet (per-product
`seed.py`, root `pnpm bootstrap = mise → install → supabase start`, `.env.example`
documents every var), the **Env/config** bullet (committed per-env `EXPO_PUBLIC_*` files;
secrets in native stores), the **Naming conventions** header, **Key rulings #1** (a product
= 3 workspaces + generated `api-client`) and **#7** (`_template` is a working product using
the literal name `template`; the generator whole-word-replaces `template`
kebab/Pascal/snake in contents AND paths), the **Generator** subsection (the 6 numbered
steps), the **Figma bridge** note (the generator adds the new product's brand mode to the
token-pipeline config `tokens.config.json`, distinct from Code Connect's root
`figma.config.json`), and the `product.json` shape `{"name":"template","portIndex":0}`
(`demo` = `portIndex=1`). Anything PHILOSOPHY.md does not pin is marked
**⚠️ OPEN / TO CONFIRM**.

---

## Prerequisites

- **Phases 1–6 complete** — `products/_template` is a **complete working product** across
  all of its workspaces. By Key ruling #1 a product = **3 workspaces** (`app`, `desktop`,
  `api`) **+ a generated `api-client`**, plus its `supabase/` stack. Concretely, before
  this phase `_template` already has:
  - **Phase 1** root tooling: `mise.toml` (Node 24 / pnpm 11 / Python 3.13 / uv),
    `pnpm-workspace.yaml`
    (`packages/*`, `products/*/{app,desktop,api,api-client}` + pnpm 11 settings:
    `nodeLinker: hoisted`, `preferFrozenLockfile: true`, `allowBuilds`),
    `.npmrc` (auth/registry only under pnpm 11 — settings relocated to
    `pnpm-workspace.yaml`), `turbo.json`, `tsconfig.base.json`, `lefthook.yml`,
    `packages/config`.
  - **Phase 2** `packages/ui` (owned react-native-reusables + CSS-var theme, Storybook),
    `packages/core` (query+persist, env), and the `_template/app` shell (tabs, settings,
    theme toggle, `tailwind.config.js`, `theme.ts`/`global.css`).
  - **Phase 3** `_template/api` — FastAPI strict-layered OOP, `supabase/config.toml`
    (ports from `portIndex=0`), `fly.staging.toml`/`fly.production.toml`, `alembic/`,
    `seed.py`, `pyproject.toml`/`uv.lock`, `Dockerfile`.
  - **Phase 4** `_template/api-client` (committed hey-api output) + the home list screen.
  - **Phase 5** `_template/desktop` (`app://` protocol, `electron-builder.yml`).
  - **Phase 6** Supabase local + auth (session store, guards, `features/auth`, `/v1/me`,
    Storage upload).
- The `_template` workspaces use the **literal product token `template`** everywhere a
  product name appears: package names (`@platform/template-app`, `-desktop`, `-api`,
  `-api-client`), Expo `scheme`/`slug`, bundle id `com.example.template`, electron `appId`
  `com.example.template.desktop` + releases repo `<org>/template-desktop-releases`, Fly app
  names `example-template-api-stg|prod`, the Python module `template_api`, the alembic
  config, the Supabase `project_id` `example-template`, and the product's `README.md` /
  `CLAUDE.md` / `.claude/commands/*`.
- **`tokens.config.json`** exists at root (from Phase 2) — the **token-pipeline** config
  read by `scripts/figma-tokens.mjs`, mapping
  `{ fileKey, modes: { "template": <modeId>, ... } }`. (This is named separately from
  Code Connect's own `figma.config.json` — which also lives at the repo root, holds the
  `codeConnect.include` globs, is **NOT per-product**, and is **not** touched by the
  generator — to avoid a filename collision. Per PHILOSOPHY.md Figma-bridge note + ruling #11.)
- **`scripts/figma-tokens.mjs`** exists (Phase 2). Phase 7 only *appends a mode entry* to
  `tokens.config.json`; it does not change the token script and does not touch
  `figma.config.json`.

> Phase 7 introduces two artifacts that PHILOSOPHY.md attributes to it but that earlier phases
> consume: the **brand-asset placeholders + regen script** under
> `products/_template/app/assets/brand/` (the directory is referenced from Phase 2/5 but
> the single-source + regen pipeline is specified here), and the **root `pnpm bootstrap`**
> script. If a thin `assets/brand/` already exists from an earlier phase, this phase
> formalizes the single-source + regen-script shape below.

---

## Definition of done

- [ ] `products/_template/product.json` is exactly `{"name":"template","portIndex":0}`.
- [ ] `products/_template/app/assets/brand/` holds a **single source asset**
      (`source.svg` placeholder) + a **regen script** (`gen-brand.mjs`) that produces every
      required size: `icon.png` (1024), `adaptive-icon.png` (foreground), `splash.png`,
      `favicon.png` — the exact set wired into `app.config.ts`.
- [ ] `scripts/new-product.mjs` exists (plain Node, **zero runtime deps** beyond `node:*`).
- [ ] The generator implements all **6 numbered steps** from PHILOSOPHY.md's Generator subsection
      (validate + collision + `portIndex`; copy with skip-list keeping `uv.lock`;
      whole-word token replace in contents AND paths; port offsets; write
      `.env.example` + `product.json` + `pnpm install`; print the infra checklist).
- [ ] Root `package.json` has `"new-product"` and `"bootstrap"` scripts.
- [ ] `scripts/bootstrap.mjs` runs `mise install → pnpm install → supabase start` for
      **every** product (or `pnpm bootstrap` does this via a small per-product loop).
- [ ] `pnpm new-product demo` produces `products/demo` with `product.json`
      `{"name":"demo","portIndex":1}`.
- [ ] **`git grep -iw template products/demo` returns empty** — no `template` token
      survives in `demo` contents **or** paths (no `template_api` module dir, no
      `template-*` package names, no `com.example.template`).
- [ ] **Both stacks coexist on offset ports:** `template` API `8000` / Supabase block
      `54321`; `demo` API `8010` / Supabase block `54421`. `pnpm bootstrap` brings both up
      with **no port collision**.
- [ ] `turbo run build --affected` (after a root-touching change, or first run) builds
      **both** products' graphs.
- [ ] `products/demo/app/assets/brand/` carries demo's **own** placeholder assets (copied,
      not symlinked).
- [ ] `tokens.config.json` gains a `"demo": "<placeholder-modeId>"` mode entry (Code
      Connect's root `figma.config.json` is left untouched — it is not per-product).
- [ ] The generator **preserves placeholders** unchanged: org `example`,
      `com.example.*`, `TODO-EAS-PROJECT-ID`, releases-repo owner placeholder. These are
      *not* product tokens, so the whole-word replacement must not touch them.
- [ ] Build artifacts are **not** copied (`node_modules`, `.venv`, `dist`, `.expo`,
      `release`) — but `uv.lock` **is** kept.

---

## Build steps

> Paths are **repo-relative** (`scripts/…`, `products/_template/…`). The literal product
> token in the template is `template` (Key ruling #7). The org placeholder is `example`;
> infra names follow `<org>-<product>-<env>`. For **each step**: **Files**, **Contents**,
> **Commands**, **Why**.

### Step 1 — `product.json` generator metadata on the template

**Files**
- `products/_template/product.json`

**Contents**
```json
{
  "name": "template",
  "portIndex": 0
}
```

**Commands**
```bash
cat products/_template/product.json   # exactly {"name":"template","portIndex":0}
```

**Why**
This is the generator's metadata anchor (PHILOSOPHY.md directory tree:
`product.json # {"name":"template","portIndex":0} generator metadata`). The generator reads
**every** `products/*/product.json`, takes `max(portIndex) + 1` for the new product, and
writes the stamped product's own `product.json`. `name` is the canonical product token; all
infra naming and ports derive from it (and from `portIndex`), never from the monorepo's
name (Naming conventions header). The product's `README.md`/`CLAUDE.md` read their ports and
infra names **from this file** so they stay accurate after stamping (PHILOSOPHY.md Generator
step 3 parenthetical).

---

### Step 2 — Single-source brand assets + regen script

**Files**
- `products/_template/app/assets/brand/source.svg` — the **one** source of truth
  (placeholder mark).
- `products/_template/app/assets/brand/gen-brand.mjs` — regen script producing all sizes.
- `products/_template/app/assets/brand/README.md` — one-line "replace these" note (the
  human side of the generator's checklist item).
- Generated outputs (committed): `icon.png`, `adaptive-icon.png`, `splash.png`,
  `favicon.png`.

**Contents** — `source.svg` (placeholder mark; intentionally generic):
```svg
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="220" fill="#6366F1"/>
  <text x="512" y="600" font-family="sans-serif" font-size="520" font-weight="700"
        text-anchor="middle" fill="#FFFFFF">▢</text>
  <!-- PLACEHOLDER brand mark. Replace per the generator's "replace brand assets" checklist. -->
</svg>
```

**Contents** — `gen-brand.mjs` (Node; rasterizes the single source to every wired size):
```js
#!/usr/bin/env node
// Regenerate ALL brand raster sizes from the single source.svg.
// PHILOSOPHY.md (Branding assets): "placeholder icon/splash/favicon ... from a single source;
// a regen script produces all sizes". Run after editing source.svg.
//
// Rasterization dep is intentionally NOT vendored into the zero-dep generator — this
// script lives in the app workspace and uses the app's toolchain.
// Rasterizer: `sharp` (rasterizes the SVG source and resizes every PNG size in one
// dependency). Add `sharp` to the app workspace devDeps, pinned exact at install. The size
// MATRIX below is the contract.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "source.svg");

// The four assets app.config.ts references. Keep this list and app.config.ts in sync.
const TARGETS = [
  { out: "icon.png", size: 1024 },          // App store / Expo `icon`
  { out: "adaptive-icon.png", size: 1024 }, // Android adaptive foreground
  { out: "splash.png", size: 1284 },        // expo-splash-screen image
  { out: "favicon.png", size: 48 },         // web favicon
];

async function main() {
  // Pseudocode — wire to the chosen rasterizer (sharp/resvg):
  //   const sharp = (await import("sharp")).default;
  //   const svg = await readFile(SRC);
  //   for (const { out, size } of TARGETS)
  //     await sharp(svg).resize(size, size).png().toFile(join(HERE, out));
  for (const { out, size } of TARGETS) {
    console.log(`gen-brand: ${SRC} -> ${out} @ ${size}px`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

**Commands**
```bash
node products/_template/app/assets/brand/gen-brand.mjs   # regenerate all sizes
# add a workspace script so it's discoverable:
#   "brand:gen": "node assets/brand/gen-brand.mjs"   (in app/package.json)
```

**Why**
PHILOSOPHY.md's Branding-assets decision is **single source → regen produces all sizes → generator
copies them + prints a replace checklist item**. Keeping `source.svg` as the only authored
file means a product re-brands by replacing one file and re-running `gen-brand.mjs`. The
generator (Step 4) copies the whole `assets/brand/` tree verbatim, so the stamped product
**carries its own** placeholder assets (Verify #4) that the team then replaces. The size
matrix is the load-bearing contract; the rasterizer choice is an implementation detail left
open. These outputs are committed (raster PNGs) so CI/build never needs the rasterizer.

---

### Step 3 — Root `package.json` scripts: `new-product` + `bootstrap`

**Files**
- `package.json` (root)

**Contents** (scripts excerpt — keep existing `devDeps: turbo, prettier, lefthook` and the
`packageManager` field intact):
```json
{
  "name": "platform",
  "private": true,
  "packageManager": "pnpm@11.6.0",
  "scripts": {
    "new-product": "node scripts/new-product.mjs",
    "bootstrap": "node scripts/bootstrap.mjs"
  }
}
```

**Commands**
```bash
pnpm new-product demo          # -> node scripts/new-product.mjs demo
pnpm bootstrap                 # -> node scripts/bootstrap.mjs
```

**Why**
PHILOSOPHY.md directory tree: root `package.json # scripts: new-product, bootstrap`. `pnpm
new-product <name>` is the documented generator entry point (Multi-product bullet); `pnpm
bootstrap` is the one-command onboarding (`mise → install → supabase start`, Operational
defaults). Root name is `platform` and the scope is `@platform/*` — these are
**not** product tokens and are never rewritten by the generator (naming derives from the
*product*, not the repo). The `packageManager` field is also the eas-cli workspace-detection
workaround (Phase 8 note) — leave it.

---

### Step 4 — `scripts/new-product.mjs` (the generator, plain Node, zero deps)

**Files**
- `scripts/new-product.mjs`

**Contents** — the full generator implementing all 6 PHILOSOPHY.md steps:
```js
#!/usr/bin/env node
// scripts/new-product.mjs — stamp a new product from products/_template.
// Plain Node, ZERO runtime deps (node: builtins only). Implements PHILOSOPHY.md's 6-step
// Generator spec: (1) validate+collision+portIndex, (2) copy w/ skip-list keep uv.lock,
// (3) whole-word token replace in CONTENTS and PATHS, (4) port offsets, (5) write
// .env.example + product.json + pnpm install, (6) print infra checklist.
//
// Key ruling #7: the template uses the literal token `template`; we whole-word replace
// `template` (kebab) / `Template` (Pascal) / `template_api` (snake module) variants.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_DIR = join(ROOT, "products", "_template");
const PRODUCTS_DIR = join(ROOT, "products");

// Directory/file names NOT to copy (build artifacts + local state). uv.lock is KEPT
// (it lives at api root and is NOT in this list — Python lock must travel with the api).
const SKIP = new Set(["node_modules", ".venv", "dist", ".expo", "release"]);

// ---- Step 1: validate, refuse collisions, compute portIndex ----------------------------
function parseArgs() {
  const name = process.argv[2];
  if (!name) die("usage: pnpm new-product <name>");
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    die(`invalid name "${name}": must match /^[a-z][a-z0-9-]*$/ (lowercase, digits, hyphens; start with a letter)`);
  }
  if (name === "template" || name.startsWith("_")) {
    die(`name "${name}" is reserved (template token / underscore-prefixed)`);
  }
  const dest = join(PRODUCTS_DIR, name);
  if (existsSync(dest)) die(`product "${name}" already exists at products/${name}`);
  return { name, dest };
}

function nextPortIndex() {
  // Scan EVERY products/*/product.json, take max(portIndex)+1. _template = 0.
  let max = -1;
  for (const entry of readdirSync(PRODUCTS_DIR)) {
    const pj = join(PRODUCTS_DIR, entry, "product.json");
    if (!existsSync(pj)) continue;
    const meta = JSON.parse(readFileSync(pj, "utf8"));
    if (typeof meta.portIndex === "number") max = Math.max(max, meta.portIndex);
  }
  return max + 1;
}

// ---- Naming variants (PHILOSOPHY.md: kebab / Pascal / snake) ---------------------------------
function toPascal(kebab) {
  return kebab.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}
function toSnake(kebab) {
  return kebab.replace(/-/g, "_");
}

// Whole-word replacements. ORDER MATTERS: replace the longest/most-specific token first
// (`template_api` before `template`) so the snake module name is rewritten as a unit.
// \b word boundaries ensure we never partial-match a word that merely CONTAINS "template"
// (e.g. "templated", "templates", "templating") — those stay untouched.
function buildReplacers(name) {
  const kebab = name;                 // e.g. "demo"
  const Pascal = toPascal(name);      // e.g. "Demo"
  const snake = toSnake(name);        // e.g. "demo" (or "my_app" for "my-app")
  return [
    [/\btemplate_api\b/g, `${snake}_api`],   // Python module: template_api -> demo_api
    [/\bTemplate\b/g, Pascal],               // Pascal symbols/types
    [/\btemplate\b/g, kebab],                // kebab token: package names, slug, ids, fly, project_id
  ];
}

function rewrite(text, replacers) {
  let out = text;
  for (const [re, to] of replacers) out = out.replace(re, to);
  return out;
}

// ---- Step 2 + 3: recursive copy with token replacement in CONTENTS and PATHS ------------
const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".py", ".toml", ".yml",
  ".yaml", ".css", ".ini", ".cfg", ".txt", ".svg", ".env", "", // "" = dotfiles like .env.development
]);
function isText(path) {
  const base = path.split(sep).pop();
  if (base.startsWith(".env")) return true;          // .env.development/.staging/.production
  const dot = base.lastIndexOf(".");
  const ext = dot === -1 ? "" : base.slice(dot);
  return TEXT_EXT.has(ext);
}

function copyTree(srcDir, destDir, replacers) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    if (SKIP.has(entry)) continue;                   // build artifacts; uv.lock NOT here
    const src = join(srcDir, entry);
    const renamed = rewrite(entry, replacers);       // <-- token replacement in PATHS
    const dest = join(destDir, renamed);
    const st = statSync(src);
    if (st.isDirectory()) {
      copyTree(src, dest, replacers);
    } else if (isText(src)) {
      writeFileSync(dest, rewrite(readFileSync(src, "utf8"), replacers)); // <-- in CONTENTS
    } else {
      copyFileSync(src, dest);                        // binaries (PNG brand assets) verbatim
    }
  }
}

// ---- Step 4: port offsets ---------------------------------------------------------------
// API port  = 8000 + 10*i ;  Supabase block base = 54321 + 100*i.
// Template (i=0): api 8000, supabase 54321.. ; demo (i=1): api 8010, supabase 54421..
function applyPorts(dest, i) {
  const apiPort = 8000 + 10 * i;
  const sbBase = 54321 + 100 * i;        // api/studio/db/etc. offset as a block of 100
  const sbDelta = sbBase - 54321;        // amount to add to each default supabase port

  // (a) supabase/config.toml — shift every default 543xx port by sbDelta.
  const cfg = join(dest, "supabase", "config.toml");
  if (existsSync(cfg)) {
    const shifted = readFileSync(cfg, "utf8").replace(/\b(543\d\d)\b/g, (m) =>
      String(Number(m) + sbDelta)
    );
    writeFileSync(cfg, shifted);
  }

  // (b) api dev script (package.json "dev": "... --port 8000") -> apiPort.
  const apiPkg = join(dest, "api", "package.json");
  if (existsSync(apiPkg)) {
    writeFileSync(apiPkg, readFileSync(apiPkg, "utf8").replace(/--port\s+8000\b/g, `--port ${apiPort}`));
  }

  // (c) committed app/.env.{development,staging,production} — EXPO_PUBLIC_API_URL +
  //     supabase URL ports. Only the local-dev hosts carry the offset ports.
  for (const env of ["development", "staging", "production"]) {
    const f = join(dest, "app", `.env.${env}`);
    if (!existsSync(f)) continue;
    let txt = readFileSync(f, "utf8");
    txt = txt.replace(/(localhost|127\.0\.0\.1):8000\b/g, `$1:${apiPort}`);     // API url
    txt = txt.replace(/(localhost|127\.0\.0\.1):54321\b/g, `$1:${sbBase}`);     // supabase url
    writeFileSync(f, txt);
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
  if (!(name in cfg.modes)) cfg.modes[name] = "TODO-FIGMA-MODE-ID";  // placeholder until designer creates it
  writeFileSync(f, JSON.stringify(cfg, null, 2) + "\n");
}

// ---- Step 5: write product.json (.env.example travels via the copy) ---------------------
function writeMeta(dest, name, portIndex) {
  writeFileSync(join(dest, "product.json"), JSON.stringify({ name, portIndex }, null, 2) + "\n");
  // .env.example was copied + token-rewritten in copyTree; nothing more to write here
  // unless a fresh header is desired. PHILOSOPHY.md: ".env.example documents every consumed var".
}

// ---- Step 6: print infra checklist ------------------------------------------------------
function printChecklist(name, portIndex) {
  const org = "example"; // placeholder org (Naming conventions header)
  const apiPort = 8000 + 10 * portIndex;
  const sbBase = 54321 + 100 * portIndex;
  console.log(`
✅ Stamped products/${name} (portIndex=${portIndex})
   local ports: API http://localhost:${apiPort} · Supabase block base ${sbBase}

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
 [ ] GitHub Actions: add per-product secrets (FLY_API_TOKEN_${name.toUpperCase()},
          EXPO_TOKEN, VERCEL_*, GH_TOKEN, SENTRY_AUTH_TOKEN, ...)
 [ ] BRAND: replace placeholder assets in products/${name}/app/assets/brand/source.svg
          then run: node products/${name}/app/assets/brand/gen-brand.mjs
 [ ] FIGMA: ask design to create the "${name}" brand mode, then replace the
          TODO-FIGMA-MODE-ID in tokens.config.json and run /sync-tokens
────────────────────────────────────────────────────────────────────
`);
}

function die(msg) { console.error("✖ " + msg); process.exit(1); }

// ---- main -------------------------------------------------------------------------------
function main() {
  const { name, dest } = parseArgs();
  const portIndex = nextPortIndex();
  const replacers = buildReplacers(name);

  console.log(`→ stamping "${name}" (portIndex=${portIndex}) from products/_template`);
  copyTree(TEMPLATE_DIR, dest, replacers);   // Steps 2 + 3 (contents + paths)
  applyPorts(dest, portIndex);               // Step 4
  writeMeta(dest, name, portIndex);          // Step 5 (product.json)
  addFigmaMode(name);                        // Figma bridge

  console.log("→ pnpm install (resolving the new workspaces)...");
  execSync("pnpm install", { cwd: ROOT, stdio: "inherit" });   // Step 5

  printChecklist(name, portIndex);           // Step 6
}
main();
```

**Commands**
```bash
node scripts/new-product.mjs demo     # or: pnpm new-product demo
```

**Why**
This is the literal implementation of PHILOSOPHY.md's **Generator** subsection, point by point:

1. **Validate `/^[a-z][a-z0-9-]*$/`, refuse collisions, `portIndex = max+1`** —
   `parseArgs()` + `nextPortIndex()`. It also reserves `template` and underscore-prefixed
   names (the template itself).
2. **Copy `_template → products/<name>`, skip build artifacts, keep `uv.lock`** —
   `copyTree()` honors the `SKIP` set (`node_modules/.venv/dist/.expo/release`); `uv.lock`
   is deliberately **absent** from `SKIP`, so it travels (Package-management model: each
   api carries its own lock).
3. **Whole-word replace in CONTENTS and PATHS** — `buildReplacers()` uses `\b`-anchored
   regexes and rewrites both the directory/file *name* (`rewrite(entry, …)`) and text-file
   *contents*. `template_api` is replaced **before** `template` so the snake module name is
   handled as a unit (e.g. `src/template_api/` → `src/demo_api/`).
4. **Port math `API=8000+10i`, Supabase block `54321+100i`** — `applyPorts()` shifts
   `config.toml` 543xx ports by the block delta, rewrites the api dev `--port`, and updates
   the committed `app/.env.*` (`EXPO_PUBLIC_API_URL` + supabase URL) so the two stacks
   coexist (Verify #3).
5. **Write `.env.example` + `product.json`, `pnpm install`** — `.env.example` is copied +
   token-rewritten by `copyTree`; `writeMeta` writes the canonical `product.json`;
   `execSync("pnpm install")` resolves the new `@platform/<name>-*` workspaces into the one
   lockfile (Package-management model: one JS universe).
6. **Print the infra checklist** — `printChecklist()` emits the exact items PHILOSOPHY.md lists.

The Figma-bridge addition (`addFigmaMode`) is PHILOSOPHY.md's "the generator adds the new
product's brand mode to the token-pipeline config (placeholder modeId until the designer
creates it)." That config is **`tokens.config.json`** at the repo root — kept name-distinct
from Code Connect's own root **`figma.config.json`** (which is repo-wide and not per-product,
so the generator never touches it).

> The exact `template_api → <snake>_api` artifacts touched (the "explicit list"): package
> names `@platform/template-{app,desktop,api,api-client}`; Expo `slug`/`scheme` + bundle id
> `com.example.template`; electron `appId` `com.example.template.desktop` + releases repo
> `<org>/template-desktop-releases`; Fly app names `example-template-api-{stg,prod}` (in
> `fly.*.toml`); the Python package dir `src/template_api/` and every intra-package import;
> `pyproject.toml` project/module name + `[tool.*]` entries; `alembic.ini` script location
> if it names the module; Supabase `project_id = "example-template"`; and the product docs
> `README.md` / `CLAUDE.md` / `.claude/commands/*`. **Note:** `example` and `com.example.*`
> are org/bundle placeholders, **not** the product token — the `\btemplate\b` regex matches
> only the `template` segment inside `com.example.template`, leaving `example` intact.

---

### Step 5 — `scripts/bootstrap.mjs` + `pnpm bootstrap`

**Files**
- `scripts/bootstrap.mjs`

**Contents**
```js
#!/usr/bin/env node
// scripts/bootstrap.mjs — one-command onboarding.
// PHILOSOPHY.md (Operational defaults): root `pnpm bootstrap` = mise -> install -> supabase start.
// Brings up EVERY product's local Supabase stack (offset ports => they coexist).
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTS = join(ROOT, "products");
const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: "inherit" });

run("mise install");          // pin & install Node 24 / pnpm 11 / Python 3.13 / uv
run("pnpm install");          // single JS dependency universe (frozen-ish; one lockfile)

// supabase start per product — each reads its own config.toml (offset ports), so all
// stacks run simultaneously without colliding.
for (const entry of readdirSync(PRODUCTS)) {
  const cfg = join(PRODUCTS, entry, "supabase", "config.toml");
  if (!existsSync(cfg)) continue;
  console.log(`→ supabase start (${entry})`);
  run("supabase start", join(PRODUCTS, entry));
}
console.log("✅ bootstrap complete — all local stacks up on offset ports");
```

**Commands**
```bash
pnpm bootstrap
# verify the stacks are up on distinct ports:
supabase status   # run inside each product dir, or check the printed URLs
```

**Why**
PHILOSOPHY.md Operational defaults: "root `pnpm bootstrap` (mise → install → supabase start) for
one-command onboarding." Because each product's `supabase/config.toml` carries offset ports
(Step 4), `supabase start` per product yields **simultaneously running** local stacks — the
exact condition Verify #3 and the end-to-end "Multi-product proof" check. `mise install`
first guarantees the toolchain is pinned before anything resolves.

> ⚠️ OPEN / TO CONFIRM — whether `pnpm bootstrap` should start **all** products or just the
> one the dev is working on. PHILOSOPHY.md says "supabase start" (singular flow) for onboarding
> but the Phase 7 verify explicitly wants **both** stacks up simultaneously. This guide
> starts all products (loop) to satisfy the verify; a `--filter <product>` flag could
> narrow it later.

---

### Step 6 — Stamp the `demo` product

**Files** (produced, not authored)
- `products/demo/**` — the full stamped tree, `product.json` = `{"name":"demo","portIndex":1}`.

**Commands**
```bash
pnpm new-product demo
git status --porcelain products/demo | head        # newly created tree
cat products/demo/product.json                      # {"name":"demo","portIndex":1}
```

**Why**
This is the Phase 7 deliverable — a second product proving the generator. `demo` gets
`portIndex=1` (template is `0`), so its API binds `8010` and its Supabase block starts at
`54421`. The stamped tree contains `@platform/demo-{app,desktop,api,api-client}`, the
Python module `src/demo_api/`, bundle id `com.example.demo`, Fly apps
`example-demo-api-{stg,prod}`, Supabase `project_id = "example-demo"`, and its own copied
brand assets — with **zero** `template` tokens remaining (Verify #5).

---

## Gotchas & pitfalls

- **Whole-word only — never partial-match.** The replacement uses `\b`-anchored regexes
  (`/\btemplate\b/`, `/\bTemplate\b/`, `/\btemplate_api\b/`). Without word boundaries you
  would corrupt any word that *contains* "template" — e.g. `templated`, `templates`,
  `templating`, a CSS class, a comment, or a third-party identifier. PHILOSOPHY.md ruling #7 is
  explicit: **whole-word**. Test by grepping the stamped product for the *stem* and
  confirming only intended hits would have matched.

- **Replace in PATHS, not just contents.** The most common generator bug is rewriting file
  *contents* but leaving directory/file *names* (`src/template_api/`,
  `template_api.egg-info`, doc filenames). `copyTree` rewrites `entry` (the path segment)
  on every node. If `git grep -iw template products/demo` is empty but
  `find products/demo -iname '*template*'` is **not**, paths were missed.

- **Order the replacers longest-first.** Replace `template_api` (snake module) **before**
  `template` (kebab), or `template_api` becomes `<kebab>_api` with the wrong stem on hyphenated
  names. The generator's `buildReplacers` array is ordered for this reason.

- **Keep `uv.lock` — do NOT delete it.** Each api is a self-contained uv project with its
  own lock (Package-management model). `uv.lock` is *not* in the `SKIP` set, so it travels.
  If it were skipped, the stamped api would float its Python deps and `uv sync --frozen`
  (CI/Docker) would fail.

- **Skip build artifacts, not source.** `SKIP = {node_modules, .venv, dist, .expo,
  release}`. Copying `node_modules`/`.venv` would be slow, huge, and wrong (they'd point at
  the template's resolved paths). `dist`/`.expo`/`release` are regenerable outputs. Never
  add `uv.lock` or `supabase/migrations` to this set.

- **`portIndex` collisions.** `nextPortIndex()` scans **every** `products/*/product.json`
  and takes `max+1`. If you ever hand-create a product dir without a `product.json`, or
  delete a product but reuse its index, two stacks can collide. The single source of truth
  for a product's index is its committed `product.json` — never hardcode a port elsewhere
  (docs read ports from `product.json`).

- **`_template` stays built (underscore prefix is deliberate).** The directory is
  `products/_template` and `pnpm-workspace.yaml` globs `products/*/{app,desktop,api,api-client}`
  — the leading underscore still matches `*`, so the template's workspaces are installed,
  typechecked, and built in CI and never rot (Key ruling #7). Do **not** rename it to
  `template/` (that's a real product name) or exclude it from the globs.

- **Naming derives from the product name, never the repo name.** `platform`
  (root) and `@platform/*` (scope) are **not** product tokens; the generator must never
  rewrite them. Only the `template`/`Template`/`template_api` *product* token is rewritten.
  This is what keeps the scaffold portable (Naming conventions header).

- **Preserve placeholders.** `example`, `com.example.*`, `TODO-EAS-PROJECT-ID`, the
  releases-repo owner, and (new this phase) `TODO-FIGMA-MODE-ID` are intentional swap-points,
  not product tokens. The `\btemplate\b` regex matches only the `template` segment inside
  `com.example.template` (→ `com.example.<name>`), leaving `example` untouched. Verify with
  `git grep -inE 'example|TODO' products/demo` — it should surface exactly the intended
  swap-points and nothing else.

- **`.env.development/.staging/.production` are committed and must travel.** They're
  publishable-only (`EXPO_PUBLIC_*`) and gitignore allows them (Env/config). `copyTree`
  treats `.env*` as text (so tokens + ports are rewritten). The secret-bearing `.env` /
  `.env.local` are gitignored and never exist in the template to copy.

- **Binary assets copied verbatim.** The PNG brand outputs are not text — `copyTree` uses
  `copyFileSync` for non-text files so they aren't corrupted by a UTF-8 read/write. Only
  `source.svg` (text) gets token replacement (harmless — it has no `template` token).

- **`pnpm install` after stamping is mandatory.** The new `@platform/<name>-*` workspaces
  must be linked into the single lockfile/hoisted `node_modules` before `turbo --affected`
  can see them. The generator runs it (Step 5); don't skip it.

---

## Verification

Run from repo root. Expected results stated per command.

**1. Stamp succeeds; metadata + ports correct**
```bash
pnpm new-product demo
cat products/demo/product.json
```
Expected: prints the stamp log + infra checklist; `product.json` is
`{"name":"demo","portIndex":1}`. Re-running `pnpm new-product demo` fails with
`product "demo" already exists`. `pnpm new-product Demo` / `pnpm new-product 1bad` fail the
`/^[a-z][a-z0-9-]*$/` validation.

**2. No `template` token leaked (the headline check)**
```bash
git grep -iw template products/demo          # EXPECT: empty (no output, exit 1)
find products/demo -iname '*template*'        # EXPECT: empty (paths rewritten too)
git grep -inE 'example|TODO' products/demo    # EXPECT: only intended placeholders
```
Expected: the first two return nothing (token gone from contents **and** paths). The third
surfaces exactly `example` org placeholders, `com.example.demo`, `TODO-EAS-PROJECT-ID`,
releases-repo owner, `TODO-FIGMA-MODE-ID` — and nothing stray.

**3. Both products build via `--affected`**
```bash
pnpm install                                  # already run by the generator; safe to repeat
pnpm turbo run build --affected --dry=json | jq '.packages'   # see the package set
pnpm turbo run build --affected
```
Expected: the affected set includes **both** `template` and `demo` workspaces (on the first
post-stamp run, or after a `packages/*`/root change both products are affected). Build runs
the real edge order per product: `openapi → api-client#build → app build → desktop build`.

**4. Both local stacks run simultaneously on distinct ports**
```bash
pnpm bootstrap
# template: API http://localhost:8000  · Supabase API http://localhost:54321
# demo:     API http://localhost:8010  · Supabase API http://localhost:54421
```
Expected: `mise install` + `pnpm install` succeed, then `supabase start` runs for **both**
products with no port collision (offset blocks). Both stacks reachable at the same time.

**5. demo carries its own placeholder brand assets**
```bash
ls products/demo/app/assets/brand/
# EXPECT: source.svg gen-brand.mjs README.md icon.png adaptive-icon.png splash.png favicon.png
diff products/_template/app/assets/brand/icon.png products/demo/app/assets/brand/icon.png
# EXPECT: identical bytes (copied placeholders) — demo OWNS its copy, not a symlink
test -L products/demo/app/assets/brand/icon.png && echo "FAIL: symlink" || echo "ok: real file"
```
Expected: the full asset set is present and is a real (copied) file demo can replace
independently.

**6. Figma mode registered**
```bash
jq '.modes' tokens.config.json
# EXPECT: { "template": "<modeId>", "demo": "TODO-FIGMA-MODE-ID" }
# (Code Connect's root figma.config.json is unchanged — it is not per-product.)
```

---

## Commits

Per PHILOSOPHY.md "Each phase = one commit (or a few logical commits) on a feature branch."
Suggested split on a `phase-7-generator` branch:

1. **`feat(template): product.json + single-source brand assets & regen script`** —
   `products/_template/product.json`, `app/assets/brand/{source.svg,gen-brand.mjs,README.md}`
   + committed placeholder PNGs, `brand:gen` app script. (Steps 1–2)
2. **`feat(scripts): zero-dep new-product generator`** — `scripts/new-product.mjs`
   (validate/collision/portIndex, copy + skip-list, whole-word replace in contents+paths,
   port offsets, figma mode, pnpm install, infra checklist) + root `package.json`
   `new-product` script. (Steps 3–4)
3. **`feat(scripts): pnpm bootstrap (mise → install → supabase start)`** —
   `scripts/bootstrap.mjs` + root `bootstrap` script. (Steps 3, 5)
4. **`feat(products): stamp demo product (portIndex=1)`** — the generated
   `products/demo/**` tree + the `tokens.config.json` `demo` mode entry. (Step 6)

> Keep the generated `products/demo` tree in its **own** commit so its diff is reviewable
> as "what the generator produced," distinct from the generator's source.

---

## Open questions / deferred

- **Brand rasterizer: `sharp`.** `gen-brand.mjs` uses `sharp` (rasterize SVG source + resize
  every PNG), added to the app workspace devDeps and pinned exact at install. The *size matrix*
  (`icon` 1024 / `adaptive-icon` / `splash` / `favicon`) is the contract; align it with
  whatever `app.config.ts` references (read it from Phase 2).
- **Exact splash/icon sizes & extra densities** — PHILOSOPHY.md says "all sizes" without
  enumerating them; the matrix above is this guide's concrete set. **⚠️ OPEN / TO CONFIRM**
  against `app.config.ts` + EAS requirements.
- **`pnpm bootstrap` scope** — start *all* products vs a `--filter`ed one. This guide starts
  all (to satisfy the simultaneous-stacks verify). **⚠️ OPEN / TO CONFIRM.**
- **Supabase port-block granularity** — this guide shifts every `543xx` default by
  `100*i`. Exact per-service offsets (api/studio/db/inbucket/analytics) depend on which
  ports `config.toml` declares; confirm none exceed the block or collide. **⚠️ OPEN / TO
  CONFIRM** against the actual `config.toml`.
- **`.env.*` host rewrite breadth** — the generator rewrites `localhost`/`127.0.0.1`
  ports in committed env files. Whether staging/production env files should carry local
  ports at all (vs real hosts that the infra checklist later fills) is **⚠️ OPEN / TO
  CONFIRM**; this guide only offsets the local-host occurrences.
- **Text-vs-binary classification** — `isText()` uses an extension allow-list. A new
  template file type outside the list would be copied verbatim (no token replacement). Keep
  `TEXT_EXT` in sync with the template's file types. **⚠️ OPEN / TO CONFIRM.**
- **`tokens.config.json` shape** — this guide assumes `{ fileKey, modes: {...} }` (PHILOSOPHY.md
  Figma-bridge note; the token-pipeline config, name-distinct from Code Connect's root
  `figma.config.json`). If Phase 2 settled on the Tokens-Studio-JSON default (no `fileKey`),
  the mode-registration key may differ. **⚠️ OPEN / TO CONFIRM** against Phase 2.
- **`GH_TOKEN` vs per-product secret naming** in the checklist (`FLY_API_TOKEN_<NAME>`
  etc.) — exact secret names are owned by Phase 8 (CI/CD). The checklist here is the
  human prompt; the canonical names are **deferred to Phase 8**.
- **Post-stamp `lefthook`/`prepare`** — whether the generator should also run
  `pnpm prepare` (re-install git hooks) is unspecified; `pnpm install` typically triggers
  `prepare`. **⚠️ OPEN / TO CONFIRM.**
- **Deferred:** wiring `gen-brand.mjs` to also emit per-OS **desktop** icon formats
  (`.ico`/`.icns`) — flagged in Phase 5's open questions; reuse this single source when
  that pipeline is built. **Deferred.**
