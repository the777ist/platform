// This function decides whether a product's pytest suite RUNS. The pre-push gate probes the
// address it returns and skips that product's Python tests when nothing answers, so every way it
// can be wrong ends the same way: the suite skipped on every push, for everyone, indefinitely.
// The gate does name the product it skipped, so this is not silent — it is merely very easy to
// stop reading, which is close enough.
//
// config.toml carries THREE ports in the [db] family and exactly one is correct:
//   [db]        port          the database the suite connects to
//   [db]        shadow_port   the migration shadow database, in the SAME section
//   [db.pooler] port          the transaction pooler, in a section whose name starts with "db"
import test from "node:test";
import assert from "node:assert/strict";

import { dbPortFrom, testDbTarget } from "../test-db-target.mjs";

// Shaped like the real file, including the two decoys and their ordering.
const CONFIG = `
[api]
port = 54321

[db]
port = 54322
shadow_port = 54320
major_version = 17

[db.pooler]
enabled = false
port = 54329

[db.migrations]
enabled = true

[auth]
enabled = true
`;

test("the [db] port is read", () => {
  assert.equal(dbPortFrom(CONFIG), 54322);
});

test("shadow_port is NOT mistaken for it", () => {
  // It sits in the same section, so only the line-start anchor separates them. Without it the
  // gate would probe the migration shadow database, which the CLI does not keep listening.
  assert.notEqual(dbPortFrom(CONFIG), 54320);
});

test("the [db.pooler] port is NOT mistaken for it", () => {
  // `[db.pooler]` starts with "db", so a section match on prefix rather than on `db]` picks it
  // up. Probing the pooler would report the stack UP while the suite connects elsewhere.
  assert.notEqual(dbPortFrom(CONFIG), 54329);
});

test("the [api] port is not picked up either", () => {
  assert.notEqual(dbPortFrom(CONFIG), 54321);
});

test("[db.pooler] BEFORE [db] still resolves the real database port", () => {
  // TOML section order is not guaranteed, and with [db] written first a prefix match on "db"
  // finds the right section by accident — so a fixture in file order proves nothing about the
  // `db]` anchor. This is the arrangement that tells the two apart.
  const poolerFirst = `
[db.pooler]
enabled = false
port = 54329

[db]
port = 54322
shadow_port = 54320
`;
  assert.equal(dbPortFrom(poolerFirst), 54322);
});

test("[db.migrations] before [db] does not shadow it either", () => {
  const migrationsFirst = "[db.migrations]\nport = 1111\n\n[db]\nport = 54322\n";
  assert.equal(dbPortFrom(migrationsFirst), 54322);
});

test("shadow_port BEFORE port still resolves correctly", () => {
  // Key order in TOML is not guaranteed, and a first-match-wins parser would silently invert
  // with a reordered file.
  assert.equal(dbPortFrom("[db]\nshadow_port = 54320\nport = 54322\n"), 54322);
});

test("a config with no [db] section yields null rather than a guess", () => {
  assert.equal(dbPortFrom("[api]\nport = 54321\n"), null);
  assert.equal(dbPortFrom(""), null);
});

test("TEST_DATABASE_URL wins outright, exactly as the suite honours it", () => {
  // If the gate probed one address while the suite connected to another, it would skip a suite
  // that would have run — or run one that cannot connect.
  const env = { TEST_DATABASE_URL: "postgresql+psycopg://u:p@db.example:6543/x" };
  assert.deepEqual(testDbTarget("products/demo/api", { env }), { host: "db.example", port: 6543 });
});

test("a TEST_DATABASE_URL without a port defaults to 5432", () => {
  const env = { TEST_DATABASE_URL: "postgresql+psycopg://u:p@db.example/x" };
  assert.deepEqual(testDbTarget("products/demo/api", { env }), { host: "db.example", port: 5432 });
});

test("CI targets the service container, not a per-product offset", () => {
  assert.deepEqual(testDbTarget("products/demo/api", { env: { CI: "1" } }), {
    host: "localhost",
    port: 5432,
  });
});

test("TEST_DATABASE_URL outranks CI", () => {
  // Both can be set at once; the suite honours the explicit URL, so the probe must too.
  const env = { CI: "1", TEST_DATABASE_URL: "postgresql://u@other:1234/x" };
  assert.equal(testDbTarget("products/demo/api", { env })?.port, 1234);
});

test("each real product resolves to its OWN offset stack", () => {
  // Against the actual configs: products coexist by portIndex, and two products resolving to
  // the same port would mean one suite silently running against the other's database.
  const template = testDbTarget("products/_template/api", { env: {} });
  const demo = testDbTarget("products/demo/api", { env: {} });
  assert.equal(template?.host, "127.0.0.1");
  assert.ok(template?.port, "template resolved no port");
  assert.ok(demo?.port, "demo resolved no port");
  assert.notEqual(template.port, demo.port, "two products share a database port");
});

test("a product with no supabase config yields null instead of a wrong address", () => {
  assert.equal(testDbTarget("products/does-not-exist/api", { env: {} }), null);
});
