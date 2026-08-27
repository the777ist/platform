// The app:// handler turns a URL the RENDERER controls into a path on the user's disk. That is a
// security boundary, and it had no test — it lived inline in main.ts, which imports electron and
// so cannot be loaded by a test runner at all. The one piece of this shell that most needed
// asserting was the one piece that could not be. A desktop app that will read any file on the
// machine is the worst failure available here, and it is silent: traversal that works looks
// exactly like traversal that is blocked, unless somebody tries it.
//
// Containment is layered, and the layers matter when reading these tests:
//
//   `new URL()` resolves literal `../` segments away, so `app://-/../../etc/passwd` arrives at
//   the handler already flattened to `/etc/passwd` and lands harmlessly INSIDE renderer/ (where
//   no such file exists, so it falls through to the SPA fallback).
//
//   Percent-encoded traversal survives URL parsing intact — `%2e%2e%2f` is still `%2e%2e%2f` in
//   `pathname` — and only becomes `../` when the handler decodes it. THAT is what the
//   containment check is for, and it is the only layer standing between an encoded request and
//   the filesystem.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { mimeFor, resolveRendererPath } from "../renderer-path.ts";

const DIR = path.join(path.sep + "app", "renderer");
const at = (...parts: string[]) => path.join(DIR, ...parts);
const inside = (p: string | null) => p !== null && (p === DIR || p.startsWith(DIR + path.sep));

// Everything a hostile renderer might try. Some are neutralised by URL parsing and some by the
// containment check; which layer catches which differs by platform (a backslash is a separator
// on Windows and an ordinary character on POSIX), so the property asserted is the one that must
// hold everywhere.
const HOSTILE = [
  "app://-/../../../../etc/passwd",
  "app://-/../secrets.txt",
  "app://-/%2e%2e%2f%2e%2e%2fetc/passwd",
  "app://-/%2e%2e%2fsecrets.txt",
  "app://-/%2e%2e%2frenderer-evil%2fx.js",
  "app://-/%5c..%5c..%5csecrets.txt",
  "app://-/..%5crenderer-evil%5cx.js",
  "app://-/%252e%252e%252fx",
  "app://-/%2fetc%2fpasswd",
  "app://-/....//....//secrets.txt",
];

test("NO request can resolve outside the renderer directory", () => {
  // The whole security property, stated once. Either the request is refused, or it resolves to
  // something under renderer/ — never a third outcome, on any platform.
  for (const url of HOSTILE) {
    const resolved = resolveRendererPath(DIR, url);
    assert.ok(resolved === null || inside(resolved), `${url} escaped to ${resolved}`);
  }
});

test("a percent-encoded traversal is REFUSED, not clamped", () => {
  // The layer that actually does the work: this survives URL parsing and would reach the disk.
  // Refusing (403) rather than clamping is deliberate — a request that tried to leave the app
  // is not one to quietly satisfy with a different file.
  assert.equal(resolveRendererPath(DIR, "app://-/%2e%2e%2f%2e%2e%2fetc/passwd"), null);
  assert.equal(resolveRendererPath(DIR, "app://-/%2e%2e%2fsecrets.txt"), null);
});

test("an encoded SIBLING directory sharing the prefix is refused", () => {
  // Why the check is `startsWith(DIR + sep)` and not `startsWith(DIR)`: without the separator,
  // /app/renderer-evil/x.js satisfies a bare prefix test on /app/renderer.
  assert.equal(resolveRendererPath(DIR, "app://-/%2e%2e%2frenderer-evil%2fx.js"), null);
});

test("literal ../ is flattened by URL parsing before the guard sees it", () => {
  // Documented, not merely observed: this is why the previous case has to be encoded to be a
  // real test. `../../etc/passwd` arrives as `/etc/passwd` and resolves INSIDE renderer/, where
  // it simply does not exist and falls through to the SPA fallback.
  assert.equal(resolveRendererPath(DIR, "app://-/../../../../etc/passwd"), at("etc/passwd"));
});

test("the root path serves index.html", () => {
  assert.equal(resolveRendererPath(DIR, "app://-/"), at("index.html"));
  // `.` is normalised to `/` by URL parsing, so it takes the same route.
  assert.equal(resolveRendererPath(DIR, "app://-/."), at("index.html"));
});

test("an ordinary asset resolves inside the renderer directory", () => {
  assert.equal(
    resolveRendererPath(DIR, "app://-/_expo/static/js/app.js"),
    at("_expo/static/js/app.js"),
  );
});

test("a percent-encoded space is decoded", () => {
  assert.equal(resolveRendererPath(DIR, "app://-/my%20asset.png"), at("my asset.png"));
});

test("a relative segment that cancels out is allowed", () => {
  // Refusing this would break the relative asset URLs the bundler emits.
  assert.equal(resolveRendererPath(DIR, "app://-/assets/../index.html"), at("index.html"));
});

test("known extensions get their real content type", () => {
  assert.equal(mimeFor("/x/app.js"), "text/javascript");
  assert.equal(mimeFor("/x/index.html"), "text/html");
  assert.equal(mimeFor("/x/style.css"), "text/css");
  assert.equal(mimeFor("/x/font.woff2"), "font/woff2");
});

test("extension matching is case-insensitive", () => {
  // Asset pipelines emit .PNG often enough, and serving it as octet-stream makes the image
  // silently not render.
  assert.equal(mimeFor("/x/LOGO.PNG"), "image/png");
});

test("an unknown extension falls back to octet-stream rather than guessing", () => {
  assert.equal(mimeFor("/x/thing.xyz"), "application/octet-stream");
  assert.equal(mimeFor("/x/no-extension"), "application/octet-stream");
});

test("javascript is never served as html", () => {
  // The specific mix-up that matters: text/html on a script is how a served asset becomes a
  // rendered page.
  assert.notEqual(mimeFor("/x/app.js"), "text/html");
});
