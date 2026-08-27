// The app:// protocol handler's decision logic, deliberately kept free of any electron import
// so it can be tested as ordinary code.
//
// This is a security boundary, not a convenience: the handler turns a URL the RENDERER controls
// into a path on the user's disk. Without the containment check below, `app://-/../../../../`
// walks straight out of the packaged app and serves whatever it lands on, and a desktop shell
// happily reading arbitrary local files is about as bad as it gets. It lived inline in main.ts,
// which imports electron and therefore cannot be loaded by a test runner at all — so the one
// piece of this app that most needed asserting was the one piece that could not be.
import path from "node:path";

export const MIME_BY_EXT: Record<string, string> = {
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

export function mimeFor(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Map an `app://` request to a file inside `rendererDir`, or null if it escapes.
 *
 * Returning null (rather than a clamped path) is deliberate: a request that tried to leave the
 * renderer directory is a request to answer with 403, not one to quietly satisfy with something
 * else. The caller must treat null as "forbidden".
 */
export function resolveRendererPath(rendererDir: string, requestUrl: string): string | null {
  const url = new URL(requestUrl);
  // Strip the leading "/" and decode (handles %20, and %2e%2e — decoding BEFORE normalising is
  // what stops an encoded traversal from surviving as literal characters in the path).
  let relPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (relPath === "") relPath = "index.html";

  const resolved = path.normalize(path.join(rendererDir, relPath));
  // Compared against rendererDir + path.sep, NOT a bare startsWith on rendererDir, so a sibling
  // directory sharing the prefix (renderer-evil/) cannot satisfy the check.
  if (resolved !== rendererDir && !resolved.startsWith(rendererDir + path.sep)) return null;
  return resolved;
}
