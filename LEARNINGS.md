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
