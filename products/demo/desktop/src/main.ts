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
const UPDATER_ENABLED = app.isPackaged && process.env.DESKTOP_RELEASES_CONFIGURED === "1";

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
