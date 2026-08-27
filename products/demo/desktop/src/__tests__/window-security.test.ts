// Three flags stand between a compromised page in this shell and the user's machine, and each is
// a one-word edit that changes nothing visible and breaks nothing. That is precisely the kind of
// regression a test exists for.
import test from "node:test";
import assert from "node:assert/strict";

import { SECURE_WEB_PREFERENCES, windowOpenDecision } from "../window-security.ts";

test("the renderer never gets Node", () => {
  // Written out literally rather than compared against the module's own object: the point is to
  // pin the VALUES, and a test that reads them from the code under test would pass whatever
  // they became.
  assert.equal(SECURE_WEB_PREFERENCES.contextIsolation, true);
  assert.equal(SECURE_WEB_PREFERENCES.nodeIntegration, false);
  assert.equal(SECURE_WEB_PREFERENCES.sandbox, true);
});

test("an http(s) link goes to the OS browser and NOT into the shell", () => {
  // A page opening inside the desktop shell wears the application's chrome, which is what makes
  // it worth phishing with.
  for (const url of ["http://example.com", "https://example.com/x?y=1"]) {
    assert.deepEqual(windowOpenDecision(url), { action: "deny", external: true }, url);
  }
});

test("the app's own bundle may open a window", () => {
  assert.deepEqual(windowOpenDecision("app://-/settings"), { action: "allow", external: false });
});

test("an unknown scheme is DENIED rather than opened", () => {
  // "allow" means "open this URL inside the Electron shell". That is not a defensible default
  // for a scheme nobody has considered, so anything not http(s) or app: is refused, and it is
  // refused WITHOUT being handed to the OS either.
  for (const url of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ms-msdt:/id",
    "",
  ]) {
    assert.deepEqual(windowOpenDecision(url), { action: "deny", external: false }, url);
  }
});

test("a scheme that merely CONTAINS http is not treated as external", () => {
  // `nothttp://` must not match; the check is a prefix, and a substring test here would hand
  // arbitrary schemes to shell.openExternal.
  assert.deepEqual(windowOpenDecision("nothttp://example.com"), {
    action: "deny",
    external: false,
  });
});
