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
