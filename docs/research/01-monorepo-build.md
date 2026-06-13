# Monorepo & build tooling — accuracy review (June 2026)

## Summary

**21 claims checked** across PLAN.md (Decision Sheet, ruling #6, "Config essentials") and `docs/phase-1-root-tooling.md` (Steps 1–9).

Issue counts: **❌ 4 / ⚠️ 5 / ❓ 1** (remainder ✅ correct & current).

**Headline findings:**

1. **pnpm is pinned to 10, but pnpm 11 has shipped and is current (11.6.0 as of 13 Jun 2026).** pnpm 11 (released 28 Apr 2026) is a hard schema break for this plan: **`.npmrc` is now auth/registry-only**, and *all* other settings — including `node-linker`, `prefer-frozen-lockfile`, `only-built-dependencies` — must move into **`pnpm-workspace.yaml`** as **camelCase keys** (or be silently ignored, no warning). The plan's entire `.npmrc` (Step 2) is the pnpm-10 layout. This is the single biggest correctness issue.
2. **`only-built-dependencies` was removed in pnpm 11** and replaced by an **`allowBuilds`** map. The plan's `.npmrc` comment recommending `only-built-dependencies[]=…` is a removed API.
3. **Node 22 is no longer the current LTS** — Node **24 'Krypton'** went Active LTS in Oct 2025 and is the recommended runtime for new projects in 2026. Node 22 is in **Maintenance LTS** (EOL Apr 2027). Pinning Node 22 still *works*, but it's the prior LTS, and **pnpm 11 itself requires Node ≥ 22.13**.
4. The Turborepo 2.9 `tasks` graph, `--affected`, `inputs`/`outputs`, package-level `turbo.json`, and `dependsOn: ["^…"]` semantics are all **correct & current**. Minor: the `$schema` URL `turbo.build/schema.json` still resolves but the canonical host is now `turborepo.dev`.

**Overall verdict:** The Turborepo, mise, and lefthook portions are sound. The **pnpm portion is materially outdated** — it documents pnpm 10 while pnpm 11 (a breaking config-relocation release) is the live version. Either explicitly pin pnpm 10 (still maintained, 10.x in the 11.5.x era) **or** adopt pnpm 11 and relocate settings to `pnpm-workspace.yaml`. The current half-state (pin "10", but the world has moved to 11) is the risk.

---

## Findings

### 1. pnpm version pin (`pnpm 10`)
- **Location:** PLAN.md Decision Sheet ("mise pins … pnpm 10"); `phase-1` Step 1 `mise.toml` `pnpm = "10"`; `package.json` `"packageManager": "pnpm@10.0.0"`, `"pnpm": ">=10"`.
- **Claim:** pnpm 10 is the current/appropriate version.
- **Status:** ⚠️ outdated-but-works.
- **Finding:** pnpm **11.0** released **28 Apr 2026**; latest is **11.6.0** (published ~12 Jun 2026). pnpm 10.x is still maintained but is the prior major. pnpm 10 *works*, but the plan should be a conscious pin, not an accident of being written pre-11. Note pnpm 11 is pure ESM and requires Node ≥ 22.13.
- **Recommended change:** Decide explicitly. If staying on 10, say "pnpm 10 (current is 11; deferred because …)" and pin an exact `mise.toml`/`packageManager` patch (e.g. `pnpm@10.x.y`). If adopting 11, apply findings 2–4 below and bump all three pins to `11`.
- **Source(s):** https://pnpm.io/blog/releases/11.0 ; https://www.npmjs.com/package/pnpm?activeTab=versions ; https://www.infoq.com/news/2026/04/pnpm-11-rc-release/

### 2. `.npmrc` holds `node-linker=hoisted` (and other settings)
- **Location:** PLAN.md ruling #6 + Directory tree (`.npmrc # node-linker=hoisted`); `phase-1` Step 2 `.npmrc`.
- **Claim:** `node-linker=hoisted` (plus `prefer-frozen-lockfile`, `only-built-dependencies`) live in `.npmrc`.
- **Status:** ❌ wrong-or-removed **under pnpm 11** (✅ correct under pnpm 10).
- **Finding:** In **pnpm 11, `.npmrc` is read for auth/registry only.** Every other setting — `node-linker`, `hoist-pattern`, `save-exact`, `prefer-frozen-lockfile`, etc. — must move to **`pnpm-workspace.yaml`** (or `~/.config/pnpm/config.yaml`) as **camelCase** keys, e.g. `nodeLinker: hoisted`, `preferFrozenLockfile: true`. pnpm 11 **silently ignores** the old `.npmrc` settings (no deprecation warning — community-confirmed footgun). The official `codemod run pnpm-v10-to-v11` performs the split automatically.
- **Recommended change (if on pnpm 11):** Move the linker into `pnpm-workspace.yaml`:
  ```yaml
  # pnpm-workspace.yaml
  nodeLinker: hoisted
  preferFrozenLockfile: true
  packages: [ "packages/*", "products/*/app", … ]
  ```
  Keep `.npmrc` only if you have registry/auth lines; otherwise drop it. **BUT** note the EAS/`.npmrc`-committed rationale (finding 9) — verify EAS still keys off `.npmrc` vs `pnpm-workspace.yaml`. If staying on pnpm 10, the plan is correct as-is.
- **Source(s):** https://pnpm.io/migration ; https://pnpm.io/settings ; https://github.com/pnpm/pnpm/issues/11536 ; https://github.com/orgs/pnpm/discussions/11377

### 3. `only-built-dependencies[]` allowlist in `.npmrc`
- **Location:** `phase-1` Step 2 `.npmrc` comment ("Example … only-built-dependencies[]=esbuild"); Step 2 "Why" + OPEN flag.
- **Claim:** Build-script allowlisting uses `only-built-dependencies`.
- **Status:** ❌ removed in pnpm 11.
- **Finding:** pnpm 11 **removed** `onlyBuiltDependencies`, `onlyBuiltDependenciesFile`, `neverBuiltDependencies`, `ignoredBuiltDependencies`, and `ignoreDepScripts`. They are replaced by a single **`allowBuilds`** map (package-name-pattern → boolean) in `pnpm-workspace.yaml`. (pnpm 10 still blocks build scripts by default and used `only-built-dependencies` — so the claim is correct on 10, wrong on 11.)
- **Recommended change:** On pnpm 11, document `allowBuilds` instead, e.g.
  ```yaml
  allowBuilds:
    esbuild: true
  ```
- **Source(s):** https://pnpm.io/migration ; https://pnpm.io/settings

### 4. `prefer-frozen-lockfile=true` in `.npmrc`
- **Location:** `phase-1` Step 2 `.npmrc`; gotchas ("prefer-frozen-lockfile means a package.json dep change … will fail install in CI").
- **Claim:** `prefer-frozen-lockfile` is set via `.npmrc`.
- **Status:** ⚠️ key valid, location wrong on pnpm 11.
- **Finding:** The setting still exists (camelCase `preferFrozenLockfile`); on pnpm 11 it must live in `pnpm-workspace.yaml`, not `.npmrc` (same mechanism as finding 2). Also note pnpm auto-enables frozen-lockfile in CI already, and **pnpm 11 newly fails CI installs when the lockfile was written by a newer pnpm major** — so keeping the pnpm major aligned across dev/CI matters more now.
- **Recommended change:** Move to `pnpm-workspace.yaml` as `preferFrozenLockfile: true` if on pnpm 11; otherwise fine.
- **Source(s):** https://pnpm.io/settings ; https://pnpm.io/continuous-integration ; https://pnpm.io/blog/releases/11.0

### 5. Node 22 pin
- **Location:** PLAN.md Decision Sheet ("Node 22"); ruling sheet "Node 22"; `mise.toml` `node = "22"`; `package.json` `"node": ">=22"`; `tsconfig` posture.
- **Claim:** Node 22 is the right LTS to pin.
- **Status:** ⚠️ outdated-but-works.
- **Finding:** Node **24 'Krypton'** has been **Active LTS since Oct 2025** and is the recommended runtime for new 2026 projects (supported through ~Apr 2028). **Node 22 entered Maintenance LTS in Oct 2025** (EOL Apr 2027) — it receives only critical fixes after ~Oct 2026. A greenfield scaffold started mid-2026 would normally pin Node 24. Node 22 still works (and Expo SDK / RN tooling support it), but it's the prior LTS with ~10 months of full support left.
- **Recommended change:** Prefer `node = "24"` for a new scaffold, or document why 22 (e.g. a transitive tool not yet 24-ready). If on pnpm 11, Node must be ≥ 22.13 regardless.
- **Source(s):** https://nodejs.org/en/blog/release/v24.11.0 ; https://endoflife.date/nodejs ; https://github.com/nodejs/node/releases/tag/v24.16.0 ; https://www.pkgpulse.com/guides/nodejs-24-lts-upgrade-from-node-22-2026

### 6. `node-linker=hoisted` is the documented happy path for pnpm + Expo/Metro
- **Location:** PLAN.md ruling #6; `phase-1` Step 2 "Why" + gotchas; Decision Sheet.
- **Claim:** hoisted linker is still the documented happy path for pnpm + Expo; never set `disableHierarchicalLookups`; configure `watchFolders`/`nodeModulesPaths` in metro.
- **Status:** ✅ correct & current (mechanism), with a config-location caveat.
- **Finding:** Still true in 2026. pnpm's default linker is `isolated` (symlinked virtual store); React-Native/Metro tooling expects a flat `node_modules`, so **`hoisted` remains the recommended fix**, and the Expo monorepo guide still documents `watchFolders` + `resolver.nodeModulesPaths`. The only thing that changed is **where you write the setting** (see finding 2: `nodeLinker: hoisted` in `pnpm-workspace.yaml` on pnpm 11). The metro.config.js shape in PLAN ("Config essentials") is correct and current. The "never `disableHierarchicalLookups`" guidance is sound.
- **Recommended change:** Keep the mechanism; only relocate the setting if on pnpm 11.
- **Source(s):** https://docs.expo.dev/guides/monorepos/ ; https://pnpm.io/settings ; https://www.callstack.com/blog/react-native-monorepo-with-pnpm-workspaces

### 7. `pnpm prepare` → `lefthook install` hook installation
- **Location:** PLAN.md Phase 1 row ("hooks install via pnpm prepare"); Decision Sheet Git-hooks; `phase-1` Step 4 `package.json` `"prepare": "lefthook install"`, Step 9, DoD 9.
- **Claim:** A root `"prepare": "lefthook install"` script auto-installs Lefthook hooks on `pnpm install`.
- **Status:** ✅ correct & current.
- **Finding:** This is still the standard pattern for npm-installed Lefthook: `npm/pnpm install lefthook` then `lefthook install`, with the `prepare` lifecycle script triggering it post-install. (The "remove the prepare script" advice circulating online applies specifically to *migrating off Husky*, not to this Lefthook-via-prepare pattern.) `stage_fixed: true` is a current, documented pre-commit option that re-stages auto-fixed files. Lefthook remains a maintained standalone binary in 2026.
- **Recommended change:** None. (Pin an exact `lefthook` version from the lockfile, as the guide already flags.)
- **Source(s):** https://lefthook.dev/install/ ; https://lefthook.dev/configuration/stage_fixed/ ; https://lefthook.dev/

### 8. Turborepo 2.9 — `tasks` key (not `pipeline`)
- **Location:** PLAN.md Decision Sheet + "Config essentials" (turbo.json 2.9 `tasks`); `phase-1` Step 5 `turbo.json`.
- **Claim:** Turborepo 2.9 uses the `tasks` key; `pipeline` is legacy.
- **Status:** ✅ correct & current.
- **Finding:** Confirmed — all Turborepo v2.x configs use `tasks`; the v1 `pipeline` key is deprecated/removed. Turborepo 2.9 shipped (Mar 2026); current line is 2.9.x (canaries up to 2.9.17 in early Jun 2026). 2.9 is "quality-focused," makes `turbo query` stable, and introduces **Future Flags + deprecations ahead of 3.0** (e.g. the `daemon` option and `--graph` raster/json formats are deprecated for 3.0). `npx @turbo/codemod migrate` is the upgrade path. None of the 3.0 deprecations touch the `tasks`/`inputs`/`outputs`/`dependsOn` surface the plan uses.
- **Recommended change:** None.
- **Source(s):** https://turborepo.dev/blog/2-9 ; https://turborepo.dev/docs/reference/configuration ; https://github.com/vercel/turborepo/releases

### 9. Turborepo `--affected`, `inputs`/`outputs`, `dependsOn ^`, package-level turbo.json
- **Location:** PLAN.md Decision Sheet (`--affected`), "Config essentials" (openapi inputs/outputs, package-level edges, `^openapi`/`^build`/`^export:web`), `phase-4` turbo task graph; `phase-1` Step 5 + gotchas.
- **Claim:** `--affected` flag exists; `inputs`/`outputs` arrays; `dependsOn: ["^build"]` means "this task depends on the same task in package dependencies"; package-level `turbo.json` can override per-package; directory globs in inputs/outputs expand to `dir/**`.
- **Status:** ✅ correct & current.
- **Finding:** All confirmed against the 2.9 configuration reference. `turbo run … --affected` is stable. Package-level (workspace) `turbo.json` overrides are supported. `^` denotes topological dependency on the same task across a package's dependencies. Directory globs (`dist` ≡ `dist/**`) behave as the plan assumes. The `dev: { cache: false, persistent: true }` shape is correct. The plan's note that affected-scoping needs a git base ref (`TURBO_SCM_BASE`/fetch depth in CI) is accurate.
- **Recommended change:** None.
- **Source(s):** https://turborepo.dev/docs/reference/configuration ; https://turborepo.dev/blog/2-9

### 10. `turbo.json` `$schema` URL
- **Location:** `phase-1` Step 5 `"$schema": "https://turbo.build/schema.json"`; `tsconfig`/prettier schema URLs.
- **Claim:** `https://turbo.build/schema.json` is the schema URL.
- **Status:** ⚠️ works, but not the canonical host.
- **Finding:** Turborepo's canonical docs/host is now **`turborepo.dev`**, and the project's own `turbo.json` uses `https://turborepo.dev/schema.json`. `turbo.build/schema.json` still resolves (redirect/alias), as does `turborepo.com/schema.json`, and a versioned `schema.<version>.json` form exists. Not breaking, just stale branding.
- **Recommended change:** Prefer `https://turborepo.dev/schema.json` (optionally the version-pinned variant).
- **Source(s):** https://github.com/vercel/turborepo/blob/main/turbo.json ; https://turborepo.dev/docs/reference/configuration ; https://github.com/vercel/turborepo/discussions/7466

### 11. `mise.toml` `[tools]` schema (node/pnpm/python/uv)
- **Location:** PLAN.md Decision Sheet + Directory tree; `phase-1` Step 1.
- **Claim:** `[tools] node="22" pnpm="10" python="3.13" uv="latest"` is valid mise.toml.
- **Status:** ✅ correct & current (schema), version values per findings 1 & 5.
- **Finding:** The `[tools]` table with string version specifiers (`"22"`, `"latest"`) is the correct, current mise schema; mise has built-in providers for node, pnpm, python, and uv, so pinning all four is supported. (Note: mise's UV_PYTHON export integrates with uv; the plan's per-product uv usage is compatible.) The schema is fine; only the *pinned values* (pnpm 10, node 22) are stale.
- **Recommended change:** Update version values per findings 1 & 5; schema is correct.
- **Source(s):** https://mise.jdx.dev/dev-tools/deps.html ; https://mise.jdx.dev/configuration/settings.html ; https://github.com/jdx/mise/blob/main/settings.toml

### 12. `mise.toml` `[settings] experimental = true` rationale
- **Location:** `phase-1` Step 1 `mise.toml` — `experimental = true` with comment "Reproducible installs: don't silently float to a newer minor."
- **Claim:** `experimental = true` is needed for reproducible installs / pinning behavior.
- **Status:** ❌ wrong rationale (the flag is real, the justification is incorrect).
- **Finding:** `experimental` is a valid mise setting, but it gates **experimental features** (e.g. hooks like `postinstall`, monorepo mode), **not** reproducibility of version pins. Version pinning is just the `[tools]` specifiers; it has nothing to do with `experimental`. The plan's `mise.toml` uses `[env] _.path = [...node_modules/.bin]`, which is **basic env-path support and does not require `experimental`**. So the flag as written is a no-op for the stated purpose. (Separately, mise is changing some defaults in the 2026.7.0 line, e.g. shell expansion becoming default — worth a glance, but unrelated to this claim.)
- **Recommended change:** Either drop `experimental = true` (nothing in this config needs it) or keep it only if you later add `[hooks]`, and fix the comment to say it enables experimental features (hooks/monorepo mode), not "reproducible installs."
- **Source(s):** https://mise.jdx.dev/configuration/settings.html ; https://mac.install.guide/mise/mise-configuration ; https://mise.jdx.dev/environments/

### 13. `mise-action` for CI
- **Location:** PLAN.md "Workflows" (`ci.yml` — mise-action → pnpm frozen install …); `phase-1` cross-ref.
- **Claim:** A `mise-action` provisions the toolchain in GitHub Actions.
- **Status:** ❓ unverifiable in this pass (assumed current).
- **Finding:** `jdx/mise-action` is the established GitHub Action for installing mise-managed tools and is widely used in 2026; I did not fetch its release page in this pass to confirm the exact current major (the action exists and is the documented CI path). No evidence it's deprecated. Flagged ❓ only because I did not pin its current version/version-syntax this round.
- **Recommended change:** Pin `jdx/mise-action@<current major>` in `ci.yml` (Phase 8) and confirm the version then.
- **Source(s):** https://mise.jdx.dev/ (CI/continuous-integration docs reference mise-action)

### 14. `pnpm-workspace.yaml` package globs
- **Location:** PLAN.md Directory tree + "Package management model"; `phase-1` Step 3.
- **Claim:** `packages:` list with `packages/*`, `products/*/app`, `…/desktop`, `…/api`, `…/api-client` is valid.
- **Status:** ✅ correct & current.
- **Finding:** The `packages:` key for workspace globs is correct and unchanged in pnpm 11. Listing the four product sub-workspaces explicitly (rather than `products/*`) is sound. **Caveat from finding 2:** under pnpm 11, this same file is now *also* where `nodeLinker`/`preferFrozenLockfile`/`allowBuilds` belong — so `pnpm-workspace.yaml` gains those keys alongside `packages:`.
- **Recommended change:** None to the `packages:` block; add the relocated settings if on pnpm 11.
- **Source(s):** https://pnpm.io/settings ; https://pnpm.io/migration

### 15. `packageManager: "pnpm@10.0.0"` field (EAS workspace-detection workaround)
- **Location:** PLAN.md "Workflows" (packageManager field = eas-cli workspace detection workaround); `phase-1` Step 4.
- **Claim:** The `packageManager` field is needed and set to `pnpm@10.0.0`.
- **Status:** ⚠️ field valid; version stale + should be exact.
- **Finding:** The `packageManager` field (Corepack convention, `name@x.y.z`) is correct and still used by tooling/CI to select the right pnpm. The value should track the actual pnpm major (10 vs 11 per finding 1) and be an **exact** version (Corepack expects a full semver; `10.0.0` is exact but likely behind the real lockfile patch). Keeping `packageManager` aligned with the installed pnpm major is *more* important under pnpm 11 because of the new "fail CI on newer-major lockfile" behavior (finding 4).
- **Recommended change:** Set to the exact pnpm version the lockfile resolves (e.g. `pnpm@10.x.y` or `pnpm@11.x.y`), matching `mise.toml`.
- **Source(s):** https://pnpm.io/installation ; https://pnpm.io/blog/releases/11.0

### 16. `@hey-api/openapi-ts` typegen pin (build-tooling-adjacent)
- **Location:** PLAN.md Decision Sheet + "Config essentials → Typegen"; `phase-4`.
- **Claim:** `@hey-api/openapi-ts` (pinned exact, pre-1.0) + client-fetch + TanStack Query plugin.
- **Status:** ❓ out-of-domain (flagged for the typegen reviewer).
- **Finding:** Versioning/API-surface of hey-api is outside the monorepo/build-tooling domain and belongs to the Phase-4 typegen review; not verified here. The *turbo wiring* around it (the `openapi` task `inputs`/`outputs`, `api-client#build` `dependsOn: ["^openapi","^build"]`) is in-domain and is correct (finding 9).
- **Recommended change:** Defer to the typegen accuracy review.
- **Source(s):** n/a (deferred).

---

## Resolved OPEN / TO CONFIRM (in-scope flags from phase-1)

- **OPEN (Step 1): "uv exact pin — PLAN says 'uv', mise uses `latest`."**
  Resolved (advisory): `uv = "latest"` is valid mise syntax and fine for dev; for reproducible CI/Docker, pin an exact uv in `mise.toml` once Phase 3's Dockerfile depends on it. mise's built-in uv provider supports both. Not a correctness bug. Source: https://mise.jdx.dev/dev-tools/deps.html

- **OPEN (Step 2): "pnpm 10 blocks dependency build scripts by default (`only-built-dependencies`); leave allowlist commented."**
  Resolved with correction: true on pnpm 10. **On pnpm 11 `only-built-dependencies` is removed → use the `allowBuilds` map in `pnpm-workspace.yaml`** (finding 3). Whichever major you pin, the allowlist key name differs. Source: https://pnpm.io/migration

- **OPEN (Step 4): "Confirm the exact 2.9.x turbo patch at install time."**
  Resolved: Turborepo 2.9 is shipped and current; pin the exact 2.9.x the lockfile resolves (2.9.x line is live as of Jun 2026, canaries to 2.9.17). The `tasks`-key schema is stable across 2.9.x. Source: https://github.com/vercel/turborepo/releases

- **OPEN (Step 5): "Confirm exact turbo 2.9.x schema URL/fields against the installed version."**
  Resolved: fields (`tasks`/`inputs`/`outputs`/`dependsOn`/`cache`/`persistent`/`ui`) are correct for 2.9; prefer `$schema: https://turborepo.dev/schema.json` (canonical host) — `turbo.build/schema.json` still works (finding 10). Source: https://turborepo.dev/docs/reference/configuration

- **OPEN (Step 6 / tsconfig): "extra strict flags conventional, not PLAN-mandated."**
  Out of strict scope for this domain (TS compiler config), but no monorepo/build-tooling conflict: `moduleResolution: "bundler"`, `noEmit`, `verbatimModuleSyntax` are all current and compatible with the Turborepo/pnpm setup. No action from a build-tooling standpoint.

- **OPEN (Step 9 / lefthook): "lefthook `^1.7.0` chosen; pin to lockfile."**
  Resolved: Lefthook is actively maintained in 2026; the `prepare`→`lefthook install` + `stage_fixed` pattern is current (finding 7). Pin the exact version the lockfile resolves. Source: https://lefthook.dev/

- **OPEN (multiple): "experimental = true in mise.toml."**
  Resolved with correction: the flag does **not** drive reproducible installs; it gates experimental features (hooks/monorepo). It's a no-op for this config — drop it or fix the comment (finding 12). Source: https://mise.jdx.dev/configuration/settings.html

---

## Sources

- https://pnpm.io/blog/releases/11.0
- https://pnpm.io/migration
- https://pnpm.io/settings
- https://pnpm.io/continuous-integration
- https://pnpm.io/installation
- https://www.npmjs.com/package/pnpm?activeTab=versions
- https://www.infoq.com/news/2026/04/pnpm-11-rc-release/
- https://github.com/pnpm/pnpm/issues/11536
- https://github.com/orgs/pnpm/discussions/11377
- https://docs.expo.dev/guides/monorepos/
- https://www.callstack.com/blog/react-native-monorepo-with-pnpm-workspaces
- https://turborepo.dev/blog/2-9
- https://turborepo.dev/docs/reference/configuration
- https://github.com/vercel/turborepo/releases
- https://github.com/vercel/turborepo/blob/main/turbo.json
- https://github.com/vercel/turborepo/discussions/7466
- https://nodejs.org/en/blog/release/v24.11.0
- https://endoflife.date/nodejs
- https://github.com/nodejs/node/releases/tag/v24.16.0
- https://www.pkgpulse.com/guides/nodejs-24-lts-upgrade-from-node-22-2026
- https://mise.jdx.dev/configuration/settings.html
- https://mise.jdx.dev/dev-tools/deps.html
- https://github.com/jdx/mise/blob/main/settings.toml
- https://mac.install.guide/mise/mise-configuration
- https://mise.jdx.dev/environments/
- https://lefthook.dev/
- https://lefthook.dev/install/
- https://lefthook.dev/configuration/stage_fixed/
