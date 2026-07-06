# LEARNINGS — gaps found while executing `/implement <N>`

> **What this is.** A running log of everything a phase guide (`docs/phase-N-*.md`) got wrong,
> left out, or that reality contradicted during an actual `/implement` run. One entry per
> finding, filed under the phase it surfaced in. **Purpose:** feed these back into the template
> — each entry names the file(s) to fix (`docs/phase-N-*.md`, `PHILOSOPHY.md`, command docs) so
> a later `/update` (or a manual editing pass) can fold them in and future stampings don't
> re-hit the same walls. Delete entries once they've been folded back in.
>
> **Entry format:** _Symptom_ (what actually happened) → _Root cause_ → _Fix applied in this
> repo_ → _Template change needed_.

---

## Phase 1 — root tooling (`docs/phase-1-root-tooling.md`) — run 2026-07-05

### 1. Missing root ESLint flat config — pre-commit hook blocks every TS/JS commit

- **Symptom:** first commit containing a `.ts`/`.js` file failed; ESLint exited 2 with
  "could not find eslint.config file". DoD 7 (mis-formatted-file commit test) was unpassable
  as the guide is written.
- **Root cause:** ESLint 9 resolves its flat config **from the cwd**, and the `lefthook.yml`
  pre-commit job runs `pnpm eslint {staged_files}` from the **repo root** — but Phase 1 only
  creates `packages/config/eslint.config.js`, no root-level config, so ESLint finds nothing.
- **Fix applied:** added root `eslint.config.mjs` re-exporting the shared preset
  (`export { default } from "@platform/config/eslint";`) — the exact consumption pattern the
  guide itself documents for downstream workspaces; the root workspace is a consumer too.
  (`.mjs` because the root `package.json` is not `"type": "module"`.)
- **Template change needed:** `docs/phase-1-root-tooling.md` Step 7 (or a new step) must
  create the root `eslint.config.mjs`; add it to the Step-7 commit boundary and to DoD 4.
  `PHILOSOPHY.md` directory tree should list it at root.

### 2. `tailwind-preset.js` breaks under `"type": "module"` — the guide's own ⚠️ fires in Phase 1, not Phase 2

- **Symptom:** pre-commit ESLint failed on `packages/config/tailwind-preset.js` with
  `'module' is not defined (no-undef)`. Node would equally refuse to `require()` it: a `.js`
  file inside a `"type": "module"` package is parsed as ESM, and the file is CJS
  (`module.exports`) by design.
- **Root cause:** the guide authors the preset as CJS-in-an-ESM-package and defers the
  conflict to Phase 2 ("⚠️ TO CONFIRM against the NativeWind v4 + Tailwind toolchain"). The
  breakage is not Phase-2-conditional — it is immediate, for both ESLint and Node semantics.
- **Fix applied:** the guide's own anticipated remedy, applied now — renamed to
  `tailwind-preset.cjs` and updated the `exports` subpath in `packages/config/package.json`
  (`"./tailwind-preset": "./tailwind-preset.cjs"`).
- **Template change needed:** `docs/phase-1-root-tooling.md` Step 7d should author the file as
  `tailwind-preset.cjs` from the start (drop the "maybe rename in Phase 2" note; keep the
  Phase-2 instruction to verify the NativeWind/Tailwind loader resolves the `.cjs` export).
  Update the `PHILOSOPHY.md` tree entry (`tailwind-preset.js` → `.cjs`) and its
  `presets: ["@platform/config/tailwind-preset"]` references stay valid (subpath unchanged).

### 3. `allowBuilds` ships empty, but Phase 1 itself needs `lefthook: true`

- **Symptom:** first `pnpm install` ended with `[ERR_PNPM_IGNORED_BUILDS] Ignored build
scripts: lefthook`, and pnpm stamped a placeholder
  (`allowBuilds: { lefthook: set this to true or false }`) into `pnpm-workspace.yaml`.
- **Root cause:** the guide's Step 3 sets `allowBuilds: {}` "empty in Phase 1", but lefthook —
  a Phase 1 devDep — has a postinstall build script that places its binary. The allowlist is
  needed in the very phase that introduces it.
- **Fix applied:** `allowBuilds: lefthook: true` in `pnpm-workspace.yaml`.
- **Template change needed:** `docs/phase-1-root-tooling.md` Step 3 skeleton should ship
  `allowBuilds: { lefthook: true }` (with the comment explaining why), not an empty map.

### 4. Non-interactive runs: `pnpm install` can hang on an interactive prompt

- **Symptom:** a re-run of `pnpm install` (after editing `allowBuilds`) hung for 5+ minutes
  with zero output when executed from a non-TTY agent shell; it was waiting on an interactive
  confirmation (modules-dir purge/rebuild prompt).
- **Root cause:** pnpm 11 prompts on some state changes; agent/CI shells have no TTY to answer.
- **Fix applied:** run installs with `CI=1` (`CI=1 pnpm install`) in agent/non-interactive
  contexts; interactive human runs are unaffected.
- **Template change needed:** add a gotcha to `docs/phase-1-root-tooling.md` (and any guide
  step that re-runs `pnpm install` after config changes): agents should prefix `CI=1`.
  Consider noting it in the `/implement` command doc itself since it applies to every phase.

### 5. Version-drift snapshot at execution time (for the next `/update`)

Observed on npm, 2026-07-05 — no action taken (locked versions respected), recorded so
`/update` can re-evaluate deliberately:

- `turbo` latest is **2.10.3**; PHILOSOPHY locks 2.9 → pinned `2.9.18` (newest 2.9.x).
- `lefthook` has a **2.x major** (2.1.9); guide range `^1.7.0` resolved 1.13.6.
- `typescript` has a **6.x major** (6.0.3); guide range `^5.6.0` kept.
- `prettier` resolved 3.9.x within `^3.3.0`.
- mise-resolved toolchain: node 24.18.0 · pnpm 11.9.0 · python 3.13.14 · uv 0.11.26;
  `packageManager` pinned `pnpm@11.9.0`.

### 6. Lefthook hook globs don't cover `.mjs`/`.cjs`

- **Symptom:** `scripts/bootstrap.mjs` was committed without prettier or ESLint ever running
  on it — the pre-commit globs are `*.{ts,tsx,js,jsx,...}`, which match neither `.mjs` nor
  `.cjs`, yet the repo's own scripts (`bootstrap.mjs`, `new-product.mjs`, `figma-tokens.mjs`)
  and the root `eslint.config.mjs` are `.mjs` files.
- **Fix applied:** widened both `lefthook.yml` globs to include `mjs,cjs` and formatted the
  files that had slipped through. **Follow-on gap this exposed:** the shared flat config
  defines no runtime globals, so Node-context files fail `no-undef` on `console`/`module` —
  fixed by adding the `globals` package to `@platform/config` and a config block giving
  `**/*.{mjs,cjs}` + `scripts/**` node globals.
- **Template change needed:** in `docs/phase-1-root-tooling.md` Step 9 widen the globs to
  `*.{ts,tsx,js,jsx,mjs,cjs}`; in Step 7b add the `globals` devDep + node-globals block to
  the ESLint flat config skeleton.

### 7. Guide assumes POSIX; run happened on Windows — worked with minor adaptations

- The guide's own ⚠️ ("assume POSIX, adjust on Windows") was sufficient warning; nothing
  broke that was Windows-specific beyond finding 4. Git Bash handled all verification
  commands as written. `lefthook` is not on bare PATH in non-interactive shells (it's a
  workspace devDep) — invoke as `pnpm lefthook …` in agent contexts.
- **Template change needed:** optionally note `pnpm lefthook run pre-push` (instead of bare
  `lefthook run pre-push`) in the DoD 8 verification snippet — works everywhere, POSIX
  included.

---

## Phase 2 — design system & Figma (`docs/phase-2-design-system.md`) — run 2026-07-05

### 1. ✅ HEADLINE RESOLVED: NativeWind v4 ↔ Expo SDK 56 WORKS — no fallback needed

- **Outcome of the phase's one empirical open question:** nativewind `4.2.6` +
  react-native-css-interop `0.2.6` on expo `56.0.14` / RN `0.85.3` / React `19.2.3`
  (New Arch, Hermes v1). Evidence: `expo export --platform web` emits a SPA whose CSS
  carries the semantic-token utilities (`hsl(var(--primary))`, `--background` blocks), and
  `expo export --platform android` compiles the full NativeWind transform to a Hermes
  `.hbc` bundle. SDK 54 safe-harbor NOT exercised.
- **Template change needed:** mark the outcome ✅ RESOLVED in the guide's Open questions and
  in the PHILOSOPHY.md frontend bullet (the "unverified pairing" caveat can cite this run).

### 2. `tsconfig` extends strings don't match the Phase-1 exports map

- **Symptom:** `tsc` failed with `File '@platform/config/tsconfig/expo.json' not found`
  (and, misleadingly, a wall of lib errors from a default-config fallback run).
- **Root cause:** TS resolves non-relative `extends` through the package's `exports` map;
  Phase 1 exports the subpath `./tsconfig/expo` (extensionless), but Phase 2 skeletons
  extend `@platform/config/tsconfig/expo.json`.
- **Fix applied:** all consumers extend `@platform/config/tsconfig/expo` (extensionless).
- **Template change needed:** align the guide's tsconfig skeletons (ui/core/app) with the
  Phase-1 exports subpaths, or add `.json` passthrough entries to the exports map.

### 3. `@/` alias inside the source-consumed `packages/ui` breaks every downstream consumer

- **Symptom:** the app's `tsc` (and Metro at bundle time) failed on `@/lib/utils` etc. —
  the alias only exists in `packages/ui`'s own tsconfig, not in consumers' programs.
- **Root cause:** rn-reusables' `@/` convention assumes components are copied INTO the app
  (where `@/` maps to the app root); `@platform/ui` is consumed AS SOURCE from another
  package, so package-internal imports must be RELATIVE.
- **Fix applied:** converted all internal imports to relative; dropped the tsconfig `paths`
  and the Storybook `@` alias (both now unnecessary).
- **Template change needed:** guide step (a) should author components with relative imports
  and delete the "map `@/` in tsconfig + mirror in Storybook/Jest" note.

### 4. `className` prop types need `nativewind-env.d.ts` — in BOTH packages/ui and the app

- **Symptom:** `Property 'className' does not exist` on every RN component.
- **Fix applied:** `/// <reference types="nativewind/types" />` env files in
  `packages/ui/src/` and `products/_template/app/` (the global augmentation does not travel
  across program boundaries).
- **Template change needed:** add both files to the guide's Files lists.

### 5. `"*"` peers don't materialize for standalone typecheck — explicit devDeps required

- **Symptom:** `packages/ui`/`core` `tsc` failed (`Cannot find type definition file for
'expo'`, missing react/react-native) — pnpm 11 (hoisted) did not install the `"*"` peers.
- **Fix applied:** SDK-56-pinned devDeps in both packages (expo 56.0.14, react 19.2.3,
  react-native 0.85.3, nativewind 4.2.6, @types/react ~19.2.0, …) — same versions the app
  anchors, so pnpm dedupes. jest-expo needs expo resolvable from the package anyway.
- **Template change needed:** add these devDeps to the guide's package.json skeletons.

### 6. Phase-2 toolchain needs `allowBuilds: esbuild` (the Phase-1 lefthook pattern repeats)

- **Symptom:** `ERR_PNPM_IGNORED_BUILDS: esbuild` on the Storybook/Vite install.
- **Fix applied:** `esbuild: true` in `pnpm-workspace.yaml` `allowBuilds`.
- **Template change needed:** guide step (c) should add the entry (Phase-1 guide's comment
  even predicted it).

### 7. Guide's `preview.tsx` violates `react-hooks/rules-of-hooks`; CJS tool configs fail the shared lint

- **Symptom:** pre-commit blocked: `useEffect` inside the lowercase `withTheme` decorator;
  `module`/`require` no-undef + `no-require-imports` in tailwind/postcss configs.
- **Fix applied:** hook logic hoisted into a proper `ThemeGlobals` component; shared eslint
  node-context block widened to `**/*.config.js` with commonjs globals + `require()` allowed.
- **Template change needed:** fix the preview.tsx skeleton; fold the eslint block into the
  Phase-1 step-7b skeleton.

### 8. Storybook workbench NEEDS a tailwind.config.js in packages/ui (guide contradiction)

- **Symptom:** the mandated PostCSS pipeline emits zero utilities without content globs.
- **Root cause:** "packages/ui has NO tailwind config of its own" (an app-consumption rule)
  collides with the workbench's Tailwind-v3 pipeline requirement.
- **Fix applied:** workbench-only `tailwind.config.js` (+ `postcss.config.js`), clearly
  commented as never consumed by app builds.
- **Template change needed:** guide step (c) should ship both files and scope the "no
  tailwind config" rule to app consumption.

### 9. `withNativeWind` hard-errors without `require("nativewind/preset")` in the app tailwind config

- **Symptom:** `expo export` failed: "Tailwind CSS has not been configured with the
  NativeWind preset".
- **Fix applied:** `presets: [require("nativewind/preset"), require("@platform/config/tailwind-preset")]`
  in the app (and workbench) tailwind configs.
- **Template change needed:** add to the guide's tailwind.config.js skeletons + gotchas.

### 10. `@platform/ui` exports map must pass through `./package.json`

- **Symptom:** `expo export` failed: `ERR_PACKAGE_PATH_NOT_EXPORTED` from the guide's own
  cross-package content glob (`require.resolve("@platform/ui/package.json")`).
- **Fix applied:** `"./package.json": "./package.json"` in the exports map.
- **Template change needed:** add to the step-(a) package.json skeleton.

### 11. Token pipeline: stock `css/variables` cannot regenerate global.css

- **Symptom/root cause:** SD's stock format would clobber the `@tailwind` directives and
  can only emit ONE selector block per file (`:root` + `.dark:root` needed).
- **Fix applied:** custom `css/tailwind-globals` format co-generating the FULL global.css;
  outputs are byte-identical to the committed files (verified idempotent + drift-free);
  `@tokens-studio/sd-transforms` not needed for the plain DTCG fixture (no `{alias}` refs);
  SD name-collision warning silenced (same semantic names in both modes is by design).
- **Template change needed:** replace the `css/variables` skeleton in guide step (e).

### 12. Code Connect CLI realities

- No bare `parse` command — it is `figma connect parse`; `include` must ALSO cover the
  component SOURCE files or every import resolution warns; the rn-reusables CLI (`add`)
  prompts interactively for components.json (unusable non-TTY → guide's hand-author
  fallback used). `@rn-primitives/*` now 1.5.2 (pinned what's current at adoption, per the
  guide's own rule; its 1.4.x references are stale).
- **Template change needed:** fix the command in step (d) verification + widen the include
  glob in the figma.config.json skeleton.

### 13. RNTL 14: `/extend-expect` subpath REMOVED; `test-renderer` peer required

- **Symptom:** jest failed to run: cannot find `@testing-library/react-native/extend-expect`.
- **Fix applied:** setup imports the package root; added `test-renderer` 1.2.0 (React 19
  replacement for deprecated react-test-renderer — RNTL 14 peer). jest 29.7.0 pinned
  (jest-expo 56 is jest-29-based). The guide's async-API warning was accurate.
- **Template change needed:** update the jest.setup.ts skeleton + devDep list in step (i).

### 14. SDK-pairing corrections + version-drift snapshot (2026-07-05, for `/update`)

- `@react-native-async-storage/async-storage` SDK 56 pairing is **2.2.0** (the guide's
  3.1.x reference is npm-latest, not the SDK pairing). `react-native-reanimated` must pin
  EXACT `4.3.1` (`~4.3.1` resolved 4.3.2 and `expo install --check` flagged it).
- Locked lines respected against newer majors: expo latest **57.0.2** (locked 56 →
  56.0.14), storybook **10.4.6** (locked 9 → 9.1.20), tailwindcss **4.3.2** (locked v3 →
  3.4.19), tailwind-merge **3.6.0** (locked 2.6.x → 2.6.1), vite latest **8.1.3** but the
  SB framework peers cap at ^7 → 7.3.6. Other resolutions: @tanstack/\* 5.101.2, zustand
  5.0.14, style-dictionary 5.5.0, @figma/code-connect 1.4.8, RNTL 14.0.1, jest-expo 56.0.5.

### 15. Phase 2 prerequisites claim `.github/workflows/` skeletons exist — Phase 1 never creates them

- Harmless here (Phase 2 only produces data those workflows would consume; wiring is
  Phase 8), but the prerequisite is unsatisfiable as written.
- **Template change needed:** drop the bullet from the guide's Prerequisites (or move
  workflow-skeleton creation into a phase that actually runs before 2).

### 16. `test: jest` fails test-less workspaces; `.turbo/` missing from .gitignore

- **Symptom:** the pre-push affected gate failed: `@platform/core#test` exits 1 ("no tests
  found") — the guide's core/app package.json skeletons ship `"test": "jest"` with no test
  files; separately, `.turbo/` appeared untracked once turbo ran.
- **Fix applied:** `jest --passWithNoTests` in core + app scripts; `.turbo/` gitignored.
- **Template change needed:** guide steps (g)/(h) skeletons should use `--passWithNoTests`
  until each workspace grows tests; Phase-1 `.gitignore` skeleton should include `.turbo/`.

---

## Phase 3 — FastAPI backend (`docs/phase-3-api.md`) — run 2026-07-05

### 1. slowapi's SlowAPIMiddleware is silently BROKEN on current FastAPI — default limits never fire

- **Symptom:** Verify 4 failed — 120 requests to `/v1/hello` returned 120×200, no 429.
- **Root cause:** `SlowAPIMiddleware` resolves the endpoint via `route.matches(scope)`;
  FastAPI 0.139 wraps routers in new `_IncludedRouter` internals where `matches()` returns
  `Match.NONE` for EVERY route (even `/healthz`) → `_should_exempt` exempts every request.
- **Fix applied:** thin `RateLimitMiddleware` in `security.py` calling
  `limiter._check_request_limit(request, None, True)` directly, plus `key_style="url"` on the
  Limiter (the check then keys on the request path and needs no endpoint function); 429
  rendered as problem+json inline. Verified: exactly 100×200 → 429s, problem+json body.
- **Template change needed:** replace the `SlowAPIMiddleware` skeleton in guide Steps 10/16;
  keep the ⚠️ that slowapi is alpha and re-verify against FastAPI on every `/update`.

### 2. `sa_column=Column(...)` in the shared SQLModel mixin breaks on the SECOND table

- **Symptom:** first pytest run: `Column object 'created_at' already assigned to Table 'item'`.
- **Root cause:** a concrete `Column` object binds to exactly ONE Table; the guide's
  `UUIDModel` skeleton shares the same Column instances across all inheriting models.
- **Fix applied:** mixin-safe `sa_type=DateTime(timezone=True)` + `sa_column_kwargs=
{"server_default": func.now(), ...}` — a fresh Column per subclass.
- **Template change needed:** fix the Step-6 `base.py` skeleton.

### 3. `template_api.main` reads Settings at IMPORT time — tests need env before any import

- **Symptom:** conftest import failed: Settings missing `database_url` — `main.py` builds
  `app = create_app()` at module level (uvicorn entrypoint) and `install_security()` reads
  Settings immediately.
- **Fix applied:** `tests/__init__.py` exports `DATABASE_URL`/`DATABASE_MIGRATION_URL`
  defaults (runs before conftest's imports since tests is a package).
- **Template change needed:** add to the Step-23 conftest skeleton (or note it in Step 16).

### 4. starlette 1.3 + httpx 0.28: TestClient types collapse to Unknown under pyright strict

- **Symptom:** ~40 pyright errors in tests — every `TestClient.get/post` "partially unknown".
- **Root cause:** starlette 1.3 deprecates plain `httpx` in `starlette.testclient`
  ("install httpx2 instead") and its annotations reference `httpx._types` aliases that
  httpx 0.28 removed.
- **Fix applied:** `httpx2` added to the dev group (starlette prefers it:
  `import httpx2 as httpx`); runtime `httpx` stays (send_push per PHILOSOPHY).
- **Template change needed:** add `httpx2` to the Step-1 dev-deps skeleton.

### 5. Guide skeletons violate the guide's own lint/type config

- ruff **B008**: `svc: ItemService = Depends()` / `session: Session = Depends(...)` defaults
  → converted to `Annotated[X, Depends()]` (FastAPI-recommended form).
- ruff **UP046** (0.15): `class Page(BaseModel, Generic[T])` → PEP 695 `class Page[T](BaseModel)`.
- pyright strict: decorated inner handlers flag `reportUnusedFunction` (targeted ignores);
  `__tablename__` literal vs `declared_attr` (ignore); bare `Item.id` in
  `order_by`/comparisons types as UUID → wrap with SQLModel's `col()`;
  `session.execute()` is _deprecated by SQLModel_ in favor of the very `exec()` that can't
  type `delete()` (fastapi/sqlmodel#909) → deliberate `reportDeprecated` ignore +
  `cast(CursorResult[Any], ...)` for `.rowcount`.
- **Template change needed:** fold all of the above into the Step 5/7/12–16 skeletons.

### 6. `export_openapi.py` path depth: guide's own ⚠️ was right — `parents[3]` is wrong

- `src/template_api/export_openapi.py` → `parents[2]` is `api/`; `parents[3]` would be
  `products/_template/`. Used `parents[2]`; Phase 4's `../api/openapi.json` read holds.
- **Template change needed:** fix Step 17 and drop the ⚠️.

### 7. lefthook ruff hooks: `$(dirname {staged_files} | head -1)/..` derives the WRONG project root

- **Symptom:** first `.py` commit failed both ruff hooks — for staged files under
  `src/template_api/`, the expression points uv at `src/`.
- **Fix applied:** walk UP from the first staged file to the nearest `pyproject.toml`
  (works at any depth; still first-project-wins for multi-project commits, same as before).
- **Template change needed:** fix the `lefthook.yml` skeleton in Phase 1 Step 9.

### 8. Alembic: `version_path_separator` is deprecated

- `alembic.ini` now wants `path_separator = os` (deprecation warning on every run with the
  guide's key). Fix applied; update the Step-19 skeleton.

### 9. Version drift snapshot (2026-07-05, for `/update`) — pinned current per the guide's markers

- fastapi **0.139.0** (guide skeleton said 0.124.4 "current 2025-12"), sqlmodel **0.0.39**
  (guide 0.0.27), slowapi **0.1.10**, uuid-utils **0.16.2**, pytest **9.1.1**,
  ruff **0.15.20**, pytest-asyncio 1.4.0 (matched), uvicorn 0.50.0, alembic 1.18.5.
- **polyfactory is now 3.x** (3.3.0; guide said "current 2.x line") — the
  `ModelFactory[DTO]` usage works unchanged on 3.x.

---

## Phase 2+3 deep audit (`/implement 2-and-3` verification pass) — run 2026-07-05

### 1. Static Storybook build was BROKEN at runtime — build success ≠ stories render

- **Symptom:** `storybook build` exits 0, `index.json` valid, CSS carries tokens — but
  loading any story in the STATIC build died with `ReferenceError: exports is not defined`.
  Dev mode was fine (Vite's dep optimizer converts CJS on the fly), which is why Phase 2's
  original verification missed it.
- **Root cause:** nativewind eagerly re-exports `verifyInstallation` from its pure-CJS
  doctor chain (`nativewind/dist/doctor.js` → `react-native-css-interop/dist/doctor*.js`);
  the RNW framework's transform pipeline leaves those files unconverted in the production
  rollup pass. `build.commonjsOptions.transformMixedEsModules` does NOT fix it.
- **Fix applied:** targeted Vite plugin in `.storybook/main.ts` (`fix-css-interop-doctor-cjs`)
  that ESM-wraps exactly those files (exports object + hoisted require→import shim + aliased
  export bindings). Verified: stories render in static build AND dev.
- **Template change needed:** ship the plugin in the guide's `main.ts` skeleton; add a
  verification step that LOADS a story from `storybook-static` (not just builds it) — this is
  also what the Phase 8 VR runner would have tripped over.

### 2. Brand toolbar could NOT re-theme components — overrides must be a NativeWind vars() overlay

- **Symptom:** with `brand:demo`, `--primary` on `:root` showed the demo purple but the
  Button still rendered the default navy.
- **Root cause:** css-interop resolves semantic tokens through its own `vars()` CONTEXT (the
  ThemeProvider's style), not the CSS cascade — the guide's `root.style.setProperty`
  decorator never reaches component styles. (The theme toolbar only worked because it goes
  through `colorScheme` + the provider's `vars()`.)
- **Fix applied:** decorator wraps stories in a `<View style={vars(BRAND_VARS[brand])}>`
  overlay — the exact mechanism a product uses to rebrand (Key ruling #8/#11). Verified live:
  brand:demo → button `rgb(124,59,237)` = hsl(262 83% 58%).
- **Template change needed:** fix the guide's `preview.tsx` skeleton (keep the DOM
  class/property sync only as a plain-CSS convenience).

### 3. Storybook `globals` URL separator is `;`, not `,`

- `iframe.html?...&globals=theme:dark,brand:demo` silently applies NEITHER; the working form
  is `globals=theme:dark;brand:demo` (single globals also work). The Phase 2 guide's VR note
  and Phase 8's planned sweep use the comma form — fix both.

### 4. `main.py` middleware add-order inverted the guide's intended onion (Starlette is LIFO)

- **Symptom:** 429 responses carried NO X-Request-Id, NO security headers (and no CORS
  header for browser clients); CORS preflights had no X-Request-Id.
- **Root cause:** the guide's skeleton adds request_id FIRST — under Starlette's LIFO
  `add_middleware` that makes it INNERMOST, so responses short-circuited by outer layers
  (rate limiter, CORS preflight) bypass it. The guide's comment states the right intent
  ("request_id outermost") with the wrong code order.
- **Fix applied:** add order reversed (rate limit → security → request_id last). Verified:
  429 now carries X-Request-Id + security headers + CORS allow-origin + problem+json;
  preflight carries X-Request-Id.
- **Template change needed:** fix the Step-16 skeleton + its comment to explain LIFO.

### 5. Verification items the original runs skipped — now closed

- **`/add-component` end-to-end (Phase 2 Verification):** executed for `badge` — owned
  primitive + 4 per-variant stories + Code Connect map (5 maps parse) + `index.ts` export;
  static build now carries 22 stories.
- **Interactive theming (Phase 2 DoD 5/11):** verified in a real browser — Storybook
  light/dark/brand matrix and the app's Settings dark toggle on the exported SPA
  (wrapper `rgb(255,255,255)` ↔ `rgb(9,9,11)`, primary re-themes). Expo Go on a physical
  device remains the only unverified surface.
- **`tasks.py` (Phase 3 Step 18):** `prune-stale-tokens` runs ("pruned 0 stale push
  tokens"); bare invocation prints usage and exits 2.

---

## Phase 1 deep audit (`/implement 1` verification pass) — run 2026-07-05

### 1. The shared Prettier config was never WIRED — hooks formatted with defaults for three phases

- **Symptom:** `prettier --find-config-path <any file>` → "can not find configure file".
  Every pre-commit format since Phase 1 ran with Prettier DEFAULTS (printWidth 80, no
  tailwind class sorting) — `@platform/config/prettier` (width 100 +
  prettier-plugin-tailwindcss) existed but nothing consumed it.
- **Root cause:** the guide's Step 7c says "downstream `.prettierrc` files extend this via
  `@platform/config/prettier`" but never creates ANY consumer — root included. Exact sibling
  of Phase-1 finding #1 (missing root eslint.config.mjs): the root workspace is a consumer
  too, and the lefthook jobs run from the repo root.
- **Fix applied:** root `package.json` `"prettier": "@platform/config/prettier"`; repo-wide
  `pnpm format` sweep (53 files) to the intended style. Generated theme.ts/global.css
  verified byte-identical under the token pipeline after the sweep.
- **Template change needed:** guide Step 7c must add the root wiring (and DoD-check that
  `prettier --find-config-path` resolves).

### 2. Prettier was mangling COMMITTED GENERATED artifacts — a Phase-4 drift-check time bomb

- **Symptom:** regenerating `openapi.json` from Python produced a **1480-line diff** against
  the committed file — the pre-commit prettier hook had reformatted it at commit time
  (json.dumps form → prettier form). Phase 4's contract check (regen + `git diff
--exit-code`) would have failed on its first run. `pnpm-lock.yaml` was also being
  quote-churned by the hook's yml glob.
- **Fix applied:** root `.prettierignore` covering `pnpm-lock.yaml`,
  `products/*/api/openapi.json`, and `products/*/api-client/src/` (the future generated
  client); committed `openapi.json` restored to the generator-exact bytes. (Prettier 3
  respects `.gitignore` for build outputs, so only committed generated files need entries.)
- **Template change needed:** add `.prettierignore` to guide Step 8 (alongside .gitignore);
  Phase 3/4 guides should note their generated outputs are prettier-exempt.

### 3. `@platform/config` lint task — the guide's own open-questions item was never done

- "Wire a real `lint` script into @platform/config … from Phase 2 onward" (Step 7 open
  question). Added `"lint": "eslint ."`; `turbo run lint` now runs 12 tasks (was 11,
  config silently skipped).
- **Template change needed:** put the script in the Step-7a skeleton instead of an open
  question.

### 4. Everything else verified present-and-correct

- mise.toml / .npmrc / pnpm-workspace.yaml / turbo.json / tsconfig.base.json / .gitignore
  match the skeletons byte-for-byte-in-substance (plus the previously recorded deviations:
  turbo pinned 2.9.18, packageManager pnpm@11.9.0, tailwind-preset.cjs, allowBuilds
  lefthook+esbuild, widened hook globs, fixed ruff project derivation, root
  eslint.config.mjs). All 10 DoD items re-pass: toolchain pins (node 24.18.0 / pnpm 11.9.0 /
  python 3.13.14 / uv 0.11.26), single lockfile + lefthook shims, turbo lint exit 0,
  6 config files resolvable, strict base OK, env boundary OK (per-env tracked), pre-commit +
  pre-push firing on every commit/push this session, hooks auto-installed via prepare only,
  `pnpm bootstrap` → "✅ bootstrap complete".

---

## Phase 4 (`/implement 4` — typegen & API-backed home) — run 2026-07-05

### 1. operationId mismatch between Phase 3's output and Phase 4's expected hook names

- **Symptom:** the guide's Step 9 consumes `listItemsInfiniteOptions` "off FastAPI
  operationId `list_items`" — but Phase 3 never set operationIds, so the committed contract
  carried FastAPI defaults (`list_items_v1_items_get`), which would have generated
  `listItemsV1ItemsGetInfiniteOptions` (path noise in every client symbol, forever).
- **Root cause:** Phase 3's `main.py` skeleton lacks `generate_unique_id_function` — the
  FastAPI-documented pattern for generated clients. Phase 4's "confirmed" hook name silently
  assumes it.
- **Fix applied:** `FastAPI(..., generate_unique_id_function=_operation_id)` returning
  `route.name` (constraint: route function names unique across ALL routers) + regenerated
  `openapi.json`. Also aligned `export_openapi.py` to the Phase 4 skeleton
  (`ensure_ascii=False`, utf-8, absolute import, docstring).
- **Template change needed:** put `generate_unique_id_function` in the Phase 3 `main.py`
  skeleton; Phase 4 then needs no caveat.

### 2. hey-api 0.99.0 (refreshed pin from the guide's 0.98.2): two config deltas

- `output.format: "prettier"` is **deprecated** in 0.99 → `output.postProcess: ["prettier"]`.
- The generated barrel does **NOT** export the shared `client` or the TanStack options by
  default — Step 8's `import { client } from "@platform/template-api-client"` fails as
  written. Fix: `exportFromIndex: true` on BOTH the `@hey-api/client-fetch` and
  `@tanstack/react-query` plugin entries.
- **Template change needed:** fold both into the guide's Step 4 config skeleton.

### 3. Generated `infiniteQueryOptions` emits NO `initialPageParam`/`getNextPageParam` — and null crashes it

- The guide anticipated the absence ("supply it here off next_cursor") — confirmed real on
  0.99.0: the generated queryFn maps `pageParam` → `query.cursor` but pagination boundaries
  are the consumer's job.
- **Trap:** the generated queryFn branches on `typeof pageParam === "object"` — and
  `typeof null === "object"`, so `initialPageParam: null` crashes at runtime. Used `""`
  (the api's `decode_cursor` treats empty as first page); `getNextPageParam` returns
  `next_cursor ?? null` (null = stop).
- **Template change needed:** guide Step 9 should pin `initialPageParam: ""` + the null trap.

### 4. Verify #3 ("web renders API data") is unreachable as written — items are auth-guarded, auth lands in Phase 6

- **Symptom:** `/v1/items` requires a Bearer token (Phase 3, correct); the Phase 4 app has
  no login. The naive verification shows the error state, not items.
- **Fix applied (verification-only, nothing committed):** minted an HS256 dev token against
  the api's `.env` fallback secret (sub = seed owner), ran a local header-injecting proxy
  :8001→:8000, pointed the app at it via gitignored `app/.env.local`. Full pipeline verified
  honestly: list + cursor page 2 on scroll, empty state (ownerless token), error state
  (api down), and instant cached paint on reload with the api unreachable.
- **Template change needed:** Phase 4 guide should document this dev-token verification path
  (or reorder auth before typegen).

### 5. Smaller confirmations & fixes

- **No pnpm catalog exists** (guide's ⚠️ REVIEW): pinned exact inline — `@tanstack/react-query`
  5.101.2 everywhere, `@hey-api/openapi-ts` 0.99.0 exact.
- **Phase 2 gap:** `_layout.tsx` imported `@tanstack/react-query-persist-client` without the
  app declaring it (worked via hoisting); the app also lacked `@tanstack/react-query`
  itself. Both now declared in `app/package.json`.
- **`env.ts` field naming:** guide Step 8 reads `env.EXPO_PUBLIC_API_URL`; Phase 2's actual
  export is `env.apiUrl` — adapted (env.ts is referenced-not-rewritten per the guide).
- **Root turbo.json needed zero changes** — Phase 3 already landed the `openapi` task with
  the mandated Python inputs globs. Resolved the guide's ⚠️ OPEN by standardizing
  `api-client#build` on the package-level `turbo.json` ONLY (PHILOSOPHY's own wording).
- **Windows transient:** openapi-ts's output clean (`rmSync` on `src/`) can hit a spurious
  EPERM if anything holds a handle on the dir; retry succeeds.
- **api-client tsconfig:** guide omits it but the `typecheck` script needs one — added
  extending `@platform/config/tsconfig/expo` (same as core). Template change: add to Step 3.

---

## Phase 5 (`/implement 5` — Electron desktop) — run 2026-07-05

### 1. electron-builder's pnpm node-module collector dies with EMFILE on this workspace — patched to fall through to traversal

- **Symptom:** `electron-builder --dir` → "Node module collector process exited with code
  4294963230"; underlying: `pnpm list --prod --json --depth Infinity` (the collector's exact
  command) fails with **EMFILE: too many open files** walking every hoisted package.json in
  the workspace root store (Windows; reproducible on pnpm 11.9.0 AND latest 11.10.0).
- **Root cause:** two stacked defects. (a) pnpm's `list` exhausts FDs on very large hoisted
  node_modules; (b) app-builder-lib's collector loop — whose own docstring says a failed
  collection should fall through to the `PM.TRAVERSAL` approach — lets a collector
  **exception** escape the loop instead.
- **Fix applied:** bumped electron-builder **26.15.3 → 26.15.6** (patch-bump sanctioned by the
  guide's commit-4 language; 26.15.6 also ships the directly-relevant "bundle a workspace
  sub-package's production dependencies when the PM resolves to the workspace root" fix) +
  committed **`pnpm patch`** (`patches/app-builder-lib@26.15.6.patch`, wired via
  `patchedDependencies`) wrapping the collection call in try/catch → warn + continue. The
  TRAVERSAL collector then resolves the tree correctly: verified `app.asar` contains compiled
  main+preload, the SPA renderer, AND `node_modules/electron-updater` + deps (342 files).
- **Template change needed:** guide step 1 should pin **26.15.6** and ship the patch (or
  reference the upstream issue for removal once fixed).

### 2. pnpm `allowBuilds` needs `electron` + `electron-winstaller` — and the entry must predate first install

- The guide's `pnpm install` step misses that pnpm 11 blocks postinstall scripts: `electron`
  (binary download) and `electron-winstaller` (7-Zip fetch; electron-builder dep) both need
  `allowBuilds` entries. Also: adding the entry AFTER the package was first installed does
  not retro-run the script — `pnpm rebuild electron` (or a fresh install) is required; the
  symptom is `electron.exe` missing under `node_modules/electron/dist`.
- **Template change needed:** guide step 1 should add both allowBuilds lines + the rebuild note.

### 3. Phase 1 `.gitignore` bug: inline comment made the `renderer/` pattern a no-op

- `renderer/            # electron copies…` is ONE literal pattern in gitignore syntax
  (inline comments are not a thing) — so `renderer/` was never ignored; masked until Phase 5
  first created one, then ~200 copied files appeared to git AND prettier (`format:check`
  failed on the copied bundle). Fixed by moving the comment to its own line.
- **Template change needed:** Phase 1 guide `.gitignore` skeleton must not use inline comments.

### 4. Phase 2 gap: `.env.staging` / `.env.production` never created — and export-env semantics

- The gospel tree mandates all three committed per-env files; only `.env.development`
  existed. Consequence discovered here: `expo export` runs with **NODE_ENV=production**, so
  with no `.env.production` the bundle silently baked `env.ts`'s hard-coded localhost
  fallback. Created both files with clearly-marked placeholders (fly naming
  `example-template-api-stg|prod.fly.dev`, TODO supabase values).
- **Corollary for the desktop dev loop:** a plain `turbo run build --filter=*desktop` now
  bakes the production placeholder URL — for local full-stack desktop testing, override with
  gitignored `app/.env.local` (+ see #5). Real values are selected per platform (Vercel/EAS
  env) later; exact ownership of these files should move into the Phase 2 guide.
- **Metro cache gotcha:** EXPO_PUBLIC_* env changes do NOT bust Metro's transform cache —
  re-export with `expo export --clear` (turbo `--force` is not enough; the cache is Metro's).

### 5. Verify #1/#3 need the Phase-4 auth caveat again

- Items populate in the desktop window only through the dev-token path (`/v1/items` is
  auth-guarded until Phase 6): gitignored `.env.local` → header-injecting proxy. Verified
  that way (list renders in the window + in the packed exe via persisted cache). The guide's
  "if the API is up, the items list populates" carries the same unstated dependency as
  Phase 4's Verify #3.

### 6. Confirmations (guide facts verified true)

- **CORS origin (gotcha #9) exact:** in-window probe → `location.origin === "app://-"`,
  cross-origin fetch to the API returns readable 200 with Phase 3's default allowlist entry.
- **typescript 5.9.3** pin matches the repo's resolved version (⚠️ REVIEW cleared).
- Privileged-scheme registration before ready: `window.isSecureContext === true` under
  `app://-/`; SPA fallback proven by full-document load of `app://-/settings`; dark toggle
  re-themes with byte-identical token values to web (`rgb(9,9,11)` / `rgb(250,250,250)`);
  updater double-gate silent in packed exe (no repo configured, no dialog, no crash).
- Windows quirk (verification harness, not template): killing `electron .` via the pnpm/.bin
  shim leaves electron.exe orphans holding the CDP port — kill the exe, not the shim.

---

## Phase 4+5 deep audit (`/implement 4-and-5` verification pass) — run 2026-07-05

### 1. Desktop workspace had no `lint` script — and the shared ESLint config would have choked on its artifacts

- **Symptom:** `turbo run lint` ran 16 tasks with desktop silently absent; `main.ts`/
  `preload.ts`/`copy-renderer.mjs` had zero lint coverage. Exact sibling of the Phase-1-audit
  `@platform/config` finding: the guide's package.json skeleton omits `lint`, and every
  non-generated workspace in the repo lints by convention.
- Adding the script alone would have failed: the shared flat-config ignores lacked the
  desktop artifact dirs (`**/build/**`, `**/renderer/**`, `**/release/**`) — `eslint .` in
  desktop would lint the compiled main, the copied SPA bundle, and the packed output.
- **Fix applied:** ignores added to `@platform/config` eslint config + `"lint": "eslint ."`
  in desktop; `turbo run lint` now 17 tasks, desktop clean.
- **Template change needed:** Phase 5 guide step 1 skeleton should carry the lint script;
  Phase 1 guide's eslint skeleton should ship the three artifact ignores.

### 2. Everything else in Phases 4 and 5 verified present-and-correct

- **Phase 4:** all 13 DoD items re-pass — `@hey-api/client-fetch` absent from the entire
  lockfile (plugin string only); openapi-ts 0.99.0 the sole hey-api dep, exact, dev;
  generated `src/` committed (18 files) + prettier-exempt; graph re-verified
  (`api#openapi → api-client#build → app#build`, edges from real deps); drift check exit 0;
  regen byte-stable; no `verify_probe` remnants; operationIds unique.
- **Phase 5:** all DoD items re-pass — skeletons byte-faithful (documented deltas: builder
  26.15.6 + collector patch); `turbo run pack` graph resolves the full
  `openapi → client → export:web → desktop#build → desktop#pack` chain; updater gating,
  CORS `app://-`, SPA fallback, sandbox/bridge all evidenced live earlier this run.
- **Cosmetic, deliberately not changed:** electron-builder warns `author is missed in the
package.json` (guide skeleton has no author field; harmless for --dir and irrelevant until
  real publishing); `build-resources/` referenced but absent → default Electron icon
  (deferred to the Phase 7 brand-asset pipeline per the guide's ⚠️ REVIEW).

## Phase 6 — Supabase auth, route guards & storage

### 1. `useSession()` skeleton infinite-loops under zustand v5 (object-returning selector)

- **Symptom:** the guide's `useSessionStore((s) => ({ session, user, loading }))` selector
  returns a fresh object every call; zustand v5's `useSyncExternalStore` compares snapshots
  with `Object.is` → always unequal → "getSnapshot should be cached" / infinite re-render.
- **Root cause:** guide skeleton predates (or ignores) the zustand v5 selector-stability
  contract; v4's deprecated shallow-equality overload is gone.
- **Fix applied:** wrapped the selector in `useShallow` from `zustand/react/shallow`.
- **Template change needed:** Phase 6 guide step 4 skeleton should import and use
  `useShallow` in `useSession()`.

### 2. `core/auth` must be `.tsx`, not `.ts`

- **Symptom:** guide names the file `auth.ts` but the `AuthProvider` skeleton returns JSX
  (`<>{children}</>`) — tsc refuses JSX in `.ts`.
- **Fix applied:** created `packages/core/src/auth.tsx`.
- **Template change needed:** guide step 4 file path → `auth.tsx`.

### 3. `[inbucket]` config section no longer exists — CLI 2.109 renamed it `[local_smtp]`

- **Symptom:** guide's config.toml skeleton carries `[inbucket]`; the CLI-2.109-generated
  default has `[local_smtp]` (Mailpit) on the same port 54324, plus new sections
  (`[db.migrations]`, `[storage.s3_protocol]`, `[edge_runtime]`, `[experimental.pgdelta]`).
- **Fix applied:** followed the guide's own resolved-note procedure — `supabase init` to
  materialize the installed CLI's default, then applied ONLY the deltas (project_id
  `example-template`, auth site/redirect URLs incl. `app://-/`, ES256 signing comment,
  analytics off). `major_version = 17` confirmed as the generated default.
- **Template change needed:** Phase 6 guide step 1 skeleton should stop naming `[inbucket]`
  and defer to init-then-delta (it already says to); generator note: `[edge_runtime]`
  `inspector_port = 8083` is NOT portIndex-offset by the `+100·portIndex` rule — Phase 7
  must handle it (or disable edge_runtime) for stack coexistence.

### 4. Guide's `.env.development` API URL carries `/v1` — would double the prefix

- **Symptom:** guide step 11 shows `EXPO_PUBLIC_API_URL=http://localhost:8000/v1`, but the
  generated client's operation paths already include `/v1` (FastAPI routers use
  `prefix="/v1"`) → requests would hit `/v1/v1/items`.
- **Fix applied:** origin-only `http://localhost:8000` (matches Phase 4's working setup and
  the committed `.env.staging`/`.env.production` shape).
- **Template change needed:** guide step 11 skeleton drop the `/v1`.

### 5. `ImagePicker.MediaTypeOptions` is deprecated in expo-image-picker ~56

- **Symptom:** guide step 10 uses `mediaTypes: ImagePicker.MediaTypeOptions.Images`; the
  installed SDK-56 picker deprecates the enum in favor of `MediaType` arrays.
- **Fix applied:** `mediaTypes: ["images"]`. Version resolved via `expo install` →
  `expo-image-picker ~56.0.19` (kept the expo-conventional tilde range consistent with every
  other `expo-*` dep, rather than the pin-exact stance — these are SDK-coupled, not pre-1.0).
- **Template change needed:** guide step 10 skeleton use the array form.

### 6. Phase 3 reconciliation (guide's ⚠️ OPEN): api auth was already authoritative

- Phase 3 had already shipped `auth.py` (JWKS primary + HS256 genuine fallback,
  `audience="authenticated"`), `settings.py` auth fields, `routers/me.py` (mounted), and
  `schemas/user.MeRead` — all matching Key ruling #5, with `_decode` deriving the JWKS URL
  from `supabase_url` (equivalent to the guide's `jwks_url` property). Kept Phase 3's shape;
  added the missing V7 coverage: missing-aud 401, ES256/JWKS-path unit (stubbed JWK set —
  matches what the live local stack emits), and `/v1/me` HTTP round-trips (valid HS256 token,
  bad token → problem+json 401, missing header → 401). Verified LIVE against the real local
  stack: the CLI 2.109 access token header is `alg: ES256`, and `/v1/me` 200s with **no**
  `SUPABASE_JWT_SECRET` set — pure JWKS verification, exactly as ruled.

### 7. Prettier doesn't see the CLI-generated NESTED supabase/.gitignore

- **Symptom:** `format:check` failed on `products/_template/supabase/.temp/...` runtime
  artifacts even though git ignores them — `supabase init` writes a nested
  `supabase/.gitignore`, but Prettier 3 only reads the ROOT `.gitignore`/`.prettierignore`.
- **Fix applied:** added `products/*/supabase/.temp/` + `products/*/supabase/.branches/` to
  the root `.prettierignore`.
- **Template change needed:** Phase 1 guide's `.prettierignore` skeleton (or Phase 6) should
  carry the supabase runtime-artifact entries.

### 8. Button children: guide skeletons wrap labels in `<Text>` — loses variant text color

- **Symptom:** the owned Phase 2 `Button` styles STRING children with `buttonTextVariants`
  (per-variant contrast, e.g. `text-primary-foreground` on `bg-primary`); the guide's
  `<Button><Text>…</Text></Button>` bypasses that and renders default `text-foreground`.
- **Fix applied:** plain-string children in login/signup/avatar-uploader (this is the
  guide's own ⚠️ OPEN "reconcile against what Phase 2 actually exported").
- **Template change needed:** Phase 6 guide steps 7/10 skeletons use string children.

## Phase 6 deep audit (post-implementation verification pass)

### 1. Two DoD items were satisfied in spirit but not to the letter — now literal

- **Symptom:** the DoD names the route-guard hooks "`useProtectedRoute` / `useRequireAuth`"
  but the step-4 skeleton only defines `useProtectedRoute` (built as such); and the DoD says
  "`settings.py` carries the JWKS URL (derived from `supabase_url`)" with an explicit
  per-env override field in the step-12 skeleton (`supabase_jwks_url` + `jwks_url`
  property), while Phase 3's kept shape derived the URL inline in `auth.py` with no
  override capability.
- **Fix applied:** added `useRequireAuth()` to `core/auth.tsx` (screen-level guard variant:
  redirects a single protected screen, returns the session; same loading gate) + export;
  added `supabase_jwks_url` field + resolved `jwks_url` property to `settings.py`,
  `auth.py._decode` now consumes it, `SUPABASE_JWKS_URL=` documented in `.env.example`,
  plus a hermetic derivation/override/none test (pydantic-settings reads api/.env for
  UNSET fields — tests must pass every auth field explicitly). Live JWKS path re-proven
  after the refactor (fresh password-grant ES256 token → /v1/me 200; bad token → 401).
- **Template change needed:** Phase 6 guide — either add a `useRequireAuth` skeleton to
  step 4 or drop the name from the DoD line, so the checklist and skeleton agree.

### 2. Everything else verified present-and-correct

- **DoD sweep:** config.toml (`project_id example-template`, `[auth] enabled`, site/redirect
  URLs incl. `app://-/`, email confirmations off, analytics off, major_version 17,
  portIndex-0 ports); stack up with bucket + 3 RLS policies live; core exports complete;
  platform-adapter/pkce/detectSessionInUrl-web-only client; store + actions + guards;
  uploadAvatar/signedAvatarUrl; product-local screens; thin routes; provider order;
  settings demo; committed .env.development (origin-only API URL); protected /v1/me.
- **Gotchas:** all 10 applied (JWKS-primary proven with NO HS256 secret set; audience
  enforced + tested; supabase-js used only for auth/storage; loading gates; bucket policy;
  offset ports; publishable anon key; web-only URL detection; cache-bust proven live;
  `app://-/` in redirect allowlist).
- **Fidelity deltas (all deliberate + documented in the Phase 6 section):** useShallow,
  auth.tsx extension, string Button children, MediaType array, origin-only API URL,
  init-then-delta config.toml.
- **Gates:** the full build graph re-proven — exported web bundle AND desktop renderer
  copy contain the Phase 6 login code; typegen drift clean; turbo typecheck/test/lint
  17/17; pytest 14/14; pyright strict 0; format clean; no checkout-dir/username leaks in
  tracked files; api/.env untracked; exactly the four intended env files tracked.
- **Prerequisite claim checked:** `scripts/bootstrap.mjs` is data-driven (scans
  `products/*/supabase/config.toml`) — it now automatically starts the Phase 6 stack; no
  change needed.

## Phase 7 — generator & stamping demo (`docs/phase-7-generator.md`) — run 2026-07-05

### 1. `products/_template` self-references silently survive the whole-word replace — AND the verify grep

- **Symptom:** 5 template files reference their own path (`products/_template/api`, …) in
  comments (`.env.example`, `export_openapi.py`, `copy-renderer.mjs`). The guide's three
  replacers can't touch them: `_` is a word character, so `\btemplate\b` cannot match
  inside `_template` — and the headline check `git grep -iw template` uses the same word
  rules, so the stale paths would pass verification undetected.
- **Root cause:** guide replacer list only covers kebab/Pascal/snake variants of the bare
  token; the underscore-prefixed directory name is a fourth variant it never considers.
- **Fix applied:** added a fourth, first-ordered replacer
  `/products\/_template\b/g → products/<name>` in `buildReplacers()`; verified zero
  `_template` occurrences in the stamped tree with a dedicated grep.
- **Template change needed:** add the replacer (and a `_template`-specific grep to the
  Verification section) to the Phase 7 guide.

### 2. `uv.lock` MUST be token-rewritten — `.lock` is missing from the guide's `TEXT_EXT`

- **Symptom:** `uv.lock` carries the project name (`name = "template-api"`, the lock's
  root-package entry). With the guide's `TEXT_EXT` it is classified binary and copied
  verbatim, so the stamped api's lock names a package (`template-api`) that its renamed
  `pyproject.toml` (`demo-api`) no longer declares — `uv sync --frozen`/`uv run` fail.
- **Fix applied:** added `.lock` (plus `.sql` for migrations and `.mako` for the alembic
  template) to `TEXT_EXT`. Verified `uv.lock:870 name = "demo-api"` after stamping and
  that demo's `uv run` works (openapi export builds).
- **Template change needed:** guide's `TEXT_EXT` skeleton needs `.lock`, `.sql`, `.mako`.

### 3. The guide's 5-entry SKIP set copies secrets and caches from a live working tree

- **Symptom:** `SKIP = {node_modules, .venv, dist, .expo, release}` was written for a
  pristine checkout. A real post-Phase-6 tree also contains `api/.env` (**local secrets** —
  the guide even asserts ".env … never exist[s] in the template to copy", which is false
  after Phase 3 local dev), `.turbo/` caches, desktop `build/` + `renderer/` outputs,
  `__pycache__`/`.pytest_cache`/`.ruff_cache`, supabase `.temp`/`.branches` CLI state, and
  stray `openapi-ts-error-*.log` files — all of which would be stamped into the new product.
- **Fix applied:** extended SKIP with the artifact/cache/CLI-state names, exact-name
  skips for `.env` / `.env.local` (committed `.env.example`/`.env.development` etc. still
  travel), and a `*.log` skip. Demo tree verified free of all of them.
- **Template change needed:** guide SKIP set + the "never exists" gotcha need updating.

### 4. `[edge_runtime] inspector_port = 8083` sits OUTSIDE the 543xx block (guide's own ⚠️ TO CONFIRM)

- **Symptom:** the port-offset regex `\b543\d\d\b` covers every Supabase port except the
  edge-runtime inspector (8083).
- **Verified reality:** `supabase start` does NOT bind 8083 on the host (only
  `functions serve --inspect` does), so simultaneous stacks don't collide today — but two
  products could never debug functions at the same time.
- **Fix applied:** generator additionally shifts `inspector_port` by `+10·portIndex`
  (demo = 8093; can never collide with API ports `8000+10j` since 83 ≢ 0 mod 10).
- **Template change needed:** add the inspector_port rule to the guide's `applyPorts`.

### 5. Placeholder-convention + shape drift against Phase 2's real `tokens.config.json`

- **Symptom:** the guide's `addFigmaMode` writes `"TODO-FIGMA-MODE-ID"`, but Phase 2's
  committed `tokens.config.json` already uses `TODO-MODE-ID-<NAME>` — and had **already
  pre-registered the `demo` mode** (so the DoD item "gains a demo entry" was satisfied
  before the generator ran; the generator's add is a no-op for demo, exercised as
  idempotent).
- **Fix applied:** generator writes `TODO-MODE-ID-<NAME-UPPERCASE>` to match the Phase 2
  convention; checklist text updated accordingly. `figma.config.json` confirmed untouched.
- **Template change needed:** align the guide's placeholder string with Phase 2's, and
  note that Phase 2 seeds the demo mode.

### 6. Stamp-safe comments: literal ports in template prose go stale in stamped products

- **Symptom:** `config.toml`'s header ("Ports are base values for portIndex 0…") and
  `.env.development`'s comment ("API on 8000, Supabase local on 54321…") carry literal
  base numbers that the port pass (which only rewrites `host:port` values) leaves behind —
  a stamped demo would read "API on 8000" while actually using 8010.
- **Fix applied:** reworded both template comments to formula form ("API 8000+10i /
  Supabase 54321+100i, from product.json's portIndex") so they stay true after stamping.
- **Template change needed:** guide should warn that template prose must never hardcode
  base ports.

### 7. Stamping EXPOSED a latent template defect: `openapi` export required the gitignored `api/.env`

- **Symptom:** first `turbo run build --affected` after stamping failed on
  `@platform/demo-api#openapi` — `Settings()` demands `database_url`/`database_migration_url`,
  which the template's export only ever got from the gitignored `api/.env` on the dev
  machine (a clean CI checkout would fail identically for the TEMPLATE — Phases 3–6 never
  noticed because `.env` was always present locally and turbo then cached the task).
- **Root cause:** `export_openapi.py` imports `template_api.main` at module level, which
  builds the app (and reads Settings) at import time; schema export needs no DB at all.
- **Fix applied:** made the export hermetic — `os.environ.setdefault(...)` inert
  placeholder URLs, `main` imported inside `main()` after they exist (same pattern as
  `tests/__init__.py`; the engine is NullPool and never connects). Byte-identical
  openapi.json confirmed (`git diff` clean), lint/pyright clean, then demo re-stamped.
- **Template change needed:** Phase 3/4 guides — the `export_openapi.py` skeleton must set
  placeholder env before importing `main` (this also unblocks Phase 8's CI drift check).

### 8. HEADLINE: whole-word replace CORRUPTS supabase config.toml — TOML keys are literally named `template`

- **Symptom:** the stamped demo stack refused to start:
  `'auth.mfa.phone' has invalid keys: demo · 'auth.sms' has invalid keys: demo`. The
  CLI-generated config carries `template = "Your code is …"` keys (the SMS/phone-MFA OTP
  message template) in `[auth.sms]` and `[auth.mfa.phone]` — the whole-word `\btemplate\b`
  pass rewrote the config-SCHEMA key itself, producing an invalid config. The guide's
  "whole-word only" gotcha claims whole-word matching is safe; empirically it is not.
- **Fix applied (both layers):** (a) generator: `.toml` contents get the `template =` key
  masked before the token pass and restored after (`rewriteContents`); (b) template:
  removed the two default `template = …` lines from disabled sections (CLI falls back to
  its defaults) — with the keys present, the stamped product would carry
  `template = …` lines and the headline verify `git grep -iw template products/demo`
  could never be empty. Demo re-stamped; stack starts; grep literally empty.
- **Template change needed:** Phase 7 guide — add the TOML-key guard to the skeleton and
  note the config.toml key collision in the whole-word gotcha; Phase 6 guide — drop the
  `template` OTP keys in the init-then-delta step.

### 9. Deep-audit probe: the hyphenated-name + portIndex-chaining paths WORK (previously untested)

- **What:** the demo stamp only exercises a single-word name and portIndex 1. The audit
  stamped a throwaway `audit-probe` product and verified the harder paths end-to-end:
  `nextPortIndex` read demo's product.json → **portIndex 2** (API 8020, Supabase block
  54521, edge inspector 8103); kebab→snake module dir `src/audit_probe_api/`;
  pyproject + rewritten uv.lock agree on `audit-probe-api` and **`uv run` actually syncs
  and executes** the module (openapi export ran); Pascal variant `AuditProbe`
  (electron productName, pyproject description); `TODO-MODE-ID-AUDIT-PROBE` mode
  registered; zero token leaks. Probe then fully removed (dir + tokens.config.json +
  pnpm-lock.yaml reverted; tree clean).
- **Template change needed:** none — recorded so the guide's verification section can
  optionally add a hyphenated-name probe.

### 10. Smaller confirmations & environment notes

- **`expo install expo-splash-screen` "fails" by design with a TS config** — it installs
  the package, then exits 1 because it "Cannot automatically write to dynamic config at:
  app.config.ts"; the plugin entry must be added by hand. Not a real failure.
- **sharp 0.35.3** installed as the rasterizer (pinned exact per the guide) — no
  `allowBuilds` entry needed (prebuilt `@img/sharp-*` binaries ship as optional deps).
- **`app.config.ts` had NO asset wiring before this phase** — icon/adaptive-icon/
  favicon/splash-plugin were all added here (the guide's size matrix is now literally
  "the exact set wired into app.config.ts").
- **`git grep -iw template products/demo` only scans TRACKED files** — a freshly stamped
  (untracked) tree trivially passes. Use `git grep --untracked` (or stage first) for the
  verify to mean anything.
- **Expo dev-server port is NOT offset** (both apps default `--port 8081`) — per spec
  (port math covers API + Supabase only); Expo auto-detects a busy port and offers 8082,
  so simultaneous dev servers still work interactively.
- **English-word collateral accepted per ruling #7:** whole-word replace turns prose like
  ".env.example's "secrets template"" into "secrets demo" and config.toml's "# Template
  for sending OTP" into "# Demo for sending OTP" — harmless, documented tradeoff.

## Phase 8 — CI/CD, observability, push, realtime, E2E & docs (`docs/phase-8-cicd-obs.md`) — run 2026-07-06

### 1. The guide's `packages/core` skeletons import `@platform/<product>-api-client` — impossible in a shared, unstamped package

- **Symptom:** step (a)'s `api.ts` and step (b)'s `notifications.ts` skeletons import from
  `"@platform/<product>-api-client"` — but `packages/core` is shared and NEVER stamped, so
  the `<product>` token can't be rewritten there. Worse, the Phase 4-built `core/api.ts`
  hard-imported `@platform/template-api-client`, meaning demo's stamped `_layout.tsx` was
  silently configuring TEMPLATE's client singleton while demo's hooks used demo's own
  unconfigured client — a real latent bug shipped in Phases 4–7.
- **Root cause:** the guide treats core as if it were product-scoped for these two files.
- **Fix applied:** parameterised core — `configureApiClient(client)` takes the product's
  generated client (structural `GeneratedApiClient` type, no workspace dep), and
  `registerForPushNotifications(post)` takes the generated SDK call. Each product's
  `_layout.tsx`/(tabs) layout passes its own. Core's dependency on
  `@platform/template-api-client` REMOVED.
- **Template change needed:** rewrite both skeletons to the injected form; add a Phase 4
  correction (core must never import a product's api-client).

### 2. hey-api query keys are OBJECT-shaped — `invalidateQueries({queryKey: ["items"]})` never matches

- The guide's own ⚠️ ("confirm the generated key prefix") pays off: keys are
  `[{ _id: "listItems", baseUrl, ... }]`, so the skeleton's bare `[resource]` filter can't
  match. Fix: `subscribeAndInvalidate` takes a `keys` map (resource → generated key fn
  results, e.g. `{ items: [listItemsQueryKey()] }`); partial deep matching also catches the
  `_infinite` variant. Unmapped resources still fall back to `[resource]`.

### 3. Server-side Realtime broadcast path CONFIRMED live

- `POST {SUPABASE_URL}/realtime/v1/api/broadcast` with `apikey` + service-role bearer →
  **202 Accepted** against the local stack (CLI current as of 2026-07), and the E2E proves
  end-to-end delivery (second client repaints via broadcast → invalidate → refetch). The
  guide's ⚠️ REVIEW can be marked resolved for local; re-verify once a hosted project exists.

### 4. `expo export` FORCES production env — and Metro's cache doesn't key on EXPO_PUBLIC_*

- **Symptom:** E2E bundle called `https://TODO-SUPABASE-PROJECT-PROD.supabase.co` ("Failed
  to fetch" at signup) even with `NODE_ENV=development` passed to the export.
- **Root cause (two layers):** (1) `expo export` pins NODE_ENV=production → `.env.production`
  placeholders win; (2) even with correct direct env vars, Metro's transform cache replays
  the previous bundle BYTE-IDENTICAL because `EXPO_PUBLIC_*` values aren't in the cache key.
- **Fix applied:** global-setup parses `.env.development` and injects its `EXPO_PUBLIC_*` as
  DIRECT env vars (they beat dotenv) AND exports with `--clear`.
- Also: `getenv.boolish("CI")` in expo-cli THROWS on an empty-string `CI=` — sanitize before
  spawning expo from tooling.

### 5. E2E process orchestration (guide ⚠️ OPEN) resolved via Playwright multi-webServer

- Both long-lived processes (serve -s dist, uvicorn) are `webServer` entries — Playwright
  owns readiness + teardown; global-setup only prepares state (supabase up-check, migrate,
  seed, export). NOTE: `npx serve dist -l 8081` from the guide 404s deep links — the SPA
  fallback flag `-s` is required for `/signup`.

### 6. E2E assertions must respect the persisted-cache design

- A second context seeded from `storageState` rehydrates the FIRST client's persisted query
  cache and (fresh enough) won't refetch on mount — asserting the pre-broadcast item is
  visible there FAILS by design. The realtime proof is the post-broadcast item appearing
  (which also pulls the older item in via the refetch).

### 7. Ports hardcoded in template E2E files would cross products after stamping

- First demo re-stamp shipped `playwright.config.ts`/`global-setup.ts` pointing at 8000/54321
  (template's stack). Fixed by deriving ports from `product.json` (`8000+10i`, `54321+100i`)
  at config load — the "ports come from product.json" doctrine applies to EVERY file the
  generator copies, not just env/config files.

### 8. Workflow skeleton fixes (all load-bearing)

- `with: { token: ${{ secrets.EXPO_TOKEN }} }` inside a YAML FLOW mapping is invalid YAML —
  quote the expression.
- `electron-release.yml` uses `env.MAC_CSC_LINK` in a step `if` without defining it at
  job/workflow level (actionlint error; empty context in the expression) — hoist to job env.
  The bash tag-parse step also needs `shell: bash` (windows runner defaults to pwsh).
- `e2e-nightly.yml` as skeleton'd cannot run: the web E2E needs the Supabase CLI
  (`supabase/setup-cli@v1`), a `uv sync`, and the api's env vars (no `.env` in CI).
- Guide references a `storybook:build` script; Phase 2's committed name is `build-storybook`
  (also baked into `packages/ui/CLAUDE.md`) — workflows call the established name.

### 9. `eas.json` + `vercel.json` are in PHILOSOPHY's tree but NO phase creates them

- Phase 2 built the app shell without them; Phase 8's workflows need eas.json's
  `staging`/`production` channels and Vercel needs the SPA rewrite. Created here (eas-cli
  > = 16, appVersionSource remote; channels staging/production EXACT). Template change:
  > either add to Phase 2's app-shell step or to Phase 8's file list explicitly.

### 10. Assorted smaller deltas

- `logging.getLevelName(str)` (guide skeleton) fails pyright strict (deprecated str→int
  direction) — use `logging.getLevelNamesMapping()[level.upper()]` (3.11+).
- structlog + sentry-sdk[fastapi] were ALREADY Phase 3 deps (PHILOSOPHY's dep list) — the
  guide's `uv add` is a no-op; likewise most of the push loop (model/schema/service/router,
  RLS migration, per user+device shape per the gospel) shipped in Phase 3. Phase 8's real
  additions: tests, core helper, app wiring, tasks alignment.
- Guide's prune default is 90 days but Phase 3 shipped `prune_stale(older_than_days=60)` —
  aligned to 90; the phase guides disagree, gospel is silent (still ⚠️ OPEN per product).
- Guide's tasks CLI name `prune-push-tokens` ≠ Phase 3's `prune-stale-tokens` — renamed to
  the Phase 8 DoD contract.
- Maestro skeleton taps "Log in" but the Phase 6 login button reads "Sign in"; auth inputs
  use PLACEHOLDERS not labels → Playwright `getByPlaceholder`, not `getByLabel`.
- `@sentry/cli` postinstall (sentry-cli binary) needs a pnpm 11 `allowBuilds` entry.
- VR baselines: committed from win32 with platform suffix stripped from snapshot names;
  ubuntu CI may still diff on font rendering — regenerate baselines on the CI platform when
  wiring real CI (documented in packages/ui/playwright.config.ts).
- Verify #1 ("push branch → CI green") can't fire from a feature branch: ci.yml triggers on
  `pull_request` + push to `main` only, and this session's rules forbid opening a PR — ran
  the CI steps locally (full gate + drift check) as the evidence instead. Verify #7 (fly
  machine run) blocked on placeholder infra; the task module was run locally against the
  real local DB and emits the exact documented JSON line.
