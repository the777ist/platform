# CI/CD + infra — accuracy review (June 2026)

## Summary

**24 claims checked** across GitHub Actions, Fly.io, Vercel, Sentry, and EAS-in-CI.

- ✅ Correct / current: 14
- ⚠️ Outdated-but-works / needs-caveat: 8
- ❌ Wrong / will-break: 0
- ❓ Unverifiable from public sources: 2

**Headline:** The plan's two highest-stakes claims both hold up. The **Fly scheduled-machine primitive is correct**: `fly machine run --schedule <hourly|daily|weekly|monthly>` is the native, no-queue-infra mechanism, and the plan's `--schedule daily` example uses a valid keyword. And **`@sentry/react-native` is indeed current while `sentry-expo` is deprecated** (deprecated at Expo SDK 50 / Jan 2024; merged into `@sentry/react-native`). Both are confirmed against official docs.

**The one systematic weakness is stale GitHub Action major versions.** Every pinned third-party action in the workflows is one major behind current (June 2026): `actions/checkout@v4` → **v6**, `jdx/mise-action@v2` → **v4**, `dorny/paths-filter@v3` → **v4**, `expo/expo-github-action@v8` (still current — the only one that's right). v4 of both mise-action and paths-filter were Node-24 runtime bumps (Node 20 deprecated on GitHub Actions), so the stale pins are not merely cosmetic — they reference EOL runner versions. None of this _breaks_ the architecture; it's a version-refresh pass.

**Verdict:** Architecturally sound and faithful to PHILOSOPHY.md. Approve with a version-bump sweep on all pinned actions, plus two "still-works-but-no-longer-required" notes (Vercel now auto-skips unaffected monorepo builds so `turbo-ignore` is optional; and a Sentry Metro-config detail the guides omit). The Fly scheduled-machine and Sentry-package choices — the things this review was asked to confirm hardest — are both correct.

---

## Findings

### 1. `actions/checkout@v4`

- **Location:** `docs/phase-8-cicd-obs.md` — every workflow (`ci.yml`, `deploy-api.yml`, `eas-build.yml`, `eas-update.yml`, `e2e-nightly.yml`, `electron-release.yml`) pins `actions/checkout@v4`.
- **Claim:** `actions/checkout@v4` is the current major.
- **Status:** ⚠️ Outdated (works, but behind).
- **Finding:** As of June 2026 the current major is **`actions/checkout@v6`**. The `jdx/mise-action` README itself now uses `actions/checkout@v6` in examples. v4 still runs, but is two majors behind and predates the Node-24 runner migration.
- **Recommended change:** Bump all `actions/checkout@v4` → `@v6`. `fetch-depth: 0` in `ci.yml` (needed for `turbo --affected`) is unchanged across majors and remains correct.
- **Source(s):** https://github.com/actions/checkout ; https://raw.githubusercontent.com/jdx/mise-action/main/README.md

### 2. `jdx/mise-action@v2`

- **Location:** `docs/phase-8-cicd-obs.md` — `ci.yml`, `eas-build.yml`, `eas-update.yml`, `e2e-nightly.yml`, `electron-release.yml`; also "Workflows" bullet in PHILOSOPHY.md ("mise-action").
- **Claim:** `jdx/mise-action@v2` installs Node 22 / pnpm 10 / Python 3.13 / uv from `mise.toml`.
- **Status:** ⚠️ Outdated (works, but two majors behind).
- **Finding:** Latest is **v4 (v4.1.0)**. v4 bumped the action runtime from Node 20 → Node 24 (GitHub deprecated Node 20 for Actions) and added automatic locked installs when a `mise.lock` is present. The README recommends `@v4`. The _behavior_ the plan relies on (reads tool versions from `mise.toml`) is unchanged, so v2 still functions.
- **Recommended change:** Bump `jdx/mise-action@v2` → `@v4`. Optionally commit a `mise.lock` to get v4's reproducible locked installs (complements the existing pnpm/uv frozen-lockfile stance).
- **Source(s):** https://github.com/jdx/mise-action ; https://github.com/jdx/mise-action/releases ; https://raw.githubusercontent.com/jdx/mise-action/main/README.md

### 3. `dorny/paths-filter@v3`

- **Location:** `docs/phase-8-cicd-obs.md` — `deploy-api.yml`, `eas-update.yml` `changes` jobs; PHILOSOPHY.md "Workflows" bullet ("paths-filter").
- **Claim:** `dorny/paths-filter@v3` is current.
- **Status:** ⚠️ Outdated (works, but a major behind).
- **Finding:** Current major is **`dorny/paths-filter@v4`** ("New major release v4 after update to Node 24 [Breaking change]"). The `filters:` YAML and the `steps.filter.outputs.changes` output (consumed by the matrix via `fromJSON`) are unchanged in v4, so the plan's usage is forward-compatible.
- **Recommended change:** Bump `dorny/paths-filter@v3` → `@v4`. No filter-syntax changes needed.
- **Source(s):** https://github.com/dorny/paths-filter ; https://raw.githubusercontent.com/dorny/paths-filter/master/README.md ; https://github.com/dorny/paths-filter/releases/tag/v3.0.0

### 4. `expo/expo-github-action@v8` + `eas-version: latest` + `EXPO_TOKEN`

- **Location:** `docs/phase-8-cicd-obs.md` — `eas-build.yml`, `eas-update.yml`.
- **Claim:** `expo/expo-github-action@v8` with `eas-version: latest` and `token: ${{ secrets.EXPO_TOKEN }}` is the correct EAS-in-CI setup.
- **Status:** ✅ Correct.
- **Finding:** **v8 is current**, README examples use `@v8`, recommend `eas-version: latest`, and use `token: ${{ secrets.EXPO_TOKEN }}` (the token is shared for both Expo and EAS CLI). All three details match.
- **Recommended change:** None. (Pin to a fixed patch tag if you want reproducibility, but `@v8` is correct.)
- **Source(s):** https://github.com/expo/expo-github-action ; https://raw.githubusercontent.com/expo/expo-github-action/main/README.md ; https://docs.expo.dev/eas-update/github-actions/

### 5. EAS-cli pnpm-workspace detection workaround (`.npmrc` `node-linker=hoisted` + root `packageManager` field)

- **Location:** `docs/phase-8-cicd-obs.md` — `eas-build.yml` note + "Gotchas"; PHILOSOPHY.md "Workflows" bullet.
- **Claim:** `eas build`/`eas update` misdetect the package manager in a pnpm workspace unless BOTH the committed `.npmrc` (`node-linker=hoisted`) AND a `"packageManager": "pnpm@10.x"` field in the **root** `package.json` are present.
- **Status:** ✅ Correct (real, current issue) — ⚠️ one caveat.
- **Finding:** The failure mode is real and current: open eas-cli issues document EAS misdetecting a pnpm workspace as yarn "despite the package.json having a `packageManager` field," and EAS Build failing to detect the lock file / local monorepo packages in pnpm + Turborepo setups. The `packageManager` field + hoisted linker is the accepted mitigation. **Caveat:** in pnpm 10, the canonical home for `node-linker` is shifting to a `nodeLinker:` key in `pnpm-workspace.yaml`; `node-linker=hoisted` in `.npmrc` is still honored, but PHILOSOPHY.md Key ruling #6 explicitly anchors on `.npmrc` ("still the documented happy path"), so this is internally consistent — just flag that pnpm 10 also accepts the `pnpm-workspace.yaml` form.
- **Recommended change:** Keep the `.npmrc` approach (consistent with ruling #6). Add a one-line note that pnpm 10 also supports `nodeLinker` in `pnpm-workspace.yaml` if a future migration is wanted. Verify the actual EAS detection on a real build, as the underlying eas-cli bug surface keeps shifting.
- **Source(s):** https://github.com/expo/eas-cli/issues/2978 ; https://github.com/expo/eas-cli/issues/3247 ; https://docs.expo.dev/guides/monorepos/ ; https://pnpm.io/settings

### 6. Fly scheduled machines as the cron primitive (`fly machine run --schedule`)

- **Location:** PHILOSOPHY.md "Background/scheduled jobs" bullet + ruling, directory tree (`tasks.py`); `docs/phase-8-cicd-obs.md` step (d) + DoD + Verify; `docs/phase-3-api.md` Step 18.
- **Claim:** "Fly scheduled machines running a lightweight `tasks` module (no queue infra)"; `fly machine run --schedule daily … python -m template_api.tasks prune-push-tokens` is the right primitive in June 2026.
- **Status:** ✅ Correct (with a precision caveat).
- **Finding:** Confirmed against official Fly docs. `fly machine run --schedule` sets the Machine's `config.schedule` and starts the Machine on a **fuzzy hourly / daily / weekly / monthly** cycle — exactly the "no queue infra, run a finite job then exit" model the plan wants. The plan's `--schedule daily` example uses a **valid keyword**. **Caveat:** `--schedule` accepts _only_ those four interval keywords — it does **not** accept cron expressions, and scheduling is "fuzzy/approximate" (not guaranteed at an exact minute). For prune-stale-push-tokens, daily-ish is fine. If a product ever needs precise cron (e.g. "0 4 * * *"), Fly's own task-scheduling blueprint points to **Cron Manager** (per-job isolated machines) or **Supercronic**, not `--schedule`. The plan's "heavier products can add a worker later" already leaves room for this.
- **Recommended change:** None to the primitive choice. Optionally add one sentence: "`--schedule` takes interval keywords only (hourly/daily/weekly/monthly), runs are approximate; for exact-time cron use Fly's Cron Manager / Supercronic blueprint." Note: the one-off Verify run (`fly machine run … <image> python -m …` with no `--schedule`) is correct as a one-shot.
- **Source(s):** https://fly.io/docs/machines/flyctl/fly-machine-run/ ; https://fly.io/docs/flyctl/machine-run/ ; https://community.fly.io/t/new-feature-scheduled-machines/7398 ; https://fly.io/docs/blueprints/task-scheduling/

### 7. `flyctl deploy -c fly.<env>.toml` + `[deploy] release_command` for Alembic

- **Location:** PHILOSOPHY.md ruling #4, "Hosting"; `docs/phase-8-cicd-obs.md` `deploy-api.yml`; `docs/phase-3-api.md` Step 22.
- **Claim:** Deploy via `flyctl deploy -c fly.staging.toml --remote-only`; Alembic runs as `[deploy] release_command = "alembic upgrade head"`.
- **Status:** ✅ Correct.
- **Finding:** Both are current, idiomatic flyctl. `-c`/`--config` selects an alternate TOML, `--remote-only` builds on Fly's remote builder, and `[deploy] release_command` runs once before new machines take traffic — the standard place to run migrations. The ruling-#4 detail (migrations over direct 5432 via `DATABASE_MIGRATION_URL`, set as a Fly secret) is consistent.
- **Recommended change:** None.
- **Source(s):** https://fly.io/docs/launch/continuous-deployment-with-github-actions/ ; https://fly.io/docs/flyctl/integrating/

### 8. `superfly/flyctl-actions/setup-flyctl@master`

- **Location:** `docs/phase-8-cicd-obs.md` — `deploy-api.yml`.
- **Claim:** `uses: superfly/flyctl-actions/setup-flyctl@master` installs flyctl.
- **Status:** ⚠️ Works, but `@master` is an unpinned moving target.
- **Finding:** This is the action Fly's own docs use, and `@master` is what Fly's README shows — so the claim is _faithful to upstream_. However, the action supports pinning (e.g. `with: version: <flyctl version>`), and pinning to a released tag (latest is v1.5) is recommended for production to avoid edge-release surprises. The `FLY_API_TOKEN` secret name is correct.
- **Recommended change:** Acceptable as-is given the "placeholders until real infra" stance, but consider pinning `setup-flyctl` to a tag and `version:` to a known-good flyctl for reproducible deploys.
- **Source(s):** https://github.com/superfly/flyctl-actions ; https://github.com/superfly/flyctl-actions/issues/24 ; https://fly.io/docs/launch/continuous-deployment-with-github-actions/

### 9. Vercel: one project per product, root dir = `products/<name>/app`, build via turbo filter, output `dist`, `npx turbo-ignore` ignored build step

- **Location:** PHILOSOPHY.md "Hosting" + generator step 6 + ruling #1; `docs/phase-8-cicd-obs.md` step (f) "web has NO workflow" note.
- **Claim:** Per-product Vercel project; build via turbo filter; output `dist`; `npx turbo-ignore` as the ignored build step; no `web-deploy.yml`.
- **Status:** ⚠️ Correct but `turbo-ignore` is no longer _required_ (now optional).
- **Finding:** The architecture (one project/product, root dir at the app, Vercel git integration instead of a workflow, `expo export --platform web` → `dist/`) is sound and current. `npx turbo-ignore` is **still supported and not deprecated** (README documents it, defaults to comparing against the last successful deployment on the branch; `--fallback=HEAD^` fixes the first-commit-of-a-branch "always deploys" gotcha). **However**, Vercel now ships an **"Automatically skip unnecessary deployments in monorepos"** project setting (Turborepo-powered) that skips unchanged projects with **no** manual ignored-build-step config. So the manual `turbo-ignore` step is now an optional/legacy approach rather than the required one.
- **Recommended change:** Update the generator checklist + the "web has NO workflow" note to: "enable Vercel's _Automatically skip unnecessary deployments_ setting (preferred); `npx turbo-ignore --fallback=HEAD^` remains a valid manual alternative." Add the `--fallback=HEAD^` flag wherever `npx turbo-ignore` is shown bare, to avoid the new-branch always-deploy gotcha.
- **Source(s):** https://vercel.com/changelog/automatically-skip-unnecessary-deployments-in-monorepos ; https://vercel.com/changelog/intelligent-ignored-builds-using-turborepo ; https://raw.githubusercontent.com/vercel/turborepo/main/packages/turbo-ignore/README.md ; https://vercel.com/docs/monorepos/turborepo

### 10. Sentry RN package: `@sentry/react-native` current, `sentry-expo` deprecated

- **Location:** PHILOSOPHY.md "Cross-cutting" + Key rulings; `docs/phase-8-cicd-obs.md` step (a) `core/sentry.ts` + "Why" + Gotchas; root CLAUDE.md gotcha.
- **Claim:** Sentry = `@sentry/react-native`, NOT the deprecated `sentry-expo`.
- **Status:** ✅ Correct (this is the headline confirmation).
- **Finding:** Confirmed against Expo + Sentry official docs. `sentry-expo` was **deprecated at Expo SDK 50 (18 Jan 2024)** and merged into `@sentry/react-native`; the migration guide says to replace all `sentry-expo` imports with `@sentry/react-native` and install via `npx expo install @sentry/react-native`. Both `@sentry/react-native` and `@sentry/react-native/expo` work as the Expo config plugin. The plan's `import * as Sentry from "@sentry/react-native"` and `Sentry.init({ dsn, environment, tracesSampleRate })` are correct.
- **Recommended change:** None to the package choice. See Finding 11 for the missing Metro/config-plugin step.
- **Source(s):** https://docs.sentry.io/platforms/react-native/migration/sentry-expo/ ; https://github.com/expo/fyi/blob/main/sentry-expo-migration.md ; https://docs.expo.dev/guides/using-sentry/ ; https://github.com/getsentry/sentry-react-native/issues/5859

### 11. Sentry Expo config-plugin / Metro wiring (completeness)

- **Location:** `docs/phase-8-cicd-obs.md` step (a) — only shows `core/sentry.ts` `Sentry.init`.
- **Claim:** (Implicit) the Sentry init in `packages/core/src/sentry.ts` is the full RN Sentry setup.
- **Status:** ⚠️ Incomplete (not wrong, but missing the build-time half).
- **Finding:** For Expo, `Sentry.init()` alone does not give source maps or the config plugin. Current Sentry/Expo guidance also requires: (a) the **config plugin** in `app.json`/`app.config.ts` — `["@sentry/react-native/expo", { url, project, organization }]`; and (b) **Metro** wiring — `const { getSentryExpoConfig } = require("@sentry/react-native/metro"); const config = getSentryExpoConfig(__dirname);`. The plan's `metro.config.js` (Key ruling/config-essentials) uses `getDefaultConfig` + `withNativeWind` and does not mention `getSentryExpoConfig`, and the `app.config.ts` description doesn't list the Sentry plugin. This is a gap for production source maps, not a blocker for `Sentry.init`.
- **Recommended change:** Add to Phase 8 step (a) (and the app.config/metro notes): add `@sentry/react-native/expo` to the Expo `plugins`, and compose `getSentryExpoConfig` with the existing `withNativeWind`/NativeWind Metro setup (order: Sentry's `getSentryExpoConfig(__dirname)` first, then wrap with `withNativeWind`). Set `SENTRY_AUTH_TOKEN` as a build env var (EAS secret), not committed.
- **Source(s):** https://docs.expo.dev/guides/using-sentry/ ; https://docs.sentry.io/platforms/react-native/manual-setup/expo/ ; https://docs.sentry.io/platforms/react-native/manual-setup/metro/

### 12. Python Sentry init: `sentry-sdk[fastapi]`

- **Location:** PHILOSOPHY.md config-essentials Python deps; `docs/phase-8-cicd-obs.md` step (a) `api/.../sentry.py`; `docs/phase-3-api.md` deps.
- **Claim:** `sentry-sdk[fastapi]`; init with `FastApiIntegration()` + `StarletteIntegration()`.
- **Status:** ✅ Correct (one redundancy note).
- **Finding:** `sentry-sdk[fastapi]` is the correct extra. The Sentry Python SDK auto-enables the FastAPI + Starlette integrations when FastAPI is present, so explicitly listing both integrations is harmless and supported (FastAPI integration depends on the Starlette one). `traces_sample_rate=0.1` + `send_default_pii=False` are reasonable defaults.
- **Recommended change:** None required. Optionally drop the explicit `integrations=[...]` (auto-enabled) to reduce surface; keeping them is also fine.
- **Source(s):** https://docs.sentry.io/platforms/python/integrations/fastapi/

### 13. `actions/setup-*` majors

- **Location:** Not used — the workflows use `jdx/mise-action` instead of `actions/setup-node`/`setup-python`.
- **Claim:** (Domain item to verify) current `actions/setup-*` majors.
- **Status:** ✅ N/A — correctly avoided.
- **Finding:** The plan deliberately uses `jdx/mise-action` to install Node/pnpm/Python/uv from `mise.toml`, so no `actions/setup-node`/`actions/setup-python` pins exist to go stale. This is a clean choice (single source of truth = `mise.toml`). For reference, current majors are `setup-node@v6` / `setup-python@v6` had this been used.
- **Recommended change:** None.
- **Source(s):** https://github.com/actions/setup-node/releases

### 14. `workflow_dispatch` / `schedule` triggers

- **Location:** `docs/phase-8-cicd-obs.md` — `e2e-nightly.yml` (`schedule: cron "0 4 * * *"` + `workflow_dispatch: {}`); `eas-build.yml` (`workflow_dispatch` with `inputs`).
- **Claim:** Nightly schedule + manual dispatch with typed inputs.
- **Status:** ✅ Correct.
- **Finding:** `on.schedule[].cron` and `on.workflow_dispatch.inputs` syntax is correct and current. Cron `"0 4 * * *"` = 04:00 UTC nightly. `workflow_dispatch` inputs (`product`, `profile` with `description`/`required`/`default`) are valid. Note GitHub's standard caveat (mirrors the Expo one): scheduled runs can be delayed under load and disabled after 60 days of repo inactivity — fine for this use.
- **Recommended change:** None. (Optional: add `concurrency` to `e2e-nightly.yml` like `ci.yml` has.)
- **Source(s):** https://docs.github.com/actions/using-workflows/events-that-trigger-workflows

### 15. Reusable-workflow syntax

- **Location:** N/A — no `workflow_call` / reusable workflows are used.
- **Claim:** (Domain item to verify) reusable workflow syntax.
- **Status:** ✅ N/A.
- **Finding:** The plan uses six independent top-level workflows with matrix fan-out (over products / OS), not `workflow_call` reusable workflows. There's mild duplication (checkout + mise-action + pnpm install repeated across files) that _could_ be factored into a composite action or reusable workflow, but nothing is incorrect.
- **Recommended change:** Optional DRY-up via a composite action for the "checkout + mise + pnpm install" preamble; not required.
- **Source(s):** https://docs.github.com/actions/using-workflows/reusing-workflows

### 16. CI Postgres service container (`postgres:16`)

- **Location:** `docs/phase-8-cicd-obs.md` — `ci.yml` + `e2e-nightly.yml` `services.postgres`; `docs/phase-3-api.md` Testing strategy.
- **Claim:** `postgres:16` service container with `pg_isready` health check for API integration tests.
- **Status:** ✅ Correct (minor freshness note).
- **Finding:** Service-container syntax (`services:`, `image`, `env`, `ports`, `options` health flags) is correct and current. `postgres:16` is a valid, supported tag; `postgres:17` is GA and `postgres:18` exists (relevant to the UUIDv7 ruling in phase-3 — PG18 has native `uuidv7()`), but pinning 16 is a deliberate, fine choice. The `--health-cmd pg_isready` pattern is the documented one.
- **Recommended change:** None required. If the team wants PG18's native `uuidv7()` (per phase-3's OPEN item), bump the service image accordingly — but that's a phase-3 DB decision, not a CI bug.
- **Source(s):** https://docs.github.com/actions/using-containerized-services/creating-postgresql-service-containers

### 17. `pnpm install --frozen-lockfile` in CI

- **Location:** `docs/phase-8-cicd-obs.md` — all workflows.
- **Claim:** `pnpm install --frozen-lockfile`.
- **Status:** ✅ Correct.
- **Finding:** Correct flag for CI reproducible installs against the committed `pnpm-lock.yaml`. Consistent with the single-lockfile package-management model. (mise-action installs pnpm 10 from `mise.toml`, so pnpm is on PATH before this step — ordering is right.)
- **Recommended change:** None.
- **Source(s):** https://pnpm.io/cli/install

### 18. `turbo run … --affected` in CI

- **Location:** `docs/phase-8-cicd-obs.md` — `ci.yml`; PHILOSOPHY.md "Quality"/"Workflows".
- **Claim:** `pnpm turbo run lint typecheck test build openapi --affected` with `fetch-depth: 0`.
- **Status:** ✅ Correct (OPEN base-ref item resolved below).
- **Finding:** `turbo run --affected` is current Turborepo 2.x. `fetch-depth: 0` is correctly required so Turbo can compute the base diff. The phase-8 OPEN item about base-ref detection is real and resolvable (see "Resolved OPEN" §). The `uv sync` loop over `products/*/api` is a coarse "all APIs" sync rather than truly affected-only — the guide already flags this as acceptable ("a stricter affected filter can be layered later"), which is fair.
- **Recommended change:** None functionally. See OPEN resolution for the `TURBO_SCM_BASE` / explicit-base guidance.
- **Source(s):** https://turbo.build/repo/docs/reference/run ; https://turbo.build/repo/docs/crafting-your-repository/constructing-ci

### 19. `electron-builder --publish always` + GitHub Releases provider + per-product releases repo

- **Location:** `docs/phase-8-cicd-obs.md` — `electron-release.yml`; PHILOSOPHY.md ruling #3 + "Desktop".
- **Claim:** 3-OS matrix, `electron-builder --publish always`, per-product `<org>/<product>-desktop-releases` repo to dodge the electron-updater "latest release of the repo" collision; `GH_TOKEN` for publishing.
- **Status:** ✅ Correct.
- **Finding:** `--publish always`, the GitHub provider, and `GH_TOKEN` env for publishing are all current electron-builder. The multi-product collision reasoning (electron-updater GitHub provider resolves the repo's latest release, so multiple products in one repo collide → separate releases repos) is accurate. `electron-updater` + `autoUpdater.checkForUpdatesAndNotify()` are correct.
- **Recommended change:** None. (See Finding 20 for the macOS-signing gate, which the plan already handles.)
- **Source(s):** https://www.electron.build/configuration/publish ; https://www.electron.build/auto-update

### 20. macOS code-signing/notarization gate (`CSC_LINK`/`CSC_KEY_PASSWORD`)

- **Location:** `docs/phase-8-cicd-obs.md` — `electron-release.yml` env + Gotchas; PHILOSOPHY.md Electron essentials.
- **Claim:** macOS auto-update needs signing/notarization; gate mac publish until certs exist (`CSC_LINK`/`CSC_KEY_PASSWORD` placeholders; drop `macos-latest` or build unsigned in the interim).
- **Status:** ✅ Correct (OPEN item resolved below).
- **Finding:** Accurate. electron-builder reads `CSC_LINK` (cert) + `CSC_KEY_PASSWORD` from env; macOS Squirrel.Mac auto-update requires a signed (and notarized) app — unsigned macOS auto-update will not work. The gating strategy is sound.
- **Recommended change:** None. Resolution detail in "Resolved OPEN" §.
- **Source(s):** https://www.electron.build/code-signing ; https://www.electron.build/auto-update

### 21. Expo Push API endpoint + `send_push()` via httpx

- **Location:** `docs/phase-8-cicd-obs.md` step (b) (`EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"`); `docs/phase-3-api.md` Step 7 + settings `expo_push_url`.
- **Claim:** POST messages to `https://exp.host/--/api/v2/push/send`.
- **Status:** ✅ Correct.
- **Finding:** That is the current Expo Push API send endpoint, and the message shape `{ to, title, body }` is correct. `getExpoPushTokenAsync()` requiring a real device + dev build (Expo Go can't receive a token) is also accurate — the `Device.isDevice` guard is right.
- **Recommended change:** None. (Optional production hardening, not required by PHILOSOPHY.md: chunk to ≤100 messages/request and read the receipts endpoint — out of scope for the template.)
- **Source(s):** https://docs.expo.dev/push-notifications/sending-notifications/

### 22. Supabase Realtime HTTP broadcast endpoint (service-role)

- **Location:** `docs/phase-8-cicd-obs.md` step (c) `api/.../services/realtime.py` (`POST {SUPABASE_URL}/realtime/v1/api/broadcast`).
- **Claim:** Broadcast invalidation via `POST {SUPABASE_URL}/realtime/v1/api/broadcast` with `apikey` + service-role bearer; clients subscribe via `supabase.channel(...).on("broadcast", ...)`.
- **Status:** ❓ Mostly correct; endpoint path worth a live check.
- **Finding:** The broadcast-only architecture is sound and the client side (`supabase-js` `channel().on("broadcast", { event }, cb).subscribe()`) is correct current API. The **server-side HTTP broadcast** path `/realtime/v1/api/broadcast` with `apikey`/`Authorization` headers matches Supabase's documented "send broadcast from the server" REST approach, but Supabase has iterated on Realtime auth (RLS on `realtime.messages` / `realtime.broadcast_changes`), so the exact path and whether the service-role key alone is sufficient should be verified against the live Supabase project. Could not fully confirm the path against current Supabase docs in this pass (couldn't fetch supabase.com).
- **Recommended change:** Verify `POST /realtime/v1/api/broadcast` against current Supabase Realtime docs when the project exists; the architecture doesn't change either way. The phase-8 OPEN item (broadcast-failure policy = log + swallow) is a reasonable default.
- **Source(s):** https://supabase.com/docs/guides/realtime/broadcast (verify on live project)

### 23. Tag-trigger globs (`"*-api-v*"`, `"*-app-v*"`, `"*-ota-v*"`, `"*-desktop-v*"`) + tag→product parsing

- **Location:** `docs/phase-8-cicd-obs.md` — all tag-triggered workflows; PHILOSOPHY.md "Releases".
- **Claim:** Push tags matching `<product>-<surface>-v*` trigger production; `<product>` is parsed from the tag (`PARSE-FROM-TAG` placeholder).
- **Status:** ✅ Correct (OPEN parsing item resolved below).
- **Finding:** `on.push.tags` glob patterns are valid GitHub Actions tag filters. The `if [[ "${GITHUB_REF}" == refs/tags/* ]]` staging/prod branch is correct. The unresolved `PARSE-FROM-TAG` is a real gap but trivially closeable (see OPEN resolution).
- **Recommended change:** Replace `PARSE-FROM-TAG` with a parse step (resolution below).
- **Source(s):** https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions#onpushpull_requestpull_request_targetpathstagsbranches

### 24. `playwright install --with-deps chromium` + nightly E2E/VR jobs

- **Location:** `docs/phase-8-cicd-obs.md` step (e) + `e2e-nightly.yml`.
- **Claim:** `pnpm exec playwright install --with-deps chromium`; two independent jobs (web-e2e, visual-regression).
- **Status:** ✅ Correct.
- **Finding:** `playwright install --with-deps` is the current way to install browsers + OS deps in CI. Splitting VR and E2E into separate jobs so one diff doesn't mask the other is good practice. The VR approach (iterate `storybook-static/index.json`, screenshot story × {light,dark}, committed baselines) is valid Playwright + Storybook usage. The "add `actions/upload-artifact` for the Playwright report" note is correct and worth doing.
- **Recommended change:** None functionally; do add the `upload-artifact` step so failed VR/E2E diffs are downloadable.
- **Source(s):** https://playwright.dev/docs/ci ; https://playwright.dev/docs/test-snapshots

---

## Resolved OPEN / TO CONFIRM (in-scope)

**OPEN — `--affected` base ref in CI (`TURBO_SCM_BASE`).**
Resolution: With `fetch-depth: 0`, Turborepo 2.x auto-detects the base — on `pull_request` it diffs against the PR base ref; on `push` to `main` it diffs against the previous commit. This default is usually correct. If CI mis-scopes (e.g. squash-merge histories, shallow edge cases), set it explicitly: `turbo run … --affected` honoring `TURBO_SCM_BASE`/`TURBO_SCM_HEAD` env vars (e.g. `TURBO_SCM_BASE=${{ github.event.pull_request.base.sha }}` on PRs, `${{ github.event.before }}` on push). Recommended: keep the default, add the explicit env only if drift appears. Source: https://turbo.build/repo/docs/crafting-your-repository/constructing-ci

**OPEN — tag→product parsing (`PARSE-FROM-TAG`).**
Resolution: Add a step before the build that derives the product token from the tag and exposes it as an output, e.g.:

```yaml
- id: tag
  if: startsWith(github.ref, 'refs/tags/')
  run: echo "product=${GITHUB_REF_NAME%%-app-v*}" >> "$GITHUB_OUTPUT"
```

Then `working-directory: products/${{ github.event.inputs.product || steps.tag.outputs.product }}/app`. For `_template` map the literal `template` → `_template` as the existing matrix expression already does (`matrix.product == 'template' && '_template' || matrix.product`). Use `%%-desktop-v*` / `%%-api-v*` / `%%-ota-v*` for the other surfaces. This is plain bash parameter expansion (no extra action needed). Source: https://docs.github.com/actions/learn-github-actions/variables

**OPEN — macOS signing.**
Resolution: Two clean options, both already gestured at in the guide. (1) Keep `macos-latest` in the matrix but only sign/notarize when certs are present — guard the mac publish with `if: env.MAC_CSC_LINK != ''` so empty placeholders build-but-don't-publish the mac artifact. (2) Drop `macos-latest` from the matrix entirely until certs exist. Recommended: option (1) (keeps the build path exercised on macOS without failing on missing certs). Provide `CSC_LINK` (base64 .p12 or path), `CSC_KEY_PASSWORD`, plus notarization creds (`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` or an App Store Connect API key) as repo secrets when available. macOS auto-update will not function until the app is signed AND notarized. Source: https://www.electron.build/code-signing ; https://www.electron.build/auto-update

---

## Sources

- https://github.com/actions/checkout
- https://github.com/actions/setup-node/releases
- https://github.com/jdx/mise-action
- https://github.com/jdx/mise-action/releases
- https://raw.githubusercontent.com/jdx/mise-action/main/README.md
- https://github.com/dorny/paths-filter
- https://raw.githubusercontent.com/dorny/paths-filter/master/README.md
- https://github.com/dorny/paths-filter/releases/tag/v3.0.0
- https://github.com/expo/expo-github-action
- https://raw.githubusercontent.com/expo/expo-github-action/main/README.md
- https://docs.expo.dev/eas-update/github-actions/
- https://github.com/expo/eas-cli/issues/2978
- https://github.com/expo/eas-cli/issues/3247
- https://docs.expo.dev/guides/monorepos/
- https://pnpm.io/settings
- https://pnpm.io/cli/install
- https://fly.io/docs/machines/flyctl/fly-machine-run/
- https://fly.io/docs/flyctl/machine-run/
- https://community.fly.io/t/new-feature-scheduled-machines/7398
- https://fly.io/docs/blueprints/task-scheduling/
- https://fly.io/docs/launch/continuous-deployment-with-github-actions/
- https://fly.io/docs/flyctl/integrating/
- https://github.com/superfly/flyctl-actions
- https://github.com/superfly/flyctl-actions/issues/24
- https://vercel.com/changelog/automatically-skip-unnecessary-deployments-in-monorepos
- https://vercel.com/changelog/intelligent-ignored-builds-using-turborepo
- https://raw.githubusercontent.com/vercel/turborepo/main/packages/turbo-ignore/README.md
- https://vercel.com/docs/monorepos/turborepo
- https://docs.sentry.io/platforms/react-native/migration/sentry-expo/
- https://github.com/expo/fyi/blob/main/sentry-expo-migration.md
- https://docs.expo.dev/guides/using-sentry/
- https://docs.sentry.io/platforms/react-native/manual-setup/expo/
- https://docs.sentry.io/platforms/react-native/manual-setup/metro/
- https://github.com/getsentry/sentry-react-native/issues/5859
- https://docs.sentry.io/platforms/python/integrations/fastapi/
- https://docs.expo.dev/eas/workflows/syntax/
- https://expo.dev/changelog/scheduled-workflows-for-workflows
- https://docs.expo.dev/push-notifications/sending-notifications/
- https://supabase.com/docs/guides/realtime/broadcast
- https://turbo.build/repo/docs/reference/run
- https://turbo.build/repo/docs/crafting-your-repository/constructing-ci
- https://www.electron.build/configuration/publish
- https://www.electron.build/code-signing
- https://www.electron.build/auto-update
- https://playwright.dev/docs/ci
- https://playwright.dev/docs/test-snapshots
- https://docs.github.com/actions/using-workflows/events-that-trigger-workflows
- https://docs.github.com/actions/using-containerized-services/creating-postgresql-service-containers
