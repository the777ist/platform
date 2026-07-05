# Electron desktop — accuracy review (June 2026)

## Summary

**26 claims checked** across PHILOSOPHY.md (Decision Sheet "Desktop", rulings #2/#3, "Electron
main.ts essentials") and `docs/phase-5-desktop.md`.

- ✅ Accurate / current: 20
- ⚠️ Minor / needs-a-note: 5
- ❌ Wrong: 0
- ❓ Open (resolved below): 4 OPEN flags answered

**Headline:** The Electron domain of the plan is **technically sound and current**. The
modern `protocol.handle` + privileged-`app://`-scheme + `index.html` SPA-fallback design is
exactly the documented best practice for an Expo-Router SPA under Electron, the deprecated
`registerFileProtocol`/`registerBufferProtocol` APIs are correctly avoided, and the
electron-builder/electron-updater config and the multi-product GitHub-releases collision
workaround are all correct. The only substantive gaps are **version pins** (now resolvable:
Electron **42.x**, electron-builder **26.15.x**, electron-updater **6.8.x**) and one
**forward-looking electron-builder v27 deprecation** (implicit publishing) the plan should
pre-empt by keeping its explicit `--publish always` in CI.

**Verdict: APPROVE with minor edits** — fill the version placeholders with the pins below,
add the v27 implicit-publish note, and resolve the four OPEN flags as documented.

---

## Findings

### 1. Modern protocol API — `protocol.handle` over deprecated `registerFileProtocol`

- **Location:** PHILOSOPHY.md "Electron main.ts essentials"; phase-5 step 3, gotcha #1, DoD.
- **Claim:** Use `protocol.handle("app", …)` (the modern API) and NOT the deprecated
  `registerFileProtocol`/`registerBufferProtocol`.
- **Status:** ✅
- **Finding:** Confirmed against the official `protocol` API docs. `protocol.handle` is the
  current API; `registerFileProtocol`, `registerBufferProtocol`, and `registerStringProtocol`
  are **explicitly marked deprecated** and "have been replaced with `protocol.handle`". The
  handler receives a request and returns `Response | Promise<Response>`, exactly as the
  skeleton does. This is the documented replacement path (Electron 25.0 blog: "added
  `protocol.handle`, which replaces and deprecates the older
  `protocol.{register,intercept}{String,Buffer,Stream,Http,File}Protocol` methods").
- **Recommended change:** None.
- **Source(s):** electronjs.org/docs/latest/api/protocol; electronjs.org/blog/electron-25-0;
  github.com/electron/electron/issues/41986 (migration discussion).

### 2. Privileged-scheme registration timing (before `app.whenReady`)

- **Location:** PHILOSOPHY.md essentials; phase-5 step 3 + gotcha #2 ("registered privileged BEFORE
  `app.whenReady()`", at module top-level).
- **Claim:** `protocol.registerSchemesAsPrivileged([...])` must run synchronously before the
  `ready` event; registering late silently downgrades the scheme.
- **Status:** ✅
- **Finding:** Confirmed verbatim by the docs: `registerSchemesAsPrivileged` "can only be used
  before the `ready` event of the `app` module gets emitted and can be called only once."
  The plan's distinction is also correct — `protocol.handle` itself must be called **after**
  ready ("All methods unless specified can only be used after the `ready` event"). The plan
  registers privileges at top-level and calls `protocol.handle` inside `whenReady()`, which is
  exactly right.
- **Recommended change:** None.
- **Source(s):** electronjs.org/docs/latest/api/protocol (registerSchemesAsPrivileged + handle
  timing notes).

### 3. Privileges object `{standard, secure, supportFetchAPI}`

- **Location:** PHILOSOPHY.md essentials; phase-5 step 3.
- **Claim:** Register `app` with `privileges: { standard: true, secure: true,
supportFetchAPI: true }` to get origin/CSP semantics, secure context, and `fetch`/relative
  URL resolution.
- **Status:** ✅
- **Finding:** All three keys exist and have the described effect: `standard` = RFC-3986 URI
  syntax enabling relative-URL resolution (the reason `/_expo/...` absolute asset paths
  resolve), `secure` = treated as secure (service workers / secure context), `supportFetchAPI`
  = `fetch` works against the scheme. This trio is the documented recipe for "replace the http
  protocol" with a custom scheme. Other valid keys not used here (`bypassCSP`,
  `allowServiceWorkers`, `stream`, `corsEnabled`, `codeCache`) are correctly omitted — the
  chosen minimal set is appropriate for an SPA loaded entirely from local files.
- **Recommended change:** None. (Optional note: if the SPA registers a service worker,
  `allowServiceWorkers: true` may be needed; the Expo web SPA does not by default, so leaving
  it off is fine.)
- **Source(s):** electronjs.org/docs/latest/api/protocol (privileges object).

### 4. SPA `index.html` fallback for Expo-Router history routing under `app://`

- **Location:** Ruling #2; phase-5 step 3, gotchas #1/#3/#4, V2.
- **Claim:** Expo Router has no hash mode and breaks under `file://`; a privileged standard
  `app://` scheme serving `dist/` with fallback to `index.html` makes history routing +
  absolute assets + offline all work. Requires `web.output: "single"`.
- **Status:** ✅
- **Finding:** Correct and current. Expo's docs state `web.output: 'single'` "generates a
  single-page application with only one `dist/index.html` file to which all requests must be
  redirected" — precisely the contract the `app://` handler implements (it is the desktop
  mirror of the web `vercel.json` SPA rewrite). The `standard` privilege is what makes the
  absolute asset paths resolve from the origin root. The reasoning that `file://` breaks
  history routing / absolute assets / secure-context is accurate. The gotcha #3 distinction —
  fall back to `index.html` only for extension-less/unknown paths, and serve real assets
  directly so a missing `.js` does not get handed HTML — is the right nuance and avoids the
  classic white-screen.
- **Recommended change:** None.
- **Source(s):** docs.expo.dev/guides/publishing-websites (output modes); docs.expo.dev/router;
  electronjs.org/docs/latest/api/protocol.

### 5. `net.fetch(pathToFileURL(...))` + manual Content-Type re-wrap

- **Location:** phase-5 step 3 (the asset branch re-wraps the body with `mimeFor()` because
  "net.fetch on file:// can be sparse").
- **Claim:** Using `net.fetch` against a `file://` URL may not set a reliable Content-Type, so
  the handler re-wraps the body with an explicit `content-type`.
- **Status:** ✅
- **Finding:** This is a real, documented concern. `net.fetch` can fetch `file:` and custom
  protocols (official `net` docs), and the migration from `registerFileProtocol` to
  `protocol.handle` + `net.fetch` has known MIME/content-type pitfalls (electron issues
  #41986, #49073). The default response MIME is `text/html` unless set, so the explicit MIME
  map + re-wrap is a sound, defensive choice. The path-traversal guard
  (`resolved.startsWith(RENDERER_DIR)`) is also correct practice.
- **Recommended change:** Minor robustness note (not a correctness bug): `resolved.startsWith(
RENDERER_DIR)` can be fooled by a sibling dir sharing a prefix (e.g. `renderer-evil/`);
  prefer comparing against `RENDERER_DIR + path.sep` or using `path.relative`. Optional
  hardening only.
- **Source(s):** electronjs.org/docs/latest/api/net; github.com/electron/electron/issues/41986;
  github.com/electron/electron/issues/49073; electronjs.org/docs/latest/api/structures/protocol-response.

### 6. `win.loadURL("app://-/")` with `-` placeholder host

- **Location:** PHILOSOPHY.md essentials; phase-5 step 3.
- **Claim:** Load the SPA via `app://-/` (arbitrary placeholder host) rather than `file://`.
- **Status:** ✅
- **Finding:** Valid. With a `standard` scheme the URL needs a host component; `-` is a common
  convention (also seen as `app://./` or `app://app/`). Works as described.
- **Recommended change:** None.
- **Source(s):** electronjs.org/docs/latest/api/protocol (standard scheme URL semantics).

### 7. contextBridge / contextIsolation / sandbox / nodeIntegration defaults

- **Location:** phase-5 step 3 (BrowserWindow `webPreferences`), step 4 (preload), gotchas.
- **Claim:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; expose a
  minimal API only via `contextBridge.exposeInMainWorld`, never raw `ipcRenderer`.
- **Status:** ✅
- **Finding:** Matches current security guidance exactly. `contextIsolation` has defaulted to
  `true` since Electron 12; renderers are sandboxed by default since Electron 20. A sandboxed
  preload still has access to `contextBridge` and `ipcRenderer` (the polyfilled subset), so the
  preload's `contextBridge.exposeInMainWorld("desktop", { platform, getVersion:
() => ipcRenderer.invoke(...) })` is fully compatible with `sandbox: true`. The "treat the
  bridge as optional in shared UI (no `window.desktop` in a browser tab)" guidance is correct.
- **Recommended change:** None. (If `getVersion` is wired, remember to add the matching
  `ipcMain.handle("app:get-version", () => app.getVersion())` in main — the guide already flags
  this as conditional.)
- **Source(s):** electronjs.org/docs/latest/tutorial/sandbox; .../tutorial/context-isolation;
  .../api/context-bridge; .../tutorial/tutorial-preload.

### 8. electron-updater `checkForUpdatesAndNotify()`

- **Location:** PHILOSOPHY.md essentials; phase-5 step 3 + gotcha #5.
- **Claim:** `autoUpdater.checkForUpdatesAndNotify()` checks and shows a native notification
  when an update is ready; gate it so it is a no-op when unpackaged / no real repo.
- **Status:** ✅
- **Finding:** API confirmed — `checkForUpdatesAndNotify()` uses system notifications by
  default. The double-gate (`app.isPackaged && DESKTOP_RELEASES_CONFIGURED === "1"`) plus a
  `.catch` is sound: it won't 404 against the placeholder repo and won't crash the shell.
- **Recommended change:** None (but see Finding 11 re: the gate-flag mechanism).
- **Source(s):** electron.build/auto-update; github.com/iffy/electron-updater-example.

### 9. macOS auto-update requires signing + notarization → gate publish to win/linux

- **Location:** PHILOSOPHY.md essentials; phase-5 gotcha #6; electron-builder.yml mac block.
- **Claim:** macOS auto-update needs code signing + notarization; until certs exist, gate
  publish to win/linux, leave `identity: null`, `hardenedRuntime: false`.
- **Status:** ✅
- **Finding:** Correct. macOS auto-update via Squirrel.Mac **requires the app to be signed**,
  and Apple requires notarization for apps distributed outside the App Store. Building a `zip`
  target on mac is required for Squirrel.Mac to produce `latest-mac.yml` (the plan includes
  `dmg` + `zip` for mac — correct). Unsigned `--dir`/local builds run fine but cannot
  auto-update, so gating publish to win/linux is the right interim posture.
- **Recommended change:** None. (When certs land: set `identity`, `hardenedRuntime: true`, add
  notarization via `electron/notarize` / `notarize: true` in build config.)
- **Source(s):** electron.build/auto-update; github.com/electron/notarize;
  electronjs.org/docs/latest/api/auto-updater.

### 10. electron-updater GitHub-provider "latest release of the repo" collision + per-product repo

- **Location:** Ruling #3; phase-5 gotcha #7; electron-builder.yml `publish` block.
- **Claim:** The GitHub provider resolves "the latest release of the repo," so multiple
  products in one monorepo collide; fix = each product publishes to its own
  `<org>/<product>-desktop-releases` repo.
- **Status:** ✅
- **Finding:** Correct. The GitHub provider's update flow fetches `latest.yml` /
  `latest-mac.yml` / `latest-linux.yml` from the repo's releases and downloads the binary it
  references. Those filenames are **per-repo, not per-app**, so two products publishing to the
  same repo would overwrite each other's `latest*.yml` and each updater would pick up the
  other product's release. There is no built-in per-app channel separation on a shared repo
  in the standard GitHub provider (community workarounds exist via custom `channel`/update
  servers like Nucleus, but a per-product releases repo is the cleanest fix and matches the
  plan). The `publish: { provider: github, owner, repo }` schema is correct.
- **Recommended change:** None. (Optional: per-product `channel` names could disambiguate on a
  shared repo, but separate repos remain cleaner and avoid release-list pollution — keep the
  plan's approach.)
- **Source(s):** electron.build/auto-update; electron.build/publish;
  github.com/electron-userland/electron-builder/issues/3589 (concurrent releases);
  github.com/electron-userland/electron-builder (publish docs).

### 11. electron-builder `--dir` pack / `--publish always` / GitHub provider config

- **Location:** phase-5 step 1 scripts, step 7 yml, V4; `electron-release.yml` reference.
- **Claim:** `electron-builder --dir` packs an unpacked dir without signing/publish; `dist`
  builds installers; `release` = `--publish always`. `electron-builder.yml` win/mac/linux
  targets as listed.
- **Status:** ⚠️ (correct today, but pre-empt a v27 change)
- **Finding:** All flags valid: `--publish` accepts `always | onTag | onTagOrDraft | never`;
  `--dir` packs unsigned. Targets (`nsis`/`zip`, `AppImage`/`deb`, `dmg`/`zip`) are all
  valid and updater-friendly. **Forward-looking caveat:** electron-builder's **implicit
  publishing (auto-publish on CI/tag detection) is deprecated and will be DISABLED in v27**;
  the project should "explicitly specify publish intent using `--publish` (e.g. `--publish
always`, `--publish onTag`)." The plan already uses explicit `--publish always` in
  `electron-release.yml`, so it is **already compliant** — but the guide should note this so a
  future bump to electron-builder 27.x (currently `27.0.0-alpha.2`) doesn't surprise anyone.
- **Recommended change:** Add a one-line note in phase-5 step 7 / Open questions: "explicit
  `--publish always`/`onTag` is required (implicit publish is removed in electron-builder v27);
  the CI workflow already does this." Pin electron-builder to **26.15.x** for now (see
  Resolved OPEN).
- **Source(s):** electron.build/publish; electron.build/cli;
  github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/publish/PublishManager.ts;
  npm dist-tags (`next: 27.0.0-alpha.2`).

### 12. `electron-updater` as runtime dep, `electron`/`electron-builder` as devDeps

- **Location:** phase-5 step 1 package.json + "Why".
- **Claim:** `electron-updater` goes in `dependencies` (runs inside packaged app), the rest in
  `devDependencies`; electron/electron-builder are auto-excluded from the package.
- **Status:** ✅
- **Finding:** Correct and is the standard electron-builder convention — `electron` and
  `electron-builder` must be devDependencies (electron-builder explicitly expects this and
  excludes them from the asar), while `electron-updater` is bundled as a production dep.
- **Recommended change:** None.
- **Source(s):** electron.build (getting-started: electron must be a devDependency);
  electron.build/auto-update (electron-updater as dependency).

### 13. CJS main process / tsconfig emits CommonJS to `build/`

- **Location:** phase-5 step 2 tsconfig + gotcha #10.
- **Claim:** Main process is a Node CJS program; emit CJS, don't extend `tsconfig.base.json`
  (which is `noEmit` + bundler resolution).
- **Status:** ✅
- **Finding:** Correct. Electron's default main entry is CJS; emitting CJS to `build/` and
  pointing `"main": "build/main.js"` is the lowest-risk setup. Not extending the
  bundler/`noEmit` base config is right — otherwise nothing is emitted. See Finding 14 for the
  ESM-vs-CJS OPEN flag (resolved: keep CJS).
- **Recommended change:** None.
- **Source(s):** electronjs.org/docs/latest/tutorial/esm; .../api/protocol.

### 14. `app://` origin must be in the FastAPI CORS allowlist

- **Location:** PHILOSOPHY.md "API hardening"; phase-5 gotcha #9.
- **Claim:** The API CORS allowlist must include the desktop `app://` (or `app://-`) origin.
- **Status:** ⚠️ (correct intent; verify the exact origin string)
- **Finding:** Conceptually correct — a custom standard scheme produces a real Origin header,
  and cross-origin `fetch` from the renderer to the API will be CORS-checked. The **exact
  Origin value** sent by a request from `app://-/` is `app://-` (scheme + host, no trailing
  slash). The allowlist must match that literal string (some setups instead relax via a regex
  or allow the scheme). This is owned by Phase 3 but is worth pinning precisely to avoid a
  silent 403.
- **Recommended change:** In Phase 3 / gotcha #9, specify the literal allowlist entry
  `app://-` (the origin of `app://-/`), or document that the chosen host (`-`) determines the
  origin string. Verify empirically once the shell runs.
- **Source(s):** electronjs.org/docs/latest/api/protocol (standard scheme = real origin); MDN
  CORS Origin semantics.

### 15. `web.output: "single"` bundler (metro vs webpack) — OPEN flag

- **Location:** phase-5 prereq #2 (⚠️ OPEN: metro vs webpack not pinned).
- **Claim:** SDK 56 default web bundler is `metro`.
- **Status:** ✅ (resolved)
- **Finding:** Correct. Metro is the default (and recommended) web bundler in modern Expo;
  webpack support has been deprecated/removed in recent SDKs. `web: { output: "single",
bundler: "metro" }` is the right config and produces the single `index.html` SPA the
  `app://` handler depends on.
- **Recommended change:** Resolve the OPEN flag — `bundler: "metro"`, `output: "single"`.
- **Source(s):** docs.expo.dev/guides/publishing-websites; docs.expo.dev/router.

---

## Resolved OPEN / TO CONFIRM

### A. Electron / electron-builder / electron-updater exact version pins

**Answer (verified against the npm registry, June 2026):**

- **Electron — pin `42.x` (latest `42.4.0`).** Electron 42.0.0 went stable **2026-05-07**
  (Chromium 148, V8 14.8, **Node 24.15.0**). Supported majors under the "latest 3 stable"
  policy are **42, 41 (41.7.2), 40 (40.10.3)**; 39 (39.8.10) is at/near EOL; 43 is alpha/beta.
  Recommend pinning **`42.4.0`** (newest stable, longest support runway). Avoid 43 until stable.
- **electron-builder — pin `26.15.3`** (`latest`). v27 is pre-release (`27.0.0-alpha.2`) and
  **removes implicit publishing** (see Finding 11) — do not adopt yet.
- **electron-updater — pin `6.8.9`** (`latest`).
- **`@types/node` — pin to the Node 24 line** (Electron 42 bundles Node 24.15.0), e.g.
  `@types/node@^24`, so main-process types match the runtime.
- **typescript — current 5.x stable** (pin exact per repo convention).

This resolves the phase-5 `PLACEHOLDER-pin-exact` markers and the prereq #4 / Open-questions
Electron-version flag.

### B. CJS vs ESM main process

**Answer: keep CJS (the skeleton's default).** ESM main is supported since Electron 28 (Node's
ESM loader; `.mjs` or `"type":"module"`), so ESM is _available_ on Electron 42 — but the plan's
CJS choice is the lowest-risk default, integrates cleanly with `protocol.handle`/`net.fetch`,
and avoids ESM's async-import caveat (only entry-point import side effects run before `ready`,
which matters for the **before-ready** `registerSchemesAsPrivileged` call — a strong reason to
stay CJS here). Recommendation: **CJS now**; revisit only if the repo standardizes on ESM.
Source: electronjs.org/docs/latest/tutorial/esm.

### C. Desktop bridge API surface

**Answer:** PHILOSOPHY.md specifies none, so this is a design choice, not a doc-fact. The guide's
minimal `{ platform: "desktop", getVersion() }` over `contextBridge` is correct and
security-compliant (works under `sandbox: true`). Keep it minimal; only add an
`ipcMain.handle("app:get-version", …)` if/when UI consumes `getVersion`. No web doc dictates a
surface — this is correctly left as "grow deliberately."

### D. `DESKTOP_RELEASES_CONFIGURED` updater-gate flag

**Answer:** This env-var name is the guide's own invention (not an Electron/electron-updater
concept) and is a reasonable mechanism. A more self-contained alternative that needs no CI
plumbing: **gate on detecting a non-placeholder `publish.owner`** baked into the build (e.g.
read `app.getAppPath()`'s embedded builder metadata, or check that owner !== "example"). Either
works; the env flag is simplest. Recommendation: keep the flag, and have `electron-release.yml`
set `DESKTOP_RELEASES_CONFIGURED=1` only on a real tagged release once the per-product repo
exists. There is no "official" answer — this is config, not API.

---

## Sources

- https://www.electronjs.org/docs/latest/api/protocol
- https://www.electronjs.org/docs/latest/api/net
- https://www.electronjs.org/docs/latest/api/structures/protocol-response
- https://www.electronjs.org/docs/latest/api/context-bridge
- https://www.electronjs.org/docs/latest/api/auto-updater
- https://www.electronjs.org/docs/latest/tutorial/sandbox
- https://www.electronjs.org/docs/latest/tutorial/context-isolation
- https://www.electronjs.org/docs/latest/tutorial/tutorial-preload
- https://www.electronjs.org/docs/latest/tutorial/esm
- https://www.electronjs.org/blog/electron-25-0
- https://www.electronjs.org/blog/electron-42-0
- https://www.electronjs.org/docs/latest/tutorial/electron-timelines
- https://releases.electronjs.org/schedule
- https://github.com/electron/electron/issues/41986
- https://github.com/electron/electron/issues/49073
- https://registry.npmjs.org/electron (dist-tags: latest 42.4.0; 41.7.2; 40.10.3)
- https://www.electron.build/auto-update
- https://www.electron.build/publish.html
- https://www.electron.build/cli.html
- https://github.com/electron-userland/electron-builder (publish + getting-started)
- https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/publish/PublishManager.ts
- https://github.com/electron-userland/electron-builder/issues/3589
- https://registry.npmjs.org/electron-builder (dist-tags: latest 26.15.3; next 27.0.0-alpha.2)
- https://registry.npmjs.org/electron-updater (latest 6.8.9)
- https://github.com/electron/notarize
- https://github.com/iffy/electron-updater-example
- https://docs.expo.dev/guides/publishing-websites/
- https://docs.expo.dev/router/introduction/
