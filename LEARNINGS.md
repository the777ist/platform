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
