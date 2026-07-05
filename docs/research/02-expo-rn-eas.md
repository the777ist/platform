# Expo / RN / EAS — accuracy review (June 2026)

## Summary

**Checked: 22 claims** across PHILOSOPHY.md + Phase 2 / 4 / 5 / 8 guides.
Issue counts: **✅ 13 verified · ⚠️ 6 caveats/incomplete · ❌ 1 wrong/risky · ❓ 2 unconfirmed.**

**Headline:** The core platform pins are **correct and current** — Expo SDK 56 exists (released **May 21, 2026**), ships **React Native 0.85 + React 19.2**, with the **New Architecture mandatory** (no opt-out, inherited from SDK 55) and **Hermes v1 the default engine**. `web.output: "single"`, EAS Update channels, the Expo Push API endpoint/payload, and the `@sentry/react-native` (not `sentry-expo`) ruling all check out. The most material problems are: (1) the locked **NativeWind v4 ↔ SDK 56 compatibility is NOT confirmed by any official source** — the only official pairing on record is NativeWind v4/v5 ↔ **SDK 54**, and the maintainer has stated releases are no longer pegged to SDK versions, so the Phase 2 "settle this, fallback SDK 55" gate is doing real work and the fallback target is itself questionable; (2) the app's EAS Update OTA path is **under-configured** — `app.config.ts` sets only `extra.eas.projectId` but OTA requires `updates.url` + `runtimeVersion`; (3) SDK 56's **expo/fetch-as-global-fetch** default and the **`@sentry/react-native/expo` config-plugin rename** are new surfaces the guides don't account for.

**Verdict: SOUND foundation, ship with fixes.** No version is invented; the stack is real and internally coherent. Address the OTA config gap and the NativeWind/SDK-56 empirical gate before relying on Phase 2/8.

---

## Findings

### 1. Expo SDK 56 exists and ships RN 0.85 / React 19.2

- **Location:** PHILOSOPHY.md Decision Sheet "Frontend"; Key ruling #2; Phase 2 step (h) note "Target SDK 56 / RN 0.85".
- **Claim:** "Expo SDK 56 (RN 0.85)".
- **Status:** ✅
- **Finding:** Confirmed. SDK 56 released **2026-05-21**, ships **React Native 0.85** and **React 19.2** (beta carried RN 0.85.2 / React 19.2.3). RN 0.85 itself released 2026-04-07.
- **Recommended change:** None.
- **Source(s):** https://expo.dev/blog/expo-router-v56-decoupling-from-react-navigation , https://reactnative.dev/blog , https://medium.com/@onix_react/release-react-native-0-85-677b3007b041

### 2. New Architecture is default/required in SDK 56

- **Location:** DOMAIN question; implicit in PHILOSOPHY.md frontend stack.
- **Claim:** (to confirm) Is the New Architecture default/required?
- **Status:** ✅
- **Finding:** **Mandatory.** From SDK 55 onward the New Architecture is always enabled and cannot be disabled; SDK 56 continues this. RN 0.85 is the first release with no Bridge fallback / interop layer. There is no legacy-arch escape hatch in SDK 56 — if a dependency is New-Arch-incompatible, the only fallback is SDK ≤54 (not SDK 55, which is also New-Arch-only). This matters for the Phase 2 "fallback = SDK 55" line (see Finding 8).
- **Recommended change:** Note in PHILOSOPHY/Phase 2 that the New Arch is non-optional on both SDK 56 and SDK 55, so any New-Arch-blocking dep forces SDK 54, not 55.
- **Source(s):** https://docs.expo.dev/guides/new-architecture/ , https://www.ninetwothree.co/blog/react-native-0-85-bridge-removal

### 3. Hermes v1 is the default engine (new in SDK 56)

- **Location:** Not mentioned in any guide.
- **Claim:** (gap) — guides are silent on Hermes v1.
- **Status:** ⚠️
- **Finding:** SDK 56 makes **Hermes v1 the default JS engine** (faster start, ~73% lower GC pause). Opt-out via `useHermesV1` in `expo-build-properties`. Relevant because `packages/core/src/api.ts` (Phase 8) relies on `crypto.randomUUID` "on Hermes" — that holds on Hermes v1, so the claim is fine, but the guides never name the engine they're depending on.
- **Recommended change:** Add a one-line note that SDK 56 defaults to Hermes v1; the `crypto.randomUUID` assumption in `core/api.ts` depends on it (keep the fallback).
- **Source(s):** https://abdulkadersafi.com/blog/expo-sdk-56-the-update-that-finally-makes-builds-fast , https://cuibit.com/insights/react-native-085-hermes-v1-new-architecture-upgrade-guide-2026

### 4. SDK 56 makes `expo/fetch` the global `fetch` — unaddressed

- **Location:** Phase 4 (`core/api.ts` baseUrl), Phase 8 (`core/api.ts` interceptors, hey-api `@hey-api/client-fetch`).
- **Claim:** (gap) — guides assume RN's standard fetch behavior under the hey-api client-fetch transport.
- **Status:** ⚠️
- **Finding:** In SDK 56, `globalThis.fetch` is now backed by **`expo/fetch`** (WinterCG spec) by default; opt back to RN fetch with `EXPO_PUBLIC_USE_RN_FETCH=1`. `@hey-api/client-fetch` uses the global `fetch`, so requests now flow through expo/fetch. This is usually invisible but can change streaming/abort/header edge-cases and is exactly what the Sentry team flagged needs re-testing for network breadcrumbs. The X-Request-Id interceptor pattern (`request.headers.set(...)`) should still work but verify against the installed hey-api version's request object shape.
- **Recommended change:** Add a gotcha: SDK 56 routes global `fetch` through expo/fetch; verify the hey-api client-fetch interceptor + Sentry network breadcrumbs against it; keep `EXPO_PUBLIC_USE_RN_FETCH=1` as an escape hatch if needed.
- **Source(s):** https://docs.expo.dev/versions/latest/sdk/expo/ , https://medium.com/@onix_react/whats-new-in-expo-sdk-56-63f704fc8426

### 5. `web.output: "single"` (SPA) is still valid in SDK 56

- **Location:** Key ruling #2; Phase 2 step (h) `app.config.ts`; Phase 5 Prerequisite #2.
- **Claim:** "`web.output: "single"` (SPA) … with `bundler: metro`".
- **Status:** ✅
- **Finding:** Confirmed current. `single` outputs an SPA (one `index.html`, no statically-indexable HTML) — exactly what the `app://` Electron shell depends on. `static` and `server` remain the alternatives. Metro is the web bundler default in SDK 56 (Webpack long removed). The Phase 5 OPEN flag asking whether the bundler is metro or webpack is resolvable: **metro** (webpack is not an option in modern SDKs).
- **Recommended change:** Close the Phase 5 Prereq #2 OPEN flag — bundler is `metro`, webpack is not available.
- **Source(s):** https://docs.expo.dev/versions/latest/config/app/ , https://docs.expo.dev/router/reference/typed-routes/

### 6. Expo Router in SDK 56 forked from React Navigation — `@react-navigation/*` imports break

- **Location:** Phase 2 step (h) route files (`import { Tabs }`/`{ Stack } from "expo-router"`); Phase 8 docs.
- **Claim:** Expo Router file-based routing, typed routes, `Tabs`/`Stack` from `expo-router`.
- **Status:** ✅ (with a caveat for any future `@react-navigation` use)
- **Finding:** SDK 56 ships **Expo Router v56**, which **forks React Navigation**: `expo-router` no longer lists `react-navigation` as a dependency, and **direct `@react-navigation/*` imports in app code now break** (runtime API unchanged; only module specifiers move, e.g. `@react-navigation/native` → `expo-router/react-navigation`). A codemod exists: `npx expo-codemod sdk-56-expo-router-react-navigation-replace`. The guides' route files import only from `expo-router` (`Tabs`, `Stack`), so they are **already correct**. Typed routes remain supported (auto-generated TS types via Expo CLI). Risk is latent: if any product feature reaches for a `@react-navigation/*` import (e.g. themes, a navigator type), it must use the `expo-router/*` entry point.
- **Recommended change:** Add a gotcha to Phase 2: in SDK 56 never import `@react-navigation/*` directly — use `expo-router/*` entry points (run the codemod if porting older code).
- **Source(s):** https://expo.dev/blog/expo-router-v56-decoupling-from-react-navigation , https://docs.expo.dev/router/migrate/sdk-55-to-56/

### 7. Typed routes — supported, but `web.output: single` interaction unstated

- **Location:** DOMAIN (typed routes); not pinned in guides.
- **Claim:** (implicit) typed routes available.
- **Status:** ✅
- **Finding:** Expo Router statically types routes (Link + hooks) via Expo CLI codegen; current and unchanged in SDK 56 beyond the better-TS-support improvements. No conflict with SPA output.
- **Recommended change:** Optional — enable `experiments.typedRoutes`/typed routes in `app.config.ts` to get the typed `Link` benefit the plan implies.
- **Source(s):** https://docs.expo.dev/router/reference/typed-routes/

### 8. NativeWind v4 ↔ SDK 56 compatibility — UNCONFIRMED (the locked headline risk)

- **Location:** PHILOSOPHY.md "Frontend" (NativeWind v4; v5 pre-release — do NOT use); Phase 2 headline gotcha "Settles NativeWind v4 ↔ SDK 56 compat; fallback = SDK 55".
- **Claim:** "NativeWind v4 (v5 is pre-release — do NOT use)" + "fallback = SDK 55".
- **Status:** ❌ (the "v4 works on SDK 56" assumption is unverified; fallback target is also questionable)
- **Finding:** Two sub-claims:
  - **"v5 is pre-release — do NOT use":** ✅ **Correct.** As of June 2026 NativeWind **v5 remains pre-release/`@next`** (built on Tailwind v4.1+, RN 0.81+). v4 is the production version.
  - **"v4 works on SDK 56" + "fallback = SDK 55":** ❌ **Not supported by any official source.** The only on-record official pairing (maintainer, Discussion #1604) is **NativeWind v4 (and v5-next) ↔ Expo SDK 54** ("SDK 54 is the official solution"), and the maintainer explicitly said **future releases won't be pegged to specific Expo SDK versions** and acknowledged peer-dep issues. There is **no published confirmation** that NativeWind v4 runs cleanly on **SDK 56 / RN 0.85 + New Arch + Hermes v1** — and NativeWind's metro transform + `react-native-css-interop` are exactly the layer most exposed to a New-Arch/RN-0.85 break. Worse, the **fallback "SDK 55" is also New-Architecture-only** and is not the officially-validated NativeWind target either (SDK 54 is). So if v4 breaks on 56 due to a New-Arch/interop issue, SDK 55 may not fix it — the real safe-harbor is **SDK 54**.
- **Recommended change:** (a) Keep "v5 pre-release — do not use" — accurate. (b) Re-frame the gate honestly: NativeWind v4-on-SDK-56 is **empirically unverified**; the Phase 2 spike must prove `className` resolution + dark toggle on web AND native under New Arch/Hermes v1. (c) Change the documented fallback from **SDK 55 → SDK 54** (the last officially NativeWind-validated SDK, and the last with a legacy-arch option). (d) Pin `nativewind` exact and pin `react-native-css-interop` exact.
- **Source(s):** https://github.com/nativewind/nativewind/discussions/1604 , https://www.nativewind.dev/v5/getting-started/installation , https://github.com/nativewind/nativewind/discussions/1617

### 9. react-native-web — version not pinned/verified; supported but New-Arch caveat

- **Location:** Phase 2 app `package.json` (`"react-native-web": "*"`); PHILOSOPHY.md frontend "react-native-web".
- **Claim:** react-native-web is used for web (and Storybook via `@storybook/react-native-web-vite`).
- **Status:** ❓
- **Finding:** react-native-web ships transitively with SDK 56 and is the basis of Expo web — using it is correct. However: (i) the **exact version is not pinned** (`"*"`) and I could not confirm the precise version SDK 56 bundles from official sources (changelog pages 403 to automated fetch); install via `expo install react-native-web` so the SDK picks the matched version rather than `"*"`. (ii) Note SDK 56 also ships stable **Expo UI** universal components (web still experimental) — not used by the plan (plan uses RN primitives + NativeWind), so no conflict, just context.
- **Recommended change:** Use `expo install react-native-web` (drop `"*"`); record the resolved version. Confirm the Storybook `react-native-web-vite` framework version is compatible with that RNW version during the Phase 2 spike.
- **Source(s):** https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/ , https://alternativeto.net/news/2026/5/expo-sdk-56-brings-stable-expo-ui-faster-builds-and-react-native-0-85/

### 10. EAS Update — channels & `eas update --channel` are current

- **Location:** PHILOSOPHY.md "Releases"; Phase 8 `eas-update.yml` (`eas update --channel staging|production`).
- **Claim:** build profiles + update channels; `eas update --channel staging/production`; OTA for JS-only, store builds for native changes.
- **Status:** ✅
- **Finding:** Confirmed current. Each build profile maps to a channel; `eas update:configure` sets the `channel` on preview/production profiles; `eas update --channel <name> --auto` publishes to that channel/branch. The OTA-vs-store-build policy (JS-only → OTA; native dep change → new store build) is the correct, documented model. `--non-interactive --auto` flags are valid.
- **Recommended change:** None to the channel mechanics.
- **Source(s):** https://docs.expo.dev/eas-update/getting-started/ , https://docs.expo.dev/eas/json/ , https://docs.expo.dev/build/updates/

### 11. EAS Update OTA requires `updates.url` + `runtimeVersion` — MISSING from app.config.ts

- **Location:** Phase 2 step (h) `app.config.ts` (only `extra.eas.projectId`); Phase 8 `eas-update.yml`.
- **Claim:** `app.config.ts` sets `scheme`, bundle ids, `extra.eas.projectId` — and OTA "just works" via `eas update`.
- **Status:** ⚠️
- **Finding:** Incomplete. For `eas update` to actually deliver OTA to installed builds, the app config must also carry **`updates.url`** (`https://u.expo.dev/<projectId>`) and a **`runtimeVersion`** policy — `eas update:configure` adds these. The Phase 2 `app.config.ts` skeleton shows only `extra.eas.projectId`, so as written OTA would not be wired. `runtimeVersion` is the API contract between JS bundle and native binary; without a policy, OTA targeting is undefined. (This is a config gap, not a wrong version.)
- **Recommended change:** In the Phase 2 `app.config.ts` skeleton add `updates: { url: "https://u.expo.dev/<projectId>" }` and a `runtimeVersion` (e.g. `{ policy: "appVersion" }` or `"fingerprint"`), and note that `eas update:configure` populates them. Phase 8's eas-update flow depends on this.
- **Source(s):** https://docs.expo.dev/eas-update/getting-started/ , https://docs.expo.dev/versions/latest/sdk/updates/ , https://docs.expo.dev/versions/latest/config/app/

### 12. `extra.eas.projectId` placeholder pattern is correct

- **Location:** Phase 2 `app.config.ts` (`extra: { eas: { projectId: "TODO-EAS-PROJECT-ID" } }`); generator checklist "`eas init` → paste projectId".
- **Claim:** EAS project id lives at `extra.eas.projectId`, filled by `eas init`.
- **Status:** ✅
- **Finding:** Correct. `eas init` creates the project on expo.dev and writes `expo.extra.eas.projectId` into the app config. The TODO placeholder + generator "paste projectId" step matches the real flow.
- **Recommended change:** None (but pair with Finding 11 — `eas init`/`update:configure` also write `updates.url`).
- **Source(s):** https://docs.expo.dev/eas-update/getting-started/ , https://medium.com/simform-engineering/from-confusion-to-clarity-a-simple-guide-to-expo-config-keys-4f3d6ed50201

### 13. expo-notifications — push token API current; Expo Go limitation correct

- **Location:** Phase 8 `core/notifications.ts` (`getExpoPushTokenAsync`, `getPermissionsAsync`, `requestPermissionsAsync`, `Device.isDevice`); PHILOSOPHY.md "Push notifications"; Phase 8 gotcha "Expo Go can't receive push tokens".
- **Claim:** register via expo-notifications; `getExpoPushTokenAsync()` needs a dev build + real device; Expo Go can't receive tokens.
- **Status:** ✅
- **Finding:** Correct and current. The permission + `getExpoPushTokenAsync()` API surface is unchanged. **Expo Go dropped push-notification support on Android starting SDK 53** (deprecated SDK 52) — a development build is required; the common failure mode is `getExpoPushTokenAsync()` hanging/erroring in Expo Go. The plan's gotcha (dev build + real device, `Device.isDevice` guard, CI verifies server-side with mocked httpx) is exactly right.
- **Recommended change:** None. Optionally note iOS Expo Go can still get tokens when EAS-configured, but Android cannot — so the "use a dev build" guidance is the safe universal rule (already stated).
- **Source(s):** https://docs.expo.dev/versions/latest/sdk/notifications/ , https://expo.dev/changelog/sdk-53 , https://docs.expo.dev/push-notifications/faq/

### 14. Expo Push API endpoint + payload are correct

- **Location:** Phase 8 `services/push.py` (`EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"`, messages `{to, title, body}`); test asserts `ExponentPushToken`.
- **Claim:** POST to `exp.host/--/api/v2/push/send` with `{to, title, body}` array.
- **Status:** ✅
- **Finding:** Correct and current. Endpoint `https://exp.host/--/api/v2/push/send`, POST `application/json`, body may be a single message or an array of `{to, title, body, sound, data, ...}`; total payload ≤ 4096 bytes; response returns tickets, with receipts via `/--/api/v2/push/getReceipts`.
- **Recommended change:** Optional hardening (not a correctness issue): the template's `send_push` ignores ticket/receipt handling and chunking (>100 messages / 4 KB limits) and the recommended `Accept-Encoding: gzip` — fine for a template, but note receipts are where you detect `DeviceNotRegistered` to feed the prune task.
- **Source(s):** https://docs.expo.dev/push-notifications/sending-notifications/ , https://docs.expo.dev/push-notifications/faq/

### 15. Sentry: `@sentry/react-native` (not `sentry-expo`) — correct, but config-plugin path changed

- **Location:** PHILOSOPHY.md "Cross-cutting" (`@sentry/react-native` — NOT deprecated `sentry-expo`); Phase 8 `core/sentry.ts`.
- **Claim:** use `@sentry/react-native`; `sentry-expo` is deprecated.
- **Status:** ✅ (claim) / ⚠️ (incomplete on plugin + SDK 56 support)
- **Finding:** `sentry-expo` is indeed **deprecated since Expo SDK 50 (Jan 2024)** and merged into `@sentry/react-native` — claim correct. Two caveats the guides miss: (1) the Expo **config plugin moved** — it is now `@sentry/react-native/expo` (not a separate `sentry-expo` plugin); a product needing source maps/native wiring must add that plugin in `app.config.ts`. (2) **SDK 56 / RN 0.85 + Hermes v1 support** in `@sentry/react-native` was tracked in issue #6212 (closed via PR #6216, ~May 2026) but the guides don't pin a minimum `@sentry/react-native` version — pin to whatever release first lists SDK 56/RN 0.85 support and verify network breadcrumbs under expo/fetch (Finding 4).
- **Recommended change:** Pin `@sentry/react-native` to the SDK-56-supporting release; if native/source-map wiring is wanted, add the `@sentry/react-native/expo` config plugin to `app.config.ts`. Note the JS-only `Sentry.init` in `core/sentry.ts` works without the plugin but won't symbolicate native crashes.
- **Source(s):** https://docs.sentry.io/platforms/react-native/migration/sentry-expo/ , https://github.com/getsentry/sentry-react-native/issues/6212 , https://github.com/getsentry/sentry-react-native/issues/5859

### 16. Metro / NativeWind web export wiring under SDK 56

- **Location:** Phase 2 `metro.config.js` (`withNativeWind(config, { input: "./global.css" })`), `babel.config.js` (`babel-preset-expo` + `nativewind/babel`).
- **Claim:** standard NativeWind metro + babel wiring; SDK 56 doesn't change metro/web export.
- **Status:** ❓
- **Finding:** The wiring shown is the standard **NativeWind v4** pattern and is correct _for v4_. Whether it works **unchanged on SDK 56** is the same unverified gate as Finding 8 — NativeWind v4's metro transform is the exact integration point most likely to need adjustment on RN 0.85/New Arch. SDK 56 itself did not announce a web-export/metro breaking change beyond expo/fetch (Finding 4) and the general metro version bump that rides with RN 0.85. Treat as part of the Phase 2 empirical spike.
- **Recommended change:** Validate `withNativeWind` + `nativewind/babel` against SDK 56 during the spike; if v4 needs a patch for RN 0.85, that's the signal to consider SDK 54 (per Finding 8). Confirm `babel-preset-expo` still wants the `nativewind/babel` entry under SDK 56 (NativeWind v5 changed this; v4 keeps it).
- **Source(s):** https://github.com/nativewind/nativewind/discussions/1604 , https://medium.com/@onix_react/whats-new-in-expo-sdk-56-63f704fc8426

### 17. EAS Build in a pnpm monorepo — `.npmrc` + `packageManager` workaround

- **Location:** Phase 8 `eas-build.yml` gotcha; PHILOSOPHY.md eas-build note.
- **Claim:** eas-cli misdetects PM in a pnpm workspace unless committed `.npmrc` (`node-linker=hoisted`) + root `packageManager: pnpm@10.x`.
- **Status:** ✅ (plausible/consistent; standard guidance)
- **Finding:** Consistent with documented EAS + pnpm monorepo guidance — committing `.npmrc` and setting `packageManager` is the standard way to make EAS resolve the workspace/package manager correctly. The `node-linker=hoisted` choice also aligns with Expo's pnpm guidance (isolated/symlinked node_modules has historically tripped metro/Expo).
- **Recommended change:** None; keep both committed. Set `packageManager` to the exact pnpm version mise pins (pnpm 10).
- **Source(s):** https://docs.expo.dev/guides/monorepos/ (general EAS+pnpm guidance), https://docs.expo.dev/eas/json/

### 18. expo/expo-github-action @v8 + EXPO_TOKEN

- **Location:** Phase 8 `eas-build.yml` / `eas-update.yml` (`uses: expo/expo-github-action@v8`, `eas-version: latest`, `token: EXPO_TOKEN`).
- **Claim:** CI uses expo-github-action v8 with an EXPO_TOKEN.
- **Status:** ⚠️
- **Finding:** The pattern (expo-github-action + `EXPO_TOKEN` robot token + `eas build`/`eas update --non-interactive`) is correct. The pinned **major `@v8`** is plausible but I could not confirm from an official source that v8 is the current major as of June 2026 — verify the action's latest major tag at wiring time (and prefer pinning to a release SHA for CI integrity). `eas-version: latest` is fine for CI but means non-reproducible CLI; consider pinning.
- **Recommended change:** Confirm the current `expo/expo-github-action` major before locking; optionally pin `eas-version` to a specific eas-cli version for reproducibility.
- **Source(s):** https://github.com/expo/expo-github-action , https://docs.expo.dev/eas-update/getting-started/

### 19. Electron / electron-builder / electron-updater versions left as placeholders

- **Location:** Phase 5 `package.json` (`PLACEHOLDER-pin-exact`), Open questions.
- **Claim:** pin current stable Electron exact; `protocol.handle` is the modern (Electron ≥25) API.
- **Status:** ✅ (out-of-domain detail; the RN/Expo-relevant interface is sound)
- **Finding:** Electron version pinning is outside the Expo/RN/EAS domain, but the RN-adjacent claim — that the desktop wraps the **same `expo export --platform web` SPA `dist/`** and that `web.output: "single"` is required — is correct (see Finding 5). `protocol.handle` replacing `registerFileProtocol` is accurate for modern Electron. The `app://` CORS-allowlist cross-reference is consistent with the FastAPI hardening bullet.
- **Recommended change:** None in-domain. (Electron exact version verification belongs to a separate desktop review.)
- **Source(s):** https://docs.expo.dev/router/reference/typed-routes/ (SPA output), https://docs.expo.dev/versions/latest/config/app/

### 20. `@hey-api/openapi-ts` + client-fetch + TanStack Query plugin (pre-1.0, pinned exact)

- **Location:** Phase 4 (`openapi-ts.config.ts`, `@hey-api/client-fetch`, `@tanstack/react-query` plugin).
- **Claim:** hey-api pinned exact pre-1.0; emits SDK + TanStack `queryOptions`/`infiniteQueryOptions`.
- **Status:** ⚠️
- **Finding:** The architecture (FastAPI OpenAPI → hey-api + TanStack plugin, committed client) is sound and current in spirit, and "pin exact pre-1.0" is the right discipline. But the exact plugin string set and whether `infiniteQueryOptions`/`getNextPageParam` are auto-emitted are version-dependent (the guide already marks these OPEN). This is adjacent to the Expo/EAS domain; the only Expo-specific risk is that the generated client uses global `fetch`, now expo/fetch (Finding 4).
- **Recommended change:** Resolve the OPEN flags against the installed hey-api version; verify generated requests work through expo/fetch on device.
- **Source(s):** https://docs.expo.dev/versions/latest/sdk/expo/ (expo/fetch) — hey-api specifics are out-of-domain (Contracts reviewer).

### 21. `jest-expo` preset for SDK 56

- **Location:** Phase 2 step (i) (`preset: "jest-expo"`, RNTL, `react-test-renderer`).
- **Claim:** single Jest runner via jest-expo preset.
- **Status:** ⚠️
- **Finding:** jest-expo is the correct preset and ships per-SDK. Caveat: **React 19.2** deprecated/removed `react-test-renderer`; RNTL has been moving to its own renderer, and `react-test-renderer` pinned "to the React version" (as the guide says) may not exist for React 19.2. jest-expo SDK 56 should handle this, but the `react-test-renderer` devDep line is a likely footgun.
- **Recommended change:** Install `jest-expo` matched to SDK 56 (`expo install`); drop the explicit `react-test-renderer` pin unless jest-expo 56 still requires it — rely on the preset's transitive setup; verify RNTL version supports React 19.2.
- **Source(s):** https://docs.expo.dev/versions/latest/config/app/ , https://reactnative.dev/blog (React 19.2 in RN 0.85)

### 22. Supabase Realtime broadcast HTTP endpoint

- **Location:** Phase 8 `services/realtime.py` (`POST {SUPABASE_URL}/realtime/v1/api/broadcast`).
- **Claim:** server broadcasts via Supabase Realtime HTTP broadcast endpoint with service-role key.
- **Status:** ❓ (out-of-domain — flag for Supabase reviewer)
- **Finding:** This is a Supabase API surface, not Expo/RN/EAS. The client side (`@supabase/supabase-js` `.channel().on("broadcast", ...)`) is a standard supabase-js pattern and consistent. The exact server REST broadcast path/headers should be verified by the Supabase-domain reviewer.
- **Recommended change:** Defer to Supabase review; verify the `/realtime/v1/api/broadcast` path + auth headers against current Supabase docs.
- **Source(s):** out-of-domain.

---

## Resolved OPEN / TO CONFIRM (in-scope)

- **Phase 5 Prereq #2 — "web bundler metro or webpack?"** → **metro.** Webpack is not a supported Expo web bundler in modern SDKs; `web: { output: "single", bundler: "metro" }` is correct. (Finding 5.) https://docs.expo.dev/router/reference/typed-routes/
- **Phase 2 headline — "NativeWind v4 ↔ SDK 56; fallback SDK 55."** → v5 pre-release call is **correct**; v4-on-56 is **unverified** (official pairing is v4 ↔ SDK 54); **change fallback to SDK 54**, not 55 (55 is also New-Arch-only and not the NativeWind-validated SDK). (Finding 8.) https://github.com/nativewind/nativewind/discussions/1604
- **DOMAIN — "Does SDK 56 exist June 2026 / RN 0.85 / New Arch default?"** → **Yes** (released 2026-05-21), **RN 0.85 + React 19.2**, **New Architecture mandatory**, **Hermes v1 default.** (Findings 1–3.) https://expo.dev/blog/expo-router-v56-decoupling-from-react-navigation
- **DOMAIN — "Expo Push API endpoint/payload current?"** → **Yes**, `https://exp.host/--/api/v2/push/send`, `{to,title,body}`. (Finding 14.) https://docs.expo.dev/push-notifications/sending-notifications/
- **DOMAIN — "expo-notifications deprecations?"** → Push **removed from Expo Go (Android) since SDK 53**; dev build required — plan already handles this. (Finding 13.) https://expo.dev/changelog/sdk-53
- **DOMAIN — "sentry-expo deprecated?"** → **Yes, since SDK 50**; use `@sentry/react-native`; config plugin is now `@sentry/react-native/expo`. (Finding 15.) https://docs.sentry.io/platforms/react-native/migration/sentry-expo/

**Left OPEN (out-of-domain or needs the live install):** exact hey-api pre-1.0 versions & plugin strings (Contracts reviewer); Supabase broadcast REST path (Supabase reviewer); exact Electron majors (Desktop reviewer); cursor DTO field names (Phase 3 schemas); `expo/expo-github-action` current major (verify at wiring time).

---

## Sources

- https://expo.dev/blog/expo-router-v56-decoupling-from-react-navigation
- https://docs.expo.dev/router/migrate/sdk-55-to-56/
- https://docs.expo.dev/guides/new-architecture/
- https://docs.expo.dev/router/reference/typed-routes/
- https://docs.expo.dev/versions/latest/config/app/
- https://docs.expo.dev/versions/latest/sdk/expo/
- https://docs.expo.dev/versions/latest/sdk/notifications/
- https://docs.expo.dev/versions/latest/sdk/updates/
- https://docs.expo.dev/push-notifications/sending-notifications/
- https://docs.expo.dev/push-notifications/faq/
- https://docs.expo.dev/eas-update/getting-started/
- https://docs.expo.dev/eas/json/
- https://docs.expo.dev/build/updates/
- https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/
- https://expo.dev/changelog/sdk-53
- https://github.com/nativewind/nativewind/discussions/1604
- https://github.com/nativewind/nativewind/discussions/1617
- https://www.nativewind.dev/v5/getting-started/installation
- https://docs.sentry.io/platforms/react-native/migration/sentry-expo/
- https://github.com/getsentry/sentry-react-native/issues/6212
- https://github.com/getsentry/sentry-react-native/issues/5859
- https://github.com/expo/expo-github-action
- https://reactnative.dev/blog
- https://medium.com/@onix_react/release-react-native-0-85-677b3007b041
- https://www.ninetwothree.co/blog/react-native-0-85-bridge-removal
- https://abdulkadersafi.com/blog/expo-sdk-56-the-update-that-finally-makes-builds-fast
- https://cuibit.com/insights/react-native-085-hermes-v1-new-architecture-upgrade-guide-2026
- https://medium.com/@onix_react/whats-new-in-expo-sdk-56-63f704fc8426
- https://alternativeto.net/news/2026/5/expo-sdk-56-brings-stable-expo-ui-faster-builds-and-react-native-0-85/
