# Phase 5 — Electron desktop (app:// protocol)

**Goal:** Wrap the **exported Expo web build** (`products/_template/app/dist`) in an Electron
shell so `template` ships to desktop from the *same* shared UI codebase that powers iOS,
Android, and web. There is **no separate desktop UI** — Electron loads the identical SPA
bundle through a privileged custom `app://` protocol (see Key ruling #2). electron-builder
packages installers; electron-updater is wired but is a **no-op until a real
`<org>/template-desktop-releases` repo exists** (Key ruling #3).

**Verify (restated from the Phase 5 row):**
> `turbo run build` + start → same screen in window; navigation works; API down → shell
> still launches; `electron-builder --dir` packs.

Concretely:
- `turbo run build` produces `app/dist` (the SPA) and copies it into `desktop/renderer/`.
- `electron .` (the `start` script) opens a window showing the **same screen** as web.
- In-app navigation (Expo Router routes, e.g. tabs → settings) works under `app://-/`.
- With the FastAPI service **down**, the shell still launches (renders shell/offline UX;
  only data fetches fail) — the bundle is served locally, not over the network.
- `electron-builder --dir` produces an unpacked app directory (`release/`) without needing
  signing certs or a releases repo.

---

## Prerequisites

Phase 5 builds directly on **Phase 4** (typegen + a working web build). Before starting,
confirm:

1. **Phase 4 done:** `products/_template/app` exports a working web build to `dist/` —
   `turbo run export:web --filter=*template-app` (or `turbo run build`) succeeds and `dist/`
   contains `index.html` + hashed JS/CSS assets. The home list screen renders the
   cursor-paginated `/v1/items` via the generated TanStack hook.
2. **`web.output: "single"` is set in `app.config.ts`** (Key ruling #2). This makes the
   export a **single-page app** (one `index.html`, client-side history routing) rather than
   the default static per-route HTML. The `app://` SPA fallback below depends on this — with
   `output: "static"` deep links would expect per-route HTML files that the fallback would
   shadow. Verify:
   ```ts
   // products/_template/app/app.config.ts (excerpt — owned by Phase 2/4, NOT created here)
   export default {
     expo: {
       // ...
       web: { output: "single", bundler: "metro" },
       // ...
     },
   };
   ```
   **Bundler is `metro` (confirmed).** In modern Expo SDKs (incl. SDK 56) **webpack is NOT an
   option** for web — it was removed; Metro is the default and only supported web bundler. So
   `web: { output: "single", bundler: "metro" }` is the correct and only config, and it produces
   the single `index.html` SPA the `app://` handler depends on. No further confirmation needed.
3. **Turbo graph wiring is understood:** `desktop#build` `dependsOn: ["^export:web"]` and the
   desktop→app dependency edge comes from a real `devDependency` on `@platform/template-app`
   (see turbo notes in PHILOSOPHY.md "Config essentials"). This guide creates that edge.
4. **Electron version target (resolved):** pin **Electron `42.4.0`** exact (stable since
   2026-05-07; Chromium 148, **Node 24.15.0**). Supported majors under the "latest 3 stable"
   policy are **42 / 41 / 40** — 42.4.0 has the longest support runway; do NOT use 43 (alpha/beta).
   Companion pins: **electron-builder `26.15.3`** (NOT v27 — alpha, and removes implicit
   publishing), **electron-updater `6.8.9`**, `@types/node` on the **Node 24** line. All pins
   are filled into step 1's `package.json`.

---

## Definition of done

- [ ] `products/_template/desktop/` exists as a pnpm workspace `@platform/template-desktop`,
      matching the `pnpm-workspace.yaml` glob `products/*/{app,desktop,api,api-client}`.
- [ ] `desktop/package.json` declares a `devDependency` on `@platform/template-app`
      (`workspace:*`) — this is the **turbo dependency edge** that makes `^export:web` run first.
- [ ] `desktop/src/main.ts` registers the `app` scheme **privileged BEFORE `app.whenReady()`**,
      handles it with a path→file mapper that **falls back to `index.html` (text/html)** for
      unknown/extension-less paths, opens a `BrowserWindow` with the preload script, and calls
      `win.loadURL("app://-/")`.
- [ ] `desktop/src/preload.ts` exposes a **minimal, safe** API over `contextBridge` only
      (context isolation on, node integration off).
- [ ] A cross-platform Node build step copies `../app/dist` → `renderer/` before the main
      process is compiled/run.
- [ ] `desktop/electron-builder.yml` has `appId: com.example.template.desktop`, win/mac/linux
      targets, and a `publish` block pointing at `<org>/template-desktop-releases`, **clearly
      marked placeholder**; mac signing/notarization is gated off.
- [ ] `autoUpdater.checkForUpdatesAndNotify()` runs **only** when the app is packaged **and**
      a real releases repo is configured — otherwise it is a safe no-op (no crash, no error
      dialog) when launched from `electron .` or `--dir`.
- [ ] `desktop/turbo.json` (package-level) declares `build` `dependsOn: ["^export:web"]`.
- [ ] **Verify** commands all pass (see Verification section).

---

## Build steps

> Run from repo root unless noted. All paths are relative to
> `products/_template/desktop/` except where stated.

### 1. Create the workspace `package.json`

**Files:** `products/_template/desktop/package.json`

**Contents:**
```json
{
  "name": "@platform/template-desktop",
  "version": "0.0.0",
  "private": true,
  "description": "Electron desktop shell for the template product (wraps the exported Expo web build)",
  "main": "build/main.js",
  "scripts": {
    "copy:renderer": "node scripts/copy-renderer.mjs",
    "compile": "tsc -p tsconfig.json",
    "build": "pnpm run copy:renderer && pnpm run compile",
    "start": "electron .",
    "dev": "pnpm run build && electron .",
    "pack": "electron-builder --dir",
    "dist": "electron-builder",
    "release": "electron-builder --publish always",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "clean": "node -e \"require('node:fs').rmSync('build',{recursive:true,force:true});require('node:fs').rmSync('renderer',{recursive:true,force:true});require('node:fs').rmSync('release',{recursive:true,force:true})\""
  },
  "devDependencies": {
    "@platform/template-app": "workspace:*",
    "electron": "42.4.0",
    "electron-builder": "26.15.3",
    "typescript": "5.9.3",
    "@types/node": "^24.3.0"
  },
  "dependencies": {
    "electron-updater": "6.8.9"
  }
}
```

**Commands:**
```bash
# after editing pnpm-workspace.yaml glob already includes products/*/desktop
pnpm install
```

**Why:**
- `name` is **exactly** `@platform/template-desktop` (locked naming). The generator
  whole-word-replaces `template` → `<product>` everywhere, so the package name, appId, and
  releases repo all re-derive from the product name.
- `"main": "build/main.js"` — `electron .` and electron-builder both read `main` to find the
  compiled entry. We compile TS → `build/`.
- `devDependencies."@platform/template-app": "workspace:*"` is **the load-bearing edge**:
  Turbo derives the task graph from real dependencies, so this is what makes `^export:web`
  (the app's web export) run before `desktop#build`. Without it, the copy step would run
  before `dist/` exists.
- `electron`, `electron-builder`, `typescript`, `@types/node` are **dev** deps (build/dev
  only, not shipped). `electron-updater` is a **runtime** dependency (it executes inside the
  packaged app), so it lives in `dependencies` and gets bundled.
- `build` = copy renderer **then** compile main — the renderer must be present before
  packaging; ordering matters for `electron-builder` `files` globs (step 7).
- `pack` = `electron-builder --dir` (the Phase 5 verify gate — unpacked, no signing, no
  publish). `dist` = full installers. `release` = `--publish always` (used by
  `electron-release.yml`, gated on a real repo).
- Pin every tool **exact** — consistent with the repo-wide pinning stance. Verified pins
  (June 2026): **Electron `42.4.0`** (stable since 2026-05-07; Chromium 148, **Node 24.15.0**;
  supported majors under the "latest 3 stable" policy are **42 / 41 / 40** — do NOT jump to 43,
  still alpha/beta), **electron-builder `26.15.3`** (do NOT adopt v27 — `27.0.0-alpha.2` is still
  alpha **and removes implicit publishing**, see step 7 + Open questions), **electron-updater
  `6.8.9`**. `@types/node` is pinned on the **Node 24 line** (`^24.3.0`, matching step 1's
  `package.json`) so the main-process types match the runtime Electron 42 bundles
  (Node 24.15.0); `typescript` is current 5.x stable.
  ⚠️ REVIEW: confirm the exact `typescript` patch (`5.9.3` shown) matches the version the rest
  of the repo pins.

### 2. TypeScript config for the main/preload process

**Files:** `products/_template/desktop/tsconfig.json`

**Contents:**
```jsonc
{
  // Node/Electron main-process build: emits CJS to build/.
  // NOTE: does NOT extend tsconfig.base.json (which is noEmit + bundler resolution for the
  // RN/web apps). Electron main is a plain Node CJS target, so it needs its own emit config.
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2022"],
    "types": ["node", "electron"],
    "outDir": "build",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "sourceMap": true,
    "noEmitOnError": true
  },
  "include": ["src/**/*.ts"]
}
```

**Commands:**
```bash
pnpm --filter @platform/template-desktop run typecheck
```

**Why:**
- The main process is a **Node/CJS** program, not an RN/web bundle. `tsconfig.base.json`
  (strict, `moduleResolution: bundler`, `noEmit`) is wrong for emitting runnable Electron
  code, so this config stands alone and emits CJS to `build/`.
- `module: CommonJS` + `"main": "build/main.js"` — Electron's default main entry is CJS.
  **Decision: keep the main process CJS.** ESM main *is* available on Electron 42 (supported
  since Electron 28 via Node's ESM loader, `.mjs`/`"type":"module"`), but CJS is the deliberate
  choice here: it is the lowest-risk default, integrates cleanly with `protocol.handle` /
  `net.fetch`, and — critically — avoids ESM's async-import caveat where only entry-point import
  side effects are guaranteed to run before `ready`. That matters because
  `registerSchemesAsPrivileged` MUST run **before** `app.whenReady()` (see step 3 / gotcha #2);
  CJS makes that top-level call unambiguous. Revisit only if the whole repo standardizes on ESM.
- `strict: true` mirrors the repo-wide strictness invariant.
- `skipLibCheck` keeps Electron's large `.d.ts` from slowing typecheck without weakening our
  own strictness.

### 3. Main process — `src/main.ts`

**Files:** `products/_template/desktop/src/main.ts`

**Contents:**
```ts
import { app, BrowserWindow, protocol, net, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "node:path";
import { pathToFileURL } from "node:url";

// --- 1. Register the privileged scheme BEFORE app is ready ------------------
// Must run at top-level (synchronously, before app.whenReady) or Chromium will
// have already locked its scheme registry. `standard` gives proper origin/CSP
// semantics; `secure` lets it run like https (service workers, secure context);
// `supportFetchAPI` lets the SPA's fetch()/XHR resolve relative URLs against app://.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

// Directory holding the copied Expo web export (see scripts/copy-renderer.mjs).
// In dev (electron .) __dirname = build/, so renderer/ is one level up.
// When packaged, electron-builder places renderer/ under resources/app/renderer.
const RENDERER_DIR = path.join(__dirname, "..", "renderer");

// --- 2. MIME map for the SPA fallback --------------------------------------
const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

function mimeFor(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

// --- 3. Protocol handler: URL path -> file under renderer/, SPA fallback ----
function registerAppProtocol(): void {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    // Strip the leading "/" and decode (handles %20 etc). Empty -> index.html.
    let relPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (relPath === "") relPath = "index.html";

    // Resolve and guard against path traversal escaping renderer/.
    // Compare against RENDERER_DIR + path.sep (NOT a bare startsWith on RENDERER_DIR) so a
    // sibling dir sharing the prefix (e.g. renderer-evil/) cannot satisfy the check.
    const resolved = path.normalize(path.join(RENDERER_DIR, relPath));
    if (resolved !== RENDERER_DIR && !resolved.startsWith(RENDERER_DIR + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }

    // If the request looks like a real asset (has an extension) serve it directly.
    const hasExt = path.extname(resolved) !== "";
    if (hasExt) {
      const res = await net.fetch(pathToFileURL(resolved).toString());
      if (res.ok) {
        // Re-wrap to force a correct Content-Type (net.fetch on file:// can be sparse).
        const body = await res.arrayBuffer();
        return new Response(body, { headers: { "content-type": mimeFor(resolved) } });
      }
      // fall through to SPA fallback if the asset is genuinely missing
    }

    // --- SPA fallback: any unknown/extension-less route -> index.html -------
    // Expo Router uses the History API; deep links like app://-/settings have no
    // file on disk. Returning index.html (as text/html) lets the client router
    // take over, exactly like Vercel's SPA rewrite does for web.
    const indexPath = path.join(RENDERER_DIR, "index.html");
    const indexRes = await net.fetch(pathToFileURL(indexPath).toString());
    const indexBody = await indexRes.arrayBuffer();
    return new Response(indexBody, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  });
}

// --- 4. Window -------------------------------------------------------------
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, // renderer cannot touch Node directly
      nodeIntegration: false, // no Node in the SPA
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Open external links in the OS browser, not inside the shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // The custom protocol host is arbitrary; "-" is a conventional placeholder host.
  void win.loadURL("app://-/");
}

// --- 5. Auto-updater (no-op without a real releases repo) ------------------
// Gated twice: only when packaged AND a real repo is configured. electron-updater
// reads the `publish` block baked into the build from electron-builder.yml; with
// the placeholder owner/repo it would 404, so we skip entirely off-repo.
const UPDATER_ENABLED =
  app.isPackaged && process.env.DESKTOP_RELEASES_CONFIGURED === "1";

function maybeCheckForUpdates(): void {
  if (!UPDATER_ENABLED) return;
  autoUpdater.autoDownload = true;
  // checkForUpdatesAndNotify shows a native notification when an update is ready.
  void autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    // Never crash the shell on an update failure (offline, repo not live yet, etc).
    console.warn("[updater] check failed:", err);
  });
}

// --- 6. Lifecycle ----------------------------------------------------------
void app.whenReady().then(() => {
  registerAppProtocol();
  createWindow();
  maybeCheckForUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

**Commands:**
```bash
pnpm --filter @platform/template-desktop run build   # copy renderer + compile
pnpm --filter @platform/template-desktop run start   # electron .
```

**Why:**
- **`registerSchemesAsPrivileged` runs at module top-level**, before `app.whenReady()`.
  Chromium freezes scheme registration once the app is ready; registering late silently
  fails and the SPA loses secure-context / fetch behaviour (PHILOSOPHY.md "Electron main.ts
  essentials" + Gotchas below).
- **`protocol.handle("app", …)`** is the modern (Electron ≥25) API and the documented
  replacement for the deprecated `registerFileProtocol` / `registerBufferProtocol` /
  `registerStringProtocol` (all explicitly marked deprecated in the official `protocol` docs).
  It runs **after** `app.whenReady()` (all `protocol` methods bar `registerSchemesAsPrivileged`
  are post-ready), receives a request, and returns `Response | Promise<Response>` — exactly as
  the handler does. It maps the request URL to a file under `renderer/`.
- **SPA fallback to `index.html` with `text/html`** is the heart of Key ruling #2: Expo
  Router has no hash mode and breaks under `file://`. Any route with no on-disk file
  (`app://-/settings`, `app://-/(tabs)/index`) returns `index.html` so the client router
  resolves it — the desktop mirror of the web `vercel.json` SPA rewrite.
- **Asset requests with an extension are served directly** with a correct MIME; only
  extension-less / unknown paths fall through to the SPA index. Serving `index.html` for a
  missing `.js` would hand the bundle HTML and white-screen the app — hence the extension
  check.
- **Path-traversal guard** prevents `app://-/../../` from escaping the renderer dir. It
  compares against **`RENDERER_DIR + path.sep`** (plus an exact-equality allowance for the dir
  itself) rather than a bare `startsWith(RENDERER_DIR)` — a bare prefix check can be fooled by a
  sibling directory sharing the prefix (e.g. `renderer-evil/`), so the separator-anchored
  comparison is the correct hardening.
- **`win.loadURL("app://-/")`** — load the SPA via the custom origin, not `file://`.
- **`contextIsolation:true` + `nodeIntegration:false` + `sandbox:true`** — the SPA is
  untrusted UI; it gets Node access only through the explicit preload bridge.
- **Updater double-gate** (`app.isPackaged && DESKTOP_RELEASES_CONFIGURED==='1'`) makes it a
  true no-op under `electron .` and `--dir`, satisfying "updater (no-op w/o repo)" and the
  "API down → shell still launches" expectation (the updater never blocks startup, and any
  failure is caught).

### 4. Preload — `src/preload.ts`

**Files:** `products/_template/desktop/src/preload.ts`

**Contents:**
```ts
import { contextBridge, ipcRenderer } from "electron";

// Minimal, explicit, safe surface. Expose ONLY what the SPA needs — never the raw
// ipcRenderer or Node APIs. Today the renderer is the unmodified Expo web bundle, so
// this is deliberately tiny; grow it deliberately, one method at a time.
const api = {
  /** Identifies the runtime so the shared UI can branch (e.g. "desktop" vs "web"). */
  platform: "desktop" as const,
  /** App version, surfaced read-only for an About/settings line. */
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:get-version"),
};

export type DesktopBridge = typeof api;

contextBridge.exposeInMainWorld("desktop", api);
```

**Commands:** _(compiled as part of `build`/`compile`)_

**Why:**
- **`contextBridge.exposeInMainWorld` only** — never assign to `window` directly and never
  expose `ipcRenderer`/`require`. With context isolation on, this is the single safe channel
  between the privileged main process and the untrusted SPA.
- Kept **minimal**: the renderer is the same web bundle that runs in a browser tab where no
  `window.desktop` exists, so the shared UI must treat the bridge as optional. `platform`
  lets `@platform/core`/UI feature-detect desktop without a hard dependency.
- `getVersion` shown as a representative `invoke` pattern; back it with an
  `ipcMain.handle("app:get-version", () => app.getVersion())` in `main.ts` only if/when a UI
  surface consumes it. This whole `{ platform, getVersion }` surface is fully compatible with
  `sandbox: true` (a sandboxed preload still gets the polyfilled `contextBridge` + `ipcRenderer`
  subset).
- **Bridge API surface — resolved as a design choice.** PHILOSOPHY.md specifies no concrete desktop
  bridge API, and no Electron doc dictates one, so this is config, not a doc-fact: the minimal
  `{ platform, getVersion }` is correct and security-compliant. Keep it deliberately tiny and
  **grow one method at a time on real need** — only adding the matching `ipcMain.handle` when UI
  actually consumes it.

### 5. Renderer copy step — `scripts/copy-renderer.mjs`

**Files:** `products/_template/desktop/scripts/copy-renderer.mjs`

**Contents:**
```mjs
// Cross-platform copy of the exported Expo web build into the desktop renderer dir.
// Run as part of `build` (after ^export:web has produced ../app/dist via turbo).
import { cp, rm, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.join(here, "..");
const SRC = path.join(desktopDir, "..", "app", "dist"); // products/_template/app/dist
const DEST = path.join(desktopDir, "renderer"); // products/_template/desktop/renderer

async function main() {
  try {
    await access(path.join(SRC, "index.html"), constants.F_OK);
  } catch {
    console.error(
      `[copy-renderer] Missing ${path.join(SRC, "index.html")}.\n` +
        `Run the web export first: turbo run export:web --filter=*template-app ` +
        `(turbo's ^export:web edge does this automatically via the workspace devDependency).`
    );
    process.exit(1);
  }

  await rm(DEST, { recursive: true, force: true }); // clean stale assets/hashes
  await cp(SRC, DEST, { recursive: true });
  console.log(`[copy-renderer] copied ${SRC} -> ${DEST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Commands:**
```bash
pnpm --filter @platform/template-desktop run copy:renderer
```

**Why:**
- **Cross-platform via `node:fs/promises.cp`** — no `cp -r`/`xcopy`/`robocopy` shell
  branching; works identically on the 3-OS matrix (`electron-release.yml`).
- **Cleans `renderer/` first** so old hashed assets from a previous export don't linger and
  bloat the package or shadow new ones.
- **Fails loudly if `dist/index.html` is missing** — this is the contract that
  `^export:web` must have run first; the error message points at the turbo edge.
- Source is exactly `../app/dist` and dest exactly `renderer/`, matching the PHILOSOPHY.md turbo
  note ("copies `../app/dist` → `renderer/`").

### 6. Package-level Turbo config — `turbo.json`

**Files:** `products/_template/desktop/turbo.json`

**Contents:**
```jsonc
{
  "extends": ["//"],
  "tasks": {
    "build": {
      // ^export:web = run the web export of THIS package's dependencies (the app)
      // before building the desktop shell. The edge exists because package.json
      // devDepends on @platform/template-app.
      "dependsOn": ["^export:web"],
      // build/ = compiled main+preload; renderer/ = copied SPA bundle.
      "outputs": ["build/**", "renderer/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "pack": {
      "dependsOn": ["build"],
      "outputs": ["release/**"]
    }
  }
}
```

**Commands:**
```bash
turbo run build --filter=@platform/template-desktop
```

**Why:**
- **`build.dependsOn: ["^export:web"]`** is the exact wiring from PHILOSOPHY.md "Config
  essentials" — the desktop build is gated on the app's web export. `^` means "the
  `export:web` task of my dependencies", and the dependency is the `workspace:*` edge to the
  app.
- `extends: ["//"]` inherits the root `turbo.json` task defaults.
- `outputs` lets Turbo cache `build/` + `renderer/` so repeat builds are fast (the desktop
  smoke in CI / `electron-release.yml` reuses the cache).
- `pack` depends on the local `build` (renderer must exist before electron-builder reads
  its `files` globs).
- ⚠️ OPEN / TO CONFIRM: the root `turbo.json` must define a base `build`/`typecheck` task for
  `extends` + `^` to resolve cleanly; that is owned by Phase 1. This file only adds the
  desktop-specific edges.

### 7. electron-builder config — `electron-builder.yml`

**Files:** `products/_template/desktop/electron-builder.yml`

**Contents:**
```yaml
# electron-builder configuration for @platform/template-desktop.
# appId / publish repo are LOCKED placeholders — the generator whole-word-replaces
# `template` and the `<org>` owner is a marked placeholder until a real org exists.
appId: com.example.template.desktop
productName: Template
copyright: Copyright © example

directories:
  output: release        # electron-builder --dir / installers land here
  buildResources: build-resources   # icons etc. (see Open questions)

# What gets packaged into the app. The compiled main/preload + the copied SPA.
files:
  - build/**/*           # compiled main.js + preload.js
  - renderer/**/*        # the exported Expo web SPA (copied by copy-renderer.mjs)
  - package.json
  # electron + electron-builder are devDeps and excluded automatically;
  # electron-updater is a runtime dep and IS bundled.

# --- Targets per OS --------------------------------------------------------
win:
  target:
    - nsis               # installer
    - zip                # update artifact electron-updater can consume
linux:
  target:
    - AppImage           # self-contained + electron-updater friendly
    - deb
  category: Utility
mac:
  target:
    - dmg
    - zip
  category: public.app-category.productivity
  # macOS auto-update REQUIRES signing + notarization. Until certs exist, mac is
  # built locally/unsigned only and is NOT published (gated in `publish` + CI matrix).
  # Leave identity null to skip signing for `--dir` / unsigned local builds.
  identity: null         # PLACEHOLDER: set to "Developer ID Application: …" when certs exist
  hardenedRuntime: false # PLACEHOLDER: true together with notarization once signed

# --- Auto-update publish target -------------------------------------------
# PLACEHOLDER until a real releases repo exists (Key ruling #3): each product
# publishes to its OWN repo so electron-updater's "latest release of the repo"
# resolution does not collide across products in the monorepo.
publish:
  provider: github
  owner: example                       # PLACEHOLDER org
  repo: template-desktop-releases      # <org>/template-desktop-releases (per-product)
  # `releaseType` left default; electron-release.yml runs `--publish always` only
  # on a real tag, and only win/linux are published until mac is signed.
  # FORWARD-LOOKING (electron-builder v27): implicit publishing (auto-publish on CI/tag
  # detection) is deprecated and will be REMOVED in v27 — publish intent must be explicit
  # (`--publish always`/`onTag`). The guide already uses explicit `--publish always` in
  # `electron-release.yml`, so it is ALREADY compliant; this is only a note for a future
  # bump off the pinned 26.15.3. (v27 is still `27.0.0-alpha.2` — do not adopt yet.)
```

**Commands:**
```bash
# the Phase 5 verify gate — packs an unpacked dir, no signing, no publish:
pnpm --filter @platform/template-desktop run pack
# equivalently:
cd products/_template/desktop && pnpm exec electron-builder --dir
```

**Why:**
- **`appId: com.example.template.desktop`** — locked exactly (PHILOSOPHY.md desktop tree). The
  generator rewrites `template` → `<product>`; `com.example.*` is the marked bundle-id
  placeholder.
- **`files` includes `renderer/**`** so the SPA ships inside the package; `build/**` ships
  the compiled main+preload. `package.json`'s `"main"` points electron-builder at
  `build/main.js`.
- **Per-OS targets** chosen to be electron-updater-friendly (`zip`/`AppImage` are formats the
  updater can diff/apply).
- **mac signing gated:** `identity: null`, `hardenedRuntime: false` keep unsigned local /
  `--dir` builds working; macOS auto-update needs signing + notarization (PHILOSOPHY.md "macOS
  auto-update needs signing/notarization → gate publish to win/linux until certs"). The
  publish gate lives in `electron-release.yml` (publish win/linux only for now).
- **`publish` block is the per-product repo** (`<org>/template-desktop-releases`) — Key
  ruling #3's fix for the multi-product GitHub-provider collision. The GitHub provider fetches
  `latest.yml` / `latest-mac.yml` / `latest-linux.yml` from a repo's releases; those filenames
  are **per-repo, not per-app**, so two products publishing to one repo would overwrite each
  other's `latest*.yml` and each updater would pick up the wrong product's release. A separate
  `<org>/<product>-desktop-releases` repo per product is the cleanest fix (per-product `channel`
  names on a shared repo is a viable alternative but pollutes the release list — keep separate
  repos). Marked PLACEHOLDER; with the placeholder owner/repo `electron-updater` would 404, which
  is exactly why `main.ts` gates the check on `DESKTOP_RELEASES_CONFIGURED`.
- **electron-builder v27 forward note:** implicit publishing is removed in v27; the explicit
  `--publish always` in `electron-release.yml` already complies. Stay on the pinned `26.15.3`
  (v27 is alpha) and revisit only on a deliberate bump.

---

## Gotchas & pitfalls

1. **`file://` + Expo Router is broken — that's the whole reason for `app://` (Key ruling
   #2).** Loading `dist/index.html` over `file://` fails: Expo Router has no hash routing,
   the History API + absolute asset paths (`/_expo/...`, `/assets/...`) don't resolve under
   `file://`, and `fetch`/CORS/secure-context behave differently. A **privileged standard
   `app://` scheme** gives a real origin so history routing, absolute assets, and offline all
   work — identical to how the SPA behaves on the web.

2. **The scheme MUST be registered privileged BEFORE `app.whenReady()`.**
   `registerSchemesAsPrivileged` has to run synchronously at module load (top-level), before
   the app `ready` event. Register it inside `whenReady` and Chromium has already locked the
   scheme table — it silently downgrades and you lose secure-context / `supportFetchAPI`,
   producing baffling fetch + service-worker failures. (`protocol.handle` itself is registered
   *after* ready — only the privilege declaration must be early.)

3. **SPA fallback must return `index.html` with `Content-Type: text/html` for unknown
   paths.** Deep links / client routes (`app://-/settings`) have no file on disk. If the
   handler 404s, navigation/reload breaks; if it returns `index.html` with the wrong MIME
   (e.g. `application/octet-stream`), the browser won't parse it and you get a blank window.
   Equally, do **not** fall back to `index.html` for missing **asset** requests (anything with
   an extension) — handing a missing `.js` request the HTML body white-screens the app. The
   handler distinguishes by extension.

4. **Absolute asset paths require `web.output: "single"` + a standard scheme.** The export
   references assets at absolute paths (`/_expo/...`). They only resolve because `app://` is
   registered `standard` (so `/x` means origin-root) and the SPA build is single-output. If
   the app config ever drifts to `output: "static"`, deep-link HTML files would collide with
   the SPA fallback — keep it `single` (Prerequisite #2).

5. **`autoUpdater` is a no-op without a real releases repo — keep it that way.** With the
   placeholder `<org>/template-desktop-releases`, `checkForUpdatesAndNotify()` would hit a
   404 and (worse) can surface an error dialog. `main.ts` gates the call on
   `app.isPackaged && DESKTOP_RELEASES_CONFIGURED==='1'` and wraps it in `.catch`. Under
   `electron .` and `electron-builder --dir` it never runs, so the shell launches cleanly
   even with the API and the releases repo both absent.

6. **macOS auto-update needs signing + notarization — publish is gated to win/linux.** An
   unsigned mac build can be packed (`--dir`) and run locally, but it cannot auto-update and
   should not be published. `electron-builder.yml` leaves `identity: null` and
   `hardenedRuntime: false`; `electron-release.yml` publishes only win/linux until Apple
   Developer certs + notarization are configured. Flip `identity`, `hardenedRuntime: true`,
   and add notarization once certs exist.

7. **electron-updater multi-product collision (Key ruling #3).** The GitHub provider resolves
   "the latest release of *the* repo" — if every product published to the monorepo's repo,
   `template`'s updater would pick up `demo`'s release and vice-versa. The fix baked into this
   config: **each product publishes to its own `<org>/<product>-desktop-releases` repo.** The
   generator rewrites `template-desktop-releases` → `<product>-desktop-releases`.

8. **Renderer staleness.** `copy-renderer.mjs` deletes `renderer/` before copying so old
   hashed bundles don't linger. If you ever see the desktop window showing a *previous*
   version of the UI, you skipped `build` (or ran `electron .` against a stale copy) — always
   `turbo run build` (which runs `^export:web` → copy) before `start`.

9. **CORS allowlist must include the exact origin `app://-`.** A custom *standard* scheme
   produces a real `Origin` header, and a cross-origin `fetch` from the renderer to the API is
   CORS-checked. A request from `app://-/` sends the literal Origin **`app://-`** (scheme +
   host, **no trailing slash**) — so that exact string is what the FastAPI env-driven allowlist
   must contain (not `app://`, and not `app://-/`). PHILOSOPHY.md "API hardening" lists the desktop
   `app://` origin; pin it precisely as `app://-` (the host `-` chosen in `win.loadURL("app://-/")`
   is what determines the origin string — if the host ever changes, the allowlist entry must
   change with it). Owned by Phase 3; verify empirically once the shell runs (a mismatch is a
   silent 403 on desktop while web works).

10. **Don't extend `tsconfig.base.json` for the main process.** The base config is `noEmit` +
    bundler resolution for RN/web; the Electron main is a Node CJS emit target. Mixing them
    yields "cannot find module ./preload" at runtime because nothing was emitted.

---

## Verification

Run from repo root. Each block maps directly to a clause of the Phase 5 verify line.

### V1 — `turbo run build` + start → same screen in window
```bash
# Build: ^export:web produces app/dist, copy-renderer.mjs -> desktop/renderer, tsc -> build/
turbo run build --filter=@platform/template-desktop

# Confirm the renderer landed:
ls products/_template/desktop/renderer/index.html   # exists
ls products/_template/desktop/build/main.js          # exists

# Launch the shell:
pnpm --filter @platform/template-desktop run start
```
**Expected:** an Electron window opens showing the **same home/list screen** as
`localhost:8081` / the web build — same shared `@platform/ui` components, same theme. (If the
API is up, the items list populates via the generated TanStack hook.)

### V2 — navigation works
In the open window: navigate between routes — tabs (home ↔ settings), toggle dark mode in
settings, and **reload** (Cmd/Ctrl-R) while on a non-root route (e.g. settings).
**Expected:** route changes render the correct screen; **reload on a deep route stays on that
route** (proves the `index.html` SPA fallback + history routing under `app://`). No blank
window, no 404.

### V3 — API down → shell still launches
```bash
# Ensure the template API is NOT running (stop turbo dev / the uvicorn process).
# Then build + start as in V1:
turbo run build --filter=@platform/template-desktop
pnpm --filter @platform/template-desktop run start
```
**Expected:** the window **still opens and renders the shell** (navigation, theme, offline/
error UX from the app's global error boundary). Only data fetches fail/show the offline state
— because the bundle is served from `app://` locally, not over the network. The updater does
**not** run (unpackaged), so nothing blocks startup.

### V4 — `electron-builder --dir` packs
```bash
pnpm --filter @platform/template-desktop run build   # ensure renderer/ + build/ are fresh
pnpm --filter @platform/template-desktop run pack     # electron-builder --dir
ls products/_template/desktop/release/                # unpacked app dir present
```
**Expected:** `electron-builder --dir` completes **without signing certs and without a
releases repo**, producing an unpacked application under `release/` (e.g.
`release/<os>-unpacked/`). Launching that unpacked binary opens the same window as V1.

### V5 — launch smoke (Desktop testing row)
Per PHILOSOPHY.md testing strategy, desktop has **no separate E2E** — the same web bundle is already
covered by web Playwright. Phase 5's check is the **launch smoke** above (V1 + V3): the shell
launches and shows the screen. Playwright `_electron` is only added later *if* shell logic
grows (deferred — see Open questions).

---

## Commits

Phase 5 is one feature branch, logically:

1. **`feat(desktop): scaffold @platform/template-desktop workspace`** — `package.json`,
   `tsconfig.json`, package-level `turbo.json`, `scripts/copy-renderer.mjs`; wire the
   `workspace:*` devDependency on `@platform/template-app`; `pnpm install`.
2. **`feat(desktop): app:// protocol main + preload`** — `src/main.ts` (privileged scheme,
   `protocol.handle`, SPA fallback, BrowserWindow, gated updater), `src/preload.ts`.
3. **`feat(desktop): electron-builder config (publish placeholder, mac signing gated)`** —
   `electron-builder.yml`.
4. _(optional)_ **`chore(desktop): verify pinned electron toolchain`** — the pins
   (Electron `42.4.0`, electron-builder `26.15.3`, electron-updater `6.8.9`, `@types/node@^24`)
   are filled in step 1; this commit covers any patch-bump after `pnpm install` + verify.

Each commit should leave the repo green for `turbo run typecheck --filter=@platform/template-desktop`.
Do **not** add `electron-release.yml` here — that workflow is Phase 8 (CI/CD); Phase 5 only
proves `--dir` packs locally.

---

## Open questions / deferred

- ✅ RESOLVED — **exact Electron / electron-builder / electron-updater versions.** Pinned
  **Electron `42.4.0`** (stable 2026-05-07; Chromium 148, Node 24.15.0; supported majors 42/41/40
  — not 43), **electron-builder `26.15.3`** (NOT v27 — alpha + removes implicit publishing),
  **electron-updater `6.8.9`**, `@types/node` on the Node 24 line. Filled into step 1.
- ✅ RESOLVED — **CJS vs ESM main process.** Keep **CJS** (step 2). ESM main is available on
  Electron 42 but CJS is the deliberate lowest-risk choice — it makes the **before-`ready`**
  `registerSchemesAsPrivileged` call unambiguous (ESM's async-import timing is the risk).
  Revisit only if the whole repo standardizes on ESM.
- ✅ RESOLVED — **desktop bridge API surface.** No PHILOSOPHY.md/Electron doc dictates one, so this is
  a design choice: the minimal `{ platform, getVersion }` over `contextBridge` is correct and
  sandbox-safe. Keep it tiny; grow one method at a time on real need.
- ✅ RESOLVED (mechanism) — **`DESKTOP_RELEASES_CONFIGURED` env flag.** This env-var name is this
  guide's own invention (not an Electron/electron-updater concept) and is a reasonable mechanism;
  keep it. `electron-release.yml` sets `DESKTOP_RELEASES_CONFIGURED=1` only on a real tagged
  release once the per-product repo exists. A self-contained alternative needing no CI plumbing
  is to gate on detecting a **non-placeholder `publish.owner`** (owner !== `example`) baked into
  the build — either works; the env flag is simplest.
- ⚠️ REVIEW — **build-resources / icons.** `electron-builder.yml` references `build-resources/`;
  desktop app icons (per-OS `.ico`/`.icns`/`.png`) are not specified by PHILOSOPHY.md. PHILOSOPHY.md's brand
  assets live in `app/assets/brand/` (web favicon/icon) — wiring a regen step to also emit
  desktop icon formats is unspecified. Reuse the brand source when the asset pipeline (Phase 7
  regen script) is in place.
- **Deferred (per PHILOSOPHY.md testing row):** Playwright `_electron` desktop E2E — only if shell
  logic grows beyond a thin wrapper. Phase 5 ships the launch smoke only.
- **Deferred to Phase 8:** `electron-release.yml` (3-OS matrix, `--publish always`, tag
  `<product>-desktop-v*`); real signing/notarization; creating the actual
  `<org>/template-desktop-releases` repo + `GH_TOKEN` (generator infra checklist).
