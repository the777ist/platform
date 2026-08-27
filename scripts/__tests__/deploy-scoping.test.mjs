// Two scripts that decide whether a product's code ever reaches production, both of which fail
// by doing NOTHING rather than by erroring.
//
// product-filters.mjs generates the dorny/paths-filter config for deploy-api.yml and
// eas-update.yml. Those workflows used to carry a hardcoded product roster, so a newly stamped
// product silently never deployed until someone remembered to edit both files — the CLAUDE.md
// gotcha. Deriving the roster fixed the omission; it did not make the GENERATOR correct, and a
// filter whose path never matches leaves every workflow green while shipping nothing.
//
// alembic-heads.mjs blocks a push when two branches each add a migration. Its whole job is
// counting, and both directions are dangerous: miss a second head and the merge breaks
// migrations for everyone; invent one and every push is blocked by an error nobody can act on.
import test from "node:test";
import assert from "node:assert/strict";

import { filterLines, productsWithSurface, SURFACES } from "../product-filters.mjs";
import { parseHeads, allApiDirs } from "../alembic-heads.mjs";

test("the filter KEY drops the leading underscore but the PATH keeps it", () => {
  // This pairing is the whole bug surface. The workflows' matrix expressions address the
  // template as `template`, but the directory on disk is `_template`. Emit `template` in the
  // path and the filter matches nothing, forever, silently.
  assert.deepEqual(filterLines(["_template"], "api"), [
    "template: ['products/_template/api/**', 'packages/**']",
  ]);
});

test("an ordinary product name is untouched in both halves", () => {
  assert.deepEqual(filterLines(["demo"], "app"), ["demo: ['products/demo/app/**', 'packages/**']"]);
});

test("only a LEADING underscore is stripped", () => {
  // `_` is legal inside a product name; stripping it everywhere would rename the product.
  assert.match(filterLines(["my_product"], "api")[0], /^my_product: /);
});

test("every product also watches packages/**", () => {
  // The co-evolve guard: a shared package change can alter any product's build output, so a
  // product that watched only its own directory would ship a stale binary against new shared
  // code — and nothing would report it.
  for (const line of filterLines(["_template", "demo"], "api")) {
    assert.ok(line.includes("'packages/**'"), line);
  }
});

test("the surface is what separates the api filter from the app filter", () => {
  const [api] = filterLines(["demo"], "api");
  const [app] = filterLines(["demo"], "app");
  assert.notEqual(api, app);
  assert.ok(api.includes("products/demo/api/**"));
  assert.ok(app.includes("products/demo/app/**"));
});

test("no products means no lines, rather than a line matching everything", () => {
  // An empty filter list is correct. A stray `**` entry would deploy every product on every
  // push, which is the expensive direction of this failure.
  assert.deepEqual(filterLines([], "api"), []);
});

test("both deploy surfaces are offered", () => {
  // deploy-api.yml passes `api`; eas-update.yml passes `app`. Dropping either from the accepted
  // list turns that workflow's generation step into a usage error.
  assert.deepEqual([...SURFACES].sort(), ["api", "app"]);
});

test("the real repo has an api and an app filter for every product", () => {
  // Against the actual products/ tree, so a product stamped without one of the surfaces — or a
  // generator that quietly drops one — shows up here.
  const apis = productsWithSurface("api");
  const apps = productsWithSurface("app");
  assert.ok(apis.includes("_template"), `expected _template in ${apis.join(", ")}`);
  assert.deepEqual(apis, apps, "every product should have both an api and an app surface");
  assert.deepEqual(apis, [...apis].sort(), "output must be sorted, not filesystem order");
});

test("a single head is not a failure", () => {
  assert.equal(parseHeads("a1b2c3d4e5f6 (head)\n").length, 1);
});

test("two heads are detected — the case that blocks the push", () => {
  const heads = parseHeads("a1b2c3d4e5f6 (head)\nf6e5d4c3b2a1 (head)\n");
  assert.equal(heads.length, 2);
});

test("a migration directory with no revisions yet reads as zero heads, not as a conflict", () => {
  // A freshly stamped product before its first migration. Reporting a conflict here would
  // block the very first push of every new product.
  assert.deepEqual(parseHeads(""), []);
  assert.deepEqual(parseHeads("\n\n"), []);
});

test("banners and warnings around the output are not counted as heads", () => {
  // alembic writes config/logging chatter to the same stream. Counting lines instead of
  // matching the marker would invent a second head out of a log line.
  const noisy = [
    "INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.",
    "a1b2c3d4e5f6 (head)",
    "",
  ].join("\n");
  assert.deepEqual(parseHeads(noisy), ["a1b2c3d4e5f6 (head)"]);
});

test("CRLF output parses the same as LF", () => {
  // The hook runs on Windows dev machines; CI runs on Linux. A head count that differs by
  // platform is a gate that only some people can pass.
  assert.equal(parseHeads("a1 (head)\r\nb2 (head)\r\n").length, 2);
});

test("every api in the repo is discovered by its alembic.ini", () => {
  const dirs = allApiDirs();
  assert.ok(dirs.includes("products/_template/api"), dirs.join(", "));
  assert.deepEqual(dirs, [...dirs].sort());
});
