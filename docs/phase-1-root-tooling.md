# Phase 1 — Root tooling

**Goal.** Stand up the empty monorepo's foundational tooling so every later phase plugs into one coherent JS dependency universe and one Turborepo task graph. After this phase the repo has: pinned toolchain (`mise.toml`), pnpm workspace config (`pnpm-workspace.yaml`, which under pnpm 11 now also carries the pnpm settings — `nodeLinker`, `preferFrozenLockfile`, `allowBuilds` — that used to live in `.npmrc`; plus an auth/registry-only `.npmrc`), the root `package.json` with orchestration scripts and shared devDeps, `turbo.json` (Turborepo 2.9 `tasks` graph), strict `tsconfig.base.json`, a `.gitignore` that still allows committed per-env `.env` files, the shared `@platform/config` package (ESLint flat config, Prettier, tailwind preset, tsconfig presets), and `lefthook.yml` git hooks (installed via `pnpm prepare`) wired for a fast staged pre-commit lint and an `--affected` pre-push gate. No product workspaces exist yet, so all turbo runs are clean no-ops.

**Verify criteria (restated from the Phase 1 row of PHILOSOPHY.md):**

- `mise install && pnpm install && pnpm turbo run lint` runs clean as a no-op (no workspaces match yet, turbo reports "no tasks to run" or all cache-hit, exit 0).
- A `git commit` triggers the staged-files lint (Prettier + ESLint on staged JS/TS; Ruff on staged `.py` once an api exists).
- A `git push` triggers the affected gate (`turbo run typecheck test build --affected`).

---

## Prerequisites

Before starting Phase 1:

- **`mise` installed** on the machine (the version manager that pins the toolchain). Install per <https://mise.jdx.dev>. Everything else (Node 24, pnpm 11, Python 3.13, uv) is provisioned BY mise from `mise.toml` — do **not** pre-install Node/pnpm/Python globally; let mise own them. (pnpm 11 is pure ESM and requires Node ≥ 22.13 — Node 24 satisfies this comfortably.)
- **Git repo initialized** (it already is — `git status` works; `PHILOSOPHY.md`, `README.md`, and an empty `docs/` exist). You are on the default branch with a clean tree.
- **A feature branch** for this phase (per PHILOSOPHY.md "Each phase = one commit (or a few logical commits) on a feature branch"). Example: `git checkout -b phase-1-root-tooling`.
- **Network access** for `pnpm install` to fetch `turbo`, `prettier`, `lefthook`, ESLint, etc.
- No infra accounts are required in Phase 1 (no Supabase/Fly/Vercel/EAS yet — those land with the generator in Phase 7).

⚠️ **OPEN / TO CONFIRM:** PHILOSOPHY.md does not pin an exact patch for `mise` itself, nor the host OS. Steps below assume a POSIX shell (the env reports Linux). Adjust shell quoting on Windows.

---

## Definition of done

Each bullet is independently testable (see **Verification** for the exact commands):

1. **Toolchain pins resolve.** `mise install` succeeds and `mise current` reports node 24, pnpm 11, python 3.13, uv (latest) exactly as pinned in `mise.toml`. `node -v`, `pnpm -v`, `python --version`, `uv --version` all reflect the mise-managed versions.
2. **Workspace installs clean.** `pnpm install` succeeds with `nodeLinker: hoisted` (set in `pnpm-workspace.yaml`, giving a flat-ish `node_modules`), produces a single `pnpm-lock.yaml`, and runs the `prepare` script which installs Lefthook git hooks.
3. **Turbo lint is a clean no-op.** `pnpm turbo run lint` exits 0. With only `packages/config` present (which has no lintable source yet) turbo reports no tasks / cache-hit and does not error on the absent product workspaces.
4. **`@platform/config` is consumable.** The package resolves under the `@platform/*` scope and exposes: `eslint.config.js` (flat), `prettier.json`, `tailwind-preset.js`, and `tsconfig/{base,expo,node}.json`. `pnpm --filter @platform/config exec ls` lists them.
5. **Strict TS base exists.** `tsconfig.base.json` sets `strict: true`, `moduleResolution: "bundler"`, `noEmit: true` and is extendable by downstream workspaces.
6. **`.gitignore` is correct.** It ignores `node_modules`, build outputs, `.venv`, `.expo`, caches, `.env`, and `.env.local`, but **does NOT** ignore committed per-env files (`.env.development`, `.env.staging`, `.env.production`).
7. **pre-commit hook fires.** Committing a deliberately mis-formatted `.ts` file is reformatted/flagged by the staged Prettier + ESLint job before the commit completes.
8. **pre-push hook fires.** A push invokes `turbo run typecheck test build --affected` (a no-op clean pass while no products exist, but the gate runs).
9. **Hooks auto-installed.** `lefthook` git hooks were installed by `pnpm prepare` (the `.git/hooks/pre-commit` and `pre-push` are Lefthook shims), with zero manual `lefthook install`.
10. **`pnpm bootstrap` runs.** `scripts/bootstrap.mjs` exists; `pnpm bootstrap` runs `mise install` + `pnpm install` and the `products/*` supabase loop is a clean no-op (no products yet). It is the single, data-driven definition reused unchanged in every later phase.

---

## Build steps

> Run every command from the repo root unless stated otherwise. Create files exactly at the paths shown.

### Step 1 — `mise.toml` (pin the toolchain)

**Files:** `mise.toml`

**Contents:**

```toml
# mise.toml — single source of truth for the repo toolchain.
# PHILOSOPHY.md Decision Sheet: "mise pins Node 24 LTS / pnpm 11 / Python 3.13 / uv".
[tools]
node = "24"      # Node 24 'Krypton' Active LTS (recommended 2026 runtime; pnpm 11 needs Node >= 22.13)
pnpm = "11"
python = "3.13"
uv = "latest"

[env]
# Keep tool-managed shims first on PATH for child processes (turbo, lefthook).
_.path = ["{{config_root}}/node_modules/.bin"]
```

**Commands:**

```bash
mise install            # provisions node 24, pnpm 11, python 3.13, uv
mise current            # sanity-check the resolved versions
```

**Why.** PHILOSOPHY.md locks the toolchain in the Decision Sheet ("mise pins Node 24 LTS / pnpm 11 / Python 3.13 / uv") and lists `mise.toml` as the first root file. mise must be the toolchain owner so CI (`mise-action`, per "Workflows") and local dev resolve identical versions. **Node 24** is the current Active LTS (Node 22 has dropped to Maintenance LTS, EOL Apr 2027); **pnpm 11** is the current major (pure ESM, requires Node ≥ 22.13 — satisfied by 24). `uv` is pinned here even though Python deps are per-product (PHILOSOPHY "Package management model") because the generator and api Dockerfiles assume `uv` is on PATH.

> **Note on `[settings] experimental`.** An earlier draft set `experimental = true` with a "reproducible installs" rationale — that rationale was wrong. The `experimental` flag gates mise's _experimental features_ (e.g. `[hooks]`, monorepo mode), NOT version-pin reproducibility (which is just the `[tools]` specifiers). The `[env] _.path` line is basic env-path support and needs no experimental flag, so the flag is dropped here. Add `experimental = true` back only if you later introduce `[hooks]`.

**Resolved (uv pin):** `uv = "latest"` is valid mise syntax and fine for dev — mise's built-in uv provider supports both `latest` and an exact pin. For reproducible CI/Docker, pin an exact uv version once Phase 3's api Dockerfile depends on it. Not a correctness bug.

---

### Step 2 — `.npmrc` (auth/registry only under pnpm 11)

**Files:** `.npmrc`

**Contents:**

```ini
# .npmrc — committed (EAS workspace detection looks for it on the runner; PHILOSOPHY "Workflows").
#
# pnpm 11 IMPORTANT: .npmrc is now read for AUTH/REGISTRY settings ONLY. Every other pnpm
# setting (node-linker, prefer-frozen-lockfile, the build-script allowlist, hoist-pattern,
# save-exact, …) MUST live in pnpm-workspace.yaml as camelCase keys (see Step 3). pnpm 11
# SILENTLY IGNORES those keys here — no warning — so do NOT put nodeLinker etc. in this file.
#
# This file is intentionally near-empty in Phase 1: there are no private registries or auth
# tokens yet. It exists (and is committed) only so EAS/CI tooling finds the expected marker.
# Add registry/auth lines here as infra accounts appear, e.g.:
#   # registry=https://registry.npmjs.org/
#   # //registry.example.com/:_authToken=${NPM_TOKEN}
```

**Commands:**

```bash
# no command — file is consumed by the next pnpm install
```

**Why.** Under pnpm 11 the `.npmrc` is **auth/registry-only**; the linker and lockfile/build-script settings that used to live here have moved to `pnpm-workspace.yaml` (Step 3) as camelCase keys. We keep a committed (near-empty) `.npmrc` because PHILOSOPHY "Workflows" calls it out as **committed** — the `eas-build.yml` runner looks for it for workspace detection — and because it's where future registry/auth lines belong.

> **pnpm 10 → 11 migration note.** If you are migrating an existing pnpm-10 repo, `pnpm dlx codemod run pnpm-v10-to-v11` performs the `.npmrc` → `pnpm-workspace.yaml` split automatically (including `only-built-dependencies` → `allowBuilds`). The ruling #6 "hoisted linker / never `disableHierarchicalLookups`" guidance is unchanged — only the _location_ of the setting moved.

---

### Step 3 — `pnpm-workspace.yaml` (workspace globs)

**Files:** `pnpm-workspace.yaml`

**Contents:**

```yaml
# pnpm-workspace.yaml — the JS dependency universe (PHILOSOPHY "Package management model":
# ONE root pnpm workspace, ONE pnpm-lock.yaml, hoisted node_modules, single pnpm install).
#
# Under pnpm 11 this file ALSO holds the pnpm settings that used to live in .npmrc
# (relocated as camelCase keys — see Step 2). Auth/registry lines stay in .npmrc.

# --- pnpm settings (pnpm 11; camelCase) ---
# Key design ruling #6: pnpm + Expo/Metro requires the HOISTED node-linker (flat node_modules
# is the documented Expo happy path). Never set disableHierarchicalLookups — metro's
# nodeModulesPaths walk depends on hierarchical lookup working.
nodeLinker: hoisted

# Keep the lockfile authoritative + installs reproducible across machines and CI. (pnpm also
# auto-enables frozen-lockfile in CI, and pnpm 11 fails a CI install if the lockfile was written
# by a NEWER pnpm major — so keep the pnpm major aligned across dev/CI, Step 1 + Step 4.)
preferFrozenLockfile: true

# Build-script allowlist. pnpm blocks dependency lifecycle (build) scripts by default; pnpm 11
# replaced the old `only-built-dependencies` API with this `allowBuilds` map (package → boolean).
# Empty in Phase 1; add entries as Phase 2+ introduces native tooling that needs a build step:
#   allowBuilds:
#     esbuild: true
allowBuilds: {}

# --- workspace globs ---
packages:
  - "packages/*"
  # Each product is THREE JS workspaces + a generated client (PHILOSOPHY ruling #1):
  - "products/*/app"
  - "products/*/desktop"
  - "products/*/api" # script-shim package.json → uv run (PHILOSOPHY "Package management model")
  - "products/*/api-client" # generated + committed (hey-api)
```

**Commands:**

```bash
# no command — consumed by pnpm install
```

**Why.** PHILOSOPHY "Package management model" + Directory tree: the `packages:` globs are `packages/*` and `products/*/{app,desktop,api,api-client}`. Listing the four product sub-workspace types explicitly (rather than `products/*`) avoids pnpm trying to treat `products/<name>/supabase` or `products/<name>` itself as a package. In Phase 1 only `packages/config` matches; the product globs are inert no-ops until Phase 2+.

Under **pnpm 11** this same file is now also where the pnpm _settings_ live: `nodeLinker: hoisted` (relocated from `.npmrc` per ruling #6), `preferFrozenLockfile: true`, and the `allowBuilds` map (the pnpm-11 replacement for the removed `only-built-dependencies`). These keys are silently ignored if left in `.npmrc`, so they MUST be here.

⚠️ **REVIEW:** PHILOSOPHY "Workflows" notes EAS relied on a committed `.npmrc` for workspace detection. Verify EAS (Phase 8) still keys off `.npmrc` presence vs. needing the linker setting itself — under pnpm 11 the linker is in `pnpm-workspace.yaml`, so if EAS expected `node-linker` _inside_ `.npmrc` that workaround may need revisiting.

---

### Step 4 — root `package.json` (scripts + shared devDeps)

**Files:** `package.json`

**Contents:**

```json
{
  "name": "platform",
  "private": true,
  "packageManager": "pnpm@11.6.0",
  "engines": {
    "node": ">=22.13",
    "pnpm": ">=11"
  },
  "scripts": {
    "prepare": "lefthook install",
    "bootstrap": "node scripts/bootstrap.mjs",
    "new-product": "node scripts/new-product.mjs",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "build": "turbo run build",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md,yml,yaml}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md,yml,yaml}\""
  },
  "devDependencies": {
    "turbo": "2.9.0",
    "prettier": "^3.3.0",
    "lefthook": "^1.7.0",
    "typescript": "^5.6.0",
    "@platform/config": "workspace:*"
  }
}
```

**Commands:**

```bash
pnpm install            # installs devDeps, links @platform/config, runs `prepare`
```

**Why.**

- `"prepare": "lefthook install"` — PHILOSOPHY Phase 1 explicitly says "hooks install via `pnpm prepare`". pnpm runs `prepare` automatically after `pnpm install`, so cloning + installing is the only step needed to get hooks.
- `"packageManager": "pnpm@11.6.0"` — PHILOSOPHY "Workflows" calls out the `packageManager` field as the **eas-cli workspace detection workaround**; it also lets corepack/CI pick the right pnpm. Corepack expects a full exact semver, so set it to the exact pnpm version the lockfile resolves (the `11.6.0` shown is the current pnpm 11 patch as of June 2026 — replace with the lockfile's actual patch). Keeping this aligned with `mise.toml` matters MORE under pnpm 11, which fails a CI install when the lockfile was written by a newer pnpm major.
- `scripts: new-product, bootstrap` and `devDeps: turbo, prettier, lefthook` come verbatim from the Directory-tree annotation for `package.json`. `bootstrap` = "mise → install → supabase start" (PHILOSOPHY "Operational defaults"), implemented as `scripts/bootstrap.mjs` (created in Step 4b below) — a single, data-driven definition so there is no inline-vs-script drift to reconcile in a later phase. The `new-product` entry points at `scripts/new-product.mjs`, which is built in Phase 7 (the entry exists now; running it before Phase 7 errors with "file not found" — expected).
- `@platform/config` as a `workspace:*` devDep makes the shared ESLint/Prettier/tsconfig presets resolvable from the root.

⚠️ **OPEN / TO CONFIRM:** Exact dep versions. PHILOSOPHY.md pins **Turborepo 2.9** (so `turbo` is set to `2.9.0` — confirm the exact 2.9.x patch at install time; the 2.9.x line is live as of June 2026). Prettier/lefthook/typescript patch versions are not pinned in PHILOSOPHY; the `^` ranges above are reasonable defaults — replace with whatever the lockfile resolves and pin if stricter reproducibility is wanted. `"name": "platform"` is the root monorepo name; note PHILOSOPHY's naming convention warns the **monorepo name never drives app/infra ids** (those come from product names) — so this name is cosmetic only, independent of the git repo name.

---

### Step 4b — `scripts/bootstrap.mjs` (one-command onboarding, data-driven)

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

run("mise install"); // pin & install Node 24 / pnpm 11 / Python 3.13 / uv
run("pnpm install"); // single JS dependency universe (one lockfile)

// supabase start per product — each reads its own config.toml (offset ports), so all
// stacks run simultaneously without colliding. Data-driven: a no-op until products exist,
// and automatically covers every product the Phase 7 generator stamps later.
if (existsSync(PRODUCTS)) {
  for (const entry of readdirSync(PRODUCTS)) {
    const cfg = join(PRODUCTS, entry, "supabase", "config.toml");
    if (!existsSync(cfg)) continue;
    console.log(`→ supabase start (${entry})`);
    run("supabase start", join(PRODUCTS, entry));
  }
}
console.log("✅ bootstrap complete");
```

**Commands**

```bash
pnpm bootstrap   # in Phase 1: runs mise install + pnpm install (no products yet -> empty loop)
```

**Why.** `pnpm bootstrap` must run `supabase start` in **each product's directory** (where
`products/<name>/supabase/config.toml` lives) — but `products/<name>` is **not** a workspace
(the glob is `products/*/{app,desktop,api,api-client}`), so an inline `pnpm -r run
supabase:start` would execute from the wrong cwd and `supabase` wouldn't find its config. A
tiny Node loop over `products/*` runs `supabase start` with the correct cwd. It is built
**here, in Phase 1, as the single definition** — data-driven so it is a no-op now (no products
yet) and automatically covers every product Phase 7+ stamps, with **no redefinition in a later
phase**. (`mise install` first guarantees the toolchain is pinned before anything resolves.)

---

### Step 5 — `turbo.json` (Turborepo 2.9 task graph)

**Files:** `turbo.json`

**Contents:**

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "tasks": {
    "openapi": {
      "inputs": ["src/**/*.py", "pyproject.toml", "uv.lock"],
      "outputs": ["openapi.json"]
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "src/**/*.gen.ts", "renderer/**"]
    },
    "export:web": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**Notes on the graph (faithful to PHILOSOPHY "Config essentials & gotchas → turbo.json"):**

- `openapi` runs in api packages; **Python `inputs` globs are mandatory** (`src/**/*.py`, `pyproject.toml`, `uv.lock`) or caching is wrong (PHILOSOPHY gotcha). `outputs: ["openapi.json"]`.
- The `api-client#build` edge (`dependsOn: ["^openapi", "^build"]`) and `desktop#build` edge (`dependsOn: ["^export:web"]`, copies `../app/dist` → `renderer/`) are **package-level** turbo.json overrides per PHILOSOPHY — they live in `products/*/api-client/turbo.json` and `products/*/desktop/turbo.json`, added in Phases 4 and 5. Do NOT encode product-specific edges in the root file.
- Dependency edges otherwise come from **real `dependencies`/`devDependencies`** (`api-client` devDepends on its `api`; `desktop` devDepends on its `app`) — turbo derives `^` ordering from the workspace graph (PHILOSOPHY gotcha).
- `dev` = `cache: false, persistent: true` (PHILOSOPHY).

**Commands:**

```bash
pnpm turbo run lint     # should be a clean no-op while only packages/config exists
```

**Why.** PHILOSOPHY pins Turborepo 2.9 and its key `2.9 "tasks"` field name (not the legacy `pipeline`). The `inputs`/`outputs` and `dependsOn` shapes are dictated verbatim by the "turbo.json (2.9 `tasks`)" paragraph. Keeping product-specific edges in package-level configs (per PHILOSOPHY) keeps the root graph generic and the generator-stamped products self-describing.

⚠️ **OPEN / TO CONFIRM:** PHILOSOPHY lists task names `openapi`, `build`, `export:web`, `dev`, `lint`, `typecheck`, `test`. It does not give a literal root `turbo.json`; the `outputs` for `build` (`dist`, generated `*.gen.ts`, `renderer`) are inferred from the graph description and may be refined per-package later. Confirm exact `turbo` 2.9.x schema URL/fields against the installed version.

---

### Step 6 — `tsconfig.base.json` (strict TS base)

**Files:** `tsconfig.base.json`

**Contents:**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ESNext",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

**Commands:**

```bash
# no command — extended by downstream tsconfigs via "extends"
```

**Why.** PHILOSOPHY Directory tree: `tsconfig.base.json` = "strict, moduleResolution bundler, noEmit". PHILOSOPHY "Quality" reiterates "tsconfig strict". This base is the root anchor; the per-target presets in `packages/config/tsconfig/{base,expo,node}.json` (Step 7e) extend it. `skipLibCheck` is standard for RN/Expo monorepos to avoid third-party `.d.ts` noise; `noUncheckedIndexedAccess` raises strictness consistent with PHILOSOPHY's strict posture.

⚠️ **OPEN / TO CONFIRM:** PHILOSOPHY names exactly three knobs (strict / moduleResolution bundler / noEmit). The additional flags above are conventional hardening, not PHILOSOPHY-mandated — trim if a downstream tool (e.g. babel-preset-expo) conflicts.

---

### Step 7 — `packages/config` (`@platform/config` shared presets)

This is the one real workspace created in Phase 1. It bundles ESLint flat config, Prettier config, the tailwind preset, and the tsconfig presets, consumed by every other package/product.

#### Step 7a — `packages/config/package.json`

**Files:** `packages/config/package.json`

**Contents:**

```json
{
  "name": "@platform/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./eslint": "./eslint.config.js",
    "./prettier": "./prettier.json",
    "./tailwind-preset": "./tailwind-preset.js",
    "./tsconfig/base": "./tsconfig/base.json",
    "./tsconfig/expo": "./tsconfig/expo.json",
    "./tsconfig/node": "./tsconfig/node.json"
  },
  "devDependencies": {
    "eslint": "^9.10.0",
    "@eslint/js": "^9.10.0",
    "typescript-eslint": "^8.5.0",
    "eslint-plugin-react": "^7.36.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.3.0",
    "prettier-plugin-tailwindcss": "^0.6.0"
  }
}
```

**Why.** PHILOSOPHY Directory tree: `packages/config` = "`@platform/config`: eslint flat config, prettier.json, tailwind-preset.js (design tokens), tsconfig/{base,expo,node}.json". The `exports` subpaths let consumers write `@platform/config/eslint`, `@platform/config/tailwind-preset`, `@platform/config/tsconfig/expo`, etc. — and PHILOSOPHY's `tailwind.config.js` note explicitly references `@platform/config/tailwind-preset`. `"type": "module"` so the flat config and preset are ESM.

#### Step 7b — `packages/config/eslint.config.js` (ESLint flat config)

**Files:** `packages/config/eslint.config.js`

**Contents:**

```js
// @platform/config — shared ESLint FLAT config (PHILOSOPHY "Quality": ESLint flat config + Prettier).
// Consumed by downstream workspaces: `export { default } from "@platform/config/eslint";`
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // Ignore generated + build artifacts everywhere.
  {
    ignores: [
      "**/dist/**",
      "**/.expo/**",
      "**/node_modules/**",
      "**/storybook-static/**",
      // Generated hey-api client is committed but never linted (PHILOSOPHY: never-edit-generated-client).
      "products/*/api-client/src/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off", // react-jsx runtime
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Must be LAST: turns off rules that conflict with Prettier formatting.
  prettier,
);
```

**Why.** PHILOSOPHY "Quality": "ESLint **flat config** + Prettier". Flat config (`eslint.config.js`, ESLint 9) is the locked style. Ignoring `products/*/api-client/src/**` enforces PHILOSOPHY's "never-edit-generated-client" invariant. `eslint-config-prettier` last avoids ESLint/Prettier fights since Prettier owns formatting.

#### Step 7c — `packages/config/prettier.json`

**Files:** `packages/config/prettier.json`

**Contents:**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

**Why.** PHILOSOPHY "Quality": Prettier. `prettier-plugin-tailwindcss` sorts `className` utility lists — relevant because PHILOSOPHY's design system uses NativeWind/Tailwind `className` everywhere. Downstream `.prettierrc` files extend this via `"@platform/config/prettier"`.

⚠️ **OPEN / TO CONFIRM:** Specific style knobs (printWidth 100, double quotes, etc.) aren't dictated by PHILOSOPHY — these are conventional defaults. Adjust to team taste; they only need to be consistent repo-wide.

#### Step 7d — `packages/config/tailwind-preset.js` (semantic tokens → CSS vars)

**Files:** `packages/config/tailwind-preset.js`

**Contents:**

```js
// @platform/config — shared Tailwind/NativeWind PRESET.
// PHILOSOPHY ruling #8 + "Theming wiring": the preset maps SEMANTIC color names to CSS VARIABLES.
// Components consume semantic names ONLY (bg-primary, text-foreground) — never hex/brand values.
// Each PRODUCT overrides the VARIABLE VALUES in its own theme.ts/global.css; component code is
// never forked. Identical mechanism on web (CSS vars) and native (NativeWind vars()).
//
// NOTE: this preset declares the semantic color NAMES → var() bindings. It deliberately does NOT
// define the var VALUES (those live in packages/ui/src/lib/theme.ts + each product's theme,
// added Phase 2). HSL channel form `hsl(var(--x))` follows the shadcn/react-native-reusables
// convention so the values are stored as bare H S L triplets.
module.exports = {
  darkMode: "class", // `.dark` class toggles the dark CSS-var block (PHILOSOPHY: runtime dark mode)
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
};
```

> **Module format note:** PHILOSOPHY's `tailwind.config.js` consumes this via `presets: ["@platform/config/tailwind-preset"]` and Tailwind configs are loaded by the Tailwind/NativeWind toolchain in CommonJS context. This file is authored as CommonJS (`module.exports`) even though the package is `"type": "module"`, hence the `.js` export maps to a CJS-shaped file. If Tailwind's loader rejects it under an ESM package, rename to `tailwind-preset.cjs` and update the `exports` subpath. ⚠️ **TO CONFIRM** against the NativeWind v4 + Tailwind toolchain in Phase 2.

**Why.** This is the load-bearing piece of PHILOSOPHY ruling #8 and the "Theming wiring" gotcha: "the shared tailwind preset maps semantic color names to vars (`primary: "hsl(var(--primary))"`, …)". `packages/ui` has **no tailwind config of its own** (PHILOSOPHY gotcha) — it relies on this preset transitively through each product's `tailwind.config.js`. Defining names-not-values here is what makes "one component set, per-product brand, runtime dark mode" work across all four targets.

#### Step 7e — `packages/config/tsconfig/{base,expo,node}.json`

**Files:**

- `packages/config/tsconfig/base.json`
- `packages/config/tsconfig/expo.json`
- `packages/config/tsconfig/node.json`

**Contents — `tsconfig/base.json`:**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "declaration": false
  }
}
```

**Contents — `tsconfig/expo.json`:**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "types": ["expo", "react", "react-native"],
    "moduleResolution": "bundler",
    "allowJs": true
  }
}
```

**Contents — `tsconfig/node.json`:**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ESNext"],
    "types": ["node"],
    "moduleResolution": "bundler"
  }
}
```

**Why.** PHILOSOPHY Directory tree lists `tsconfig/{base,expo,node}.json` under `packages/config`. They all extend the root `tsconfig.base.json` (Step 6) so strictness is defined once. `expo` adds RN/DOM libs + expo types for `products/*/app`; `node` is for Node-side workspaces (scripts, the api script-shim, electron main). Downstream workspaces use `"extends": "@platform/config/tsconfig/expo"` etc.

⚠️ **OPEN / TO CONFIRM:** The exact `types`/`lib` arrays per preset depend on packages introduced in Phase 2+ (`expo`, `react-native` type packages). Treat these as starting points; reconcile when the first app workspace is added.

**Commands (after all of Step 7):**

```bash
pnpm install                                   # links @platform/config into the workspace
pnpm --filter @platform/config exec ls -R      # confirm files are present & resolvable
```

---

### Step 8 — `.gitignore` (ignore artifacts, KEEP per-env .env files)

**Files:** `.gitignore`

**Contents:**

```gitignore
# ---- JS / pnpm ----
node_modules/
.pnpm-store/
*.tsbuildinfo

# ---- Build outputs ----
dist/
build/
storybook-static/
renderer/            # electron copies app/dist here at build time

# ---- Expo / RN ----
.expo/
.expo-shared/
*.orig.*
web-build/

# ---- Python (per-product uv universes) ----
.venv/
__pycache__/
*.py[cod]
.pytest_cache/
.ruff_cache/

# ---- Electron / packaging ----
release/

# ---- Logs / OS / editor ----
*.log
.DS_Store
.idea/
.vscode/*
!.vscode/extensions.json

# ---- Env / secrets ----
# PHILOSOPHY "Env/config": frontend config is publishable-only (EXPO_PUBLIC_*) in COMMITTED
# per-env files. gitignore allows .env.development/.staging/.production, still ignores
# .env + .env.local. Secrets never live in committed files.
.env
.env.local
.env.*.local
# (Intentionally NOT ignored: .env.development, .env.staging, .env.production — committed.)
```

**Commands:**

```bash
# Verify the allow/ignore boundary with throwaway files:
mkdir -p /tmp/envtest && cd .
touch .env .env.local .env.development .env.staging .env.production
git check-ignore -v .env .env.local .env.development .env.staging .env.production || true
rm -f .env .env.local .env.development .env.staging .env.production
```

Expected: `.env` and `.env.local` are reported ignored; the three per-env files are NOT.

**Why.** PHILOSOPHY "Env/config" (and the Directory-tree annotation on `app/.env.*`): "gitignore allows these [`.env.development/.staging/.production`], still ignores `.env` + `.env.local`". This is a subtle, load-bearing rule — getting the negation wrong either leaks secrets (if `.env` is committed) or breaks the committed-per-env-config model (if the per-env files are ignored). The pattern above ignores only the bare/local/`.*.local` forms.

---

### Step 9 — `lefthook.yml` (git hooks: staged pre-commit, affected pre-push)

**Files:** `lefthook.yml`

**Contents:**

```yaml
# lefthook.yml — repo-level git hooks (PHILOSOPHY Decision Sheet "Git hooks (Lefthook, repo-level +
# affected-scoped)"). Installed by `pnpm prepare` → `lefthook install` (PHILOSOPHY Phase 1).

# pre-commit: FAST, staged files ONLY.
#   - Prettier + ESLint on staged JS/TS
#   - Ruff check + format on staged .py (scoped to the touched product's api)
pre-commit:
  parallel: true
  commands:
    prettier:
      glob: "*.{ts,tsx,js,jsx,json,md,yml,yaml,css}"
      # {staged_files} = only what's staged; --no-error-on-unmatched-pattern so an all-.py
      # commit doesn't fail prettier.
      run: pnpm prettier --write --no-error-on-unmatched-pattern {staged_files}
      stage_fixed: true # re-stage files prettier reformatted
    eslint:
      glob: "*.{ts,tsx,js,jsx}"
      # Lint only staged JS/TS; the @platform/config flat config ignores the generated client.
      run: pnpm eslint --fix --no-error-on-unmatched-pattern {staged_files}
      stage_fixed: true
    ruff-check:
      glob: "*.py"
      # Scoped to staged .py only. Each product api carries uv + ruff in its own venv (Phase 3);
      # `uv run` resolves the right environment from the file's project. No-op until an api exists.
      run: |
        uv run --project "$(dirname {staged_files} | head -1)/.." ruff check --fix {staged_files}
      stage_fixed: true
    ruff-format:
      glob: "*.py"
      run: |
        uv run --project "$(dirname {staged_files} | head -1)/.." ruff format {staged_files}
      stage_fixed: true

# pre-push: the AFFECTED gate (PHILOSOPHY: "turbo run typecheck test build --affected" +, for
# affected APIs, pyright strict + pytest). Builds are turbo-cached so repeat pushes are fast.
# Only product(s) actually touched run, PLUS all dependents when packages/* change
# (the co-evolve guard, moved before the push).
pre-push:
  commands:
    affected-gate:
      run: pnpm turbo run typecheck test build --affected
    # pyright + pytest for affected apis run THROUGH turbo's `typecheck`/`test` tasks in each
    # api package (wired in Phase 3) so they are naturally affected-scoped and cached — no
    # separate lefthook command needed. (See ⚠️ note below.)
```

**Commands:**

```bash
pnpm install            # `prepare` → `lefthook install` writes .git/hooks shims
lefthook version        # sanity check binary is on PATH
ls -la .git/hooks/      # expect lefthook-managed pre-commit & pre-push shims
```

**Why.** This is the centerpiece of the Phase 1 Verify column. PHILOSOPHY's "Git hooks" decision spells the jobs out almost verbatim:

- **pre-commit (fast, staged only):** "Prettier + ESLint on staged JS/TS, Ruff check+format on staged `.py` (scoped to the touched product's api)."
- **pre-push:** "`turbo run typecheck test build --affected` + (for affected APIs) pyright strict + pytest — i.e. ONLY the product(s) actually touched run (plus all dependents when `packages/*` change). Builds are turbo-cached."

`stage_fixed: true` makes `--write`/`--fix` reformats part of the commit. The hooks install via `pnpm prepare` per PHILOSOPHY Phase 1 — no manual `lefthook install` step.

⚠️ **OPEN / TO CONFIRM:**

- PHILOSOPHY says Ruff is "scoped to the touched product's api" but doesn't give the exact lefthook invocation; the `uv run --project …` form above is one plausible scoping. In Phase 1 there is **no api**, so the `.py` commands never match and are no-ops — finalize the exact `--project` resolution in Phase 3 when `products/_template/api` exists (the `$(dirname …)` heuristic is fragile across multiple staged files in different products).
- PHILOSOPHY says pre-push includes "(for affected APIs) pyright strict + pytest". Two faithful ways to honor this: (a) let turbo's per-api `typecheck`/`test` tasks (defined in the api `package.json` as `uv run pyright` / `uv run pytest`) be picked up by `turbo run typecheck test build --affected` — preferred, keeps it cached + affected-scoped; or (b) add explicit lefthook commands. This guide assumes (a). Confirm in Phase 3.
- Lefthook reads `lefthook.yml` at repo root (PHILOSOPHY Directory tree). Version `^1.7.0` chosen as a recent stable; pin to whatever the lockfile resolves.

---

## Gotchas & pitfalls

- **`nodeLinker: hoisted` is mandatory, not optional** (PHILOSOPHY ruling #6) — and under pnpm 11 it lives in `pnpm-workspace.yaml` (camelCase), NOT `.npmrc` (where it would be silently ignored). Without it, Expo/Metro can't resolve hoisted deps and `products/*/app` breaks in Phase 2. Never set `disableHierarchicalLookups`.
- **`.npmrc` must be committed** — `eas-build.yml` (Phase 8) relies on it on the runner for workspace detection, and so does the `packageManager` field in root `package.json` (PHILOSOPHY "Workflows").
- **Hooks install via `pnpm prepare`, not a manual step.** If hooks don't fire, the cause is usually that `prepare` didn't run (e.g. `--ignore-scripts`) — re-run `pnpm install` or `pnpm rebuild`. Verify `.git/hooks/pre-commit` is a Lefthook shim.
- **Python `inputs` globs in `turbo.json` are mandatory** (PHILOSOPHY gotcha): `openapi` must declare `inputs: ["src/**/*.py","pyproject.toml","uv.lock"]` or turbo's content hash ignores `.py` changes and serves a stale cached `openapi.json`. This bites in Phase 4 (typegen drift) if forgotten now.
- **Affected-scoping needs a git base.** `turbo run … --affected` compares against a base ref (default the merge-base with the default branch). On a brand-new branch with no upstream, turbo may consider everything affected — fine for the Phase 1 no-op, but confirm CI sets `TURBO_SCM_BASE`/fetch depth in Phase 8.
- **Don't encode product-specific turbo edges in the root `turbo.json`.** The `api-client#build` (`^openapi`, `^build`) and `desktop#build` (`^export:web`, copy `dist`→`renderer`) edges are **package-level** turbo.json files added with their packages (Phases 4/5). Putting them in the root file would break the generic, generator-stampable shape.
- **`packages/ui` has no tailwind config** (PHILOSOPHY gotcha) — the semantic-token mapping lives ONLY in `@platform/config/tailwind-preset` and is pulled in by each product's `tailwind.config.js`. Don't duplicate it.
- **The preset declares token NAMES, not VALUES.** Putting concrete colors in the preset would break per-product branding (PHILOSOPHY ruling #8). Values land in `packages/ui/src/lib/theme.ts` and each product's `theme.ts`/`global.css` (Phase 2).
- **`.gitignore` env negation is easy to get backwards.** Only `.env`, `.env.local`, `.env.*.local` are ignored. The three committed per-env files must stay tracked (PHILOSOPHY "Env/config").
- **`preferFrozenLockfile: true`** (in `pnpm-workspace.yaml` under pnpm 11, not `.npmrc`) means a `package.json` dep change without a lockfile update will fail install in CI — run `pnpm install` locally to refresh the lockfile before pushing. Note pnpm 11 also fails a CI install when the lockfile was written by a newer pnpm major, so keep the pnpm major aligned across dev/CI.
- **Generated client is never linted/edited.** The ESLint ignore for `products/*/api-client/src/**` enforces PHILOSOPHY's "never-edit-generated-client" invariant; don't remove it.

---

## Verification

Run from repo root. Maps 1:1 to **Definition of done**.

**DoD 1 — toolchain pins:**

```bash
mise install
mise current
node -v        # v24.x
pnpm -v        # 11.x
python --version  # 3.13.x
uv --version
```

Expected: versions match `mise.toml`.

**DoD 2 — clean install + hooks:**

```bash
pnpm install
ls -la .git/hooks/pre-commit .git/hooks/pre-push   # Lefthook shims present
test -f pnpm-lock.yaml && echo "single lockfile OK"
```

Expected: install succeeds, one `pnpm-lock.yaml`, hook shims exist.

**DoD 3 — turbo lint no-op:**

```bash
pnpm turbo run lint ; echo "exit=$?"
```

Expected: `exit=0`. Output reads as "no tasks to run" / all cache-hit (only `packages/config` exists and has no lint task wired yet — adding a `lint` script to it later turns this into a real lint run).

**DoD 4 — `@platform/config` resolves:**

```bash
pnpm --filter @platform/config exec node -e "console.log('resolved @platform/config')"
ls packages/config/eslint.config.js packages/config/prettier.json \
   packages/config/tailwind-preset.js \
   packages/config/tsconfig/base.json packages/config/tsconfig/expo.json packages/config/tsconfig/node.json
```

Expected: all six files listed, no errors.

**DoD 5 — strict TS base:**

```bash
node -e "const c=require('./tsconfig.base.json').compilerOptions; \
  console.log(c.strict===true && c.moduleResolution==='bundler' && c.noEmit===true ? 'strict base OK' : 'FAIL')"
```

Expected: `strict base OK`.

**DoD 6 — .gitignore env boundary:**

```bash
touch .env .env.local .env.development .env.staging .env.production
git check-ignore .env .env.local            # both printed (ignored)
git check-ignore .env.development .env.staging .env.production && echo "BAD: per-env ignored" || echo "per-env files tracked OK"
rm -f .env .env.local .env.development .env.staging .env.production
```

Expected: `.env` + `.env.local` ignored; the per-env trio NOT ignored (`per-env files tracked OK`).

**DoD 7 — pre-commit fires:**

```bash
printf 'export  const   x=1\n' > packages/config/_hooktest.ts
git add packages/config/_hooktest.ts
git commit -m "test: hook"      # Prettier/ESLint should reformat/flag before commit completes
git show --stat HEAD            # the committed file is the reformatted version
git rm packages/config/_hooktest.ts && git commit -m "test: cleanup"
```

Expected: the staged file is auto-formatted (re-staged) and the commit reflects clean formatting.

**DoD 8 — pre-push fires:**

```bash
# Dry run the hook without a remote:
lefthook run pre-push ; echo "exit=$?"
```

Expected: it invokes `pnpm turbo run typecheck test build --affected`, which is a clean no-op while no products exist; `exit=0`.

**DoD 9 — hooks auto-installed (already covered by DoD 2/7/8):** confirm you never ran `lefthook install` manually — only `pnpm install` (its `prepare` did it).

**Phase Verify (the PHILOSOPHY row, end-to-end):**

```bash
mise install && pnpm install && pnpm turbo run lint   # clean no-op, exit 0
```

---

## Commits

Suggested boundaries on the `phase-1-root-tooling` feature branch (PHILOSOPHY: "Each phase = one commit (or a few logical commits)"):

1. `chore: pin toolchain with mise.toml` — Step 1.
2. `chore: pnpm workspace + .npmrc (hoisted linker)` — Steps 2-3.
3. `chore: root package.json + scripts/bootstrap.mjs, turbo.json, tsconfig.base.json` — Steps 4-6 (incl. Step 4b bootstrap).
4. `feat(config): add @platform/config shared presets` — Step 7 (eslint flat, prettier, tailwind preset, tsconfig presets).
5. `chore: .gitignore (ignore artifacts, keep per-env .env)` — Step 8.
6. `chore: lefthook hooks (staged pre-commit, --affected pre-push)` — Step 9.

A single squashed `chore: phase 1 root tooling` is also acceptable. **Do not** `git add/commit/push` as part of executing this guide unless the caller explicitly asks — the parent handles version control.

---

## Open questions / deferred

- **uv exact pin** — PHILOSOPHY says "uv" / mise uses `latest`; pin an exact version once Phase 3's api Dockerfile depends on it. (⚠️ TO CONFIRM)
- **Ruff lefthook scoping** — exact `uv run --project …` invocation for "scoped to the touched product's api" is finalized in Phase 3 when an api exists; the `$(dirname …)` heuristic here is provisional. (⚠️ TO CONFIRM)
- **pre-push pyright/pytest path** — assumed to flow through turbo's per-api `typecheck`/`test` tasks (cached + affected). Confirm vs. explicit lefthook commands in Phase 3. (⚠️ TO CONFIRM)
- **Exact dep versions** — only Turborepo (2.9) and the Node/pnpm/Python pins are PHILOSOPHY-locked; prettier/lefthook/eslint/typescript ranges are conventional defaults — replace with lockfile-resolved pins. (⚠️ TO CONFIRM)
- **tailwind preset module format** — CJS-shaped `.js` under an ESM package may need a `.cjs` rename depending on the NativeWind v4 Tailwind loader; verify in Phase 2. (⚠️ TO CONFIRM)
- **`packages/config` `lint` task** — Phase 1 has no lintable source there, so `turbo run lint` is a true no-op. Wire a real `lint` script into `@platform/config` (and into each package's `package.json`) so the turbo `lint` task does meaningful work from Phase 2 onward. (⚠️ TO CONFIRM)
- **CI affected base ref** — `--affected` base/SCM settings for GitHub Actions are a Phase 8 concern (`ci.yml`), not Phase 1. (Deferred per PHILOSOPHY phasing.)
- **ADR vs ARCHITECTURE.md** — decision-record format is explicitly **deferred** in PHILOSOPHY's Decision Sheet; not a Phase 1 deliverable.
