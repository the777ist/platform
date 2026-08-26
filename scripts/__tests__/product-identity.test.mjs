// This repo exists to spawn products, and every one carries names that MUST be unique. Nothing
// checked that. The generator allocates them correctly, but it is the only thing that does: a
// hand-edited product.json, a rename after stamping, or a token rewrite that half-applied all
// produce a collision no test, type check or lint can see.
//
// The costs differ sharply, which is why the guard names the kind: a shared fly app means one
// product's deploy OVERWRITES another's, while a shared portIndex means two local stacks fight
// for the same ports and e2e — which derives one SUPABASE_URL from it — can pass a suite against
// the wrong product's database.
import test from "node:test";
import assert from "node:assert/strict";

import {
  collisions,
  missingIdentifiers,
  portIndexOf,
  productIdentity,
  productNames,
} from "../check-product-identity.mjs";

const identity = (over = {}) => ({
  portIndex: "0",
  bundleId: "com.example.a",
  androidPackage: "com.example.a",
  scheme: "a",
  projectId: "example-a",
  flyApps: ["example-a-api-prod", "example-a-api-stg"],
  ...over,
});

test("distinct products collide on nothing", () => {
  const found = collisions({
    a: identity(),
    b: identity({
      portIndex: "1",
      bundleId: "com.example.b",
      androidPackage: "com.example.b",
      scheme: "b",
      projectId: "example-b",
      flyApps: ["example-b-api-prod", "example-b-api-stg"],
    }),
  });
  assert.deepEqual(found, []);
});

test("a shared fly app is reported — one deploy would overwrite the other", () => {
  const found = collisions({
    a: identity(),
    b: identity({ portIndex: "1", scheme: "b", flyApps: ["example-a-api-prod"] }),
  });
  const fly = found.filter((c) => c.kind === "flyApps");
  assert.equal(fly.length, 1);
  assert.equal(fly[0].value, "example-a-api-prod");
  assert.deepEqual(fly[0].products, ["a", "b"]);
});

test("a shared portIndex is reported", () => {
  const found = collisions({ a: identity(), b: identity({ scheme: "b", flyApps: [] }) });
  assert.ok(found.some((c) => c.kind === "portIndex" && c.value === "0"));
});

test("a product does not collide with ITSELF for using one id on both platforms", () => {
  // bundleId and androidPackage are deliberately the same reverse-DNS string within a product.
  // Keying collisions on value alone would flag every product ever stamped.
  assert.deepEqual(collisions({ only: identity() }), []);
});

test("three products sharing a name list all three", () => {
  const found = collisions({
    a: identity({ scheme: "same" }),
    b: identity({ portIndex: "1", scheme: "same", flyApps: [] }),
    c: identity({ portIndex: "2", scheme: "same", flyApps: [] }),
  });
  const scheme = found.find((c) => c.kind === "scheme");
  assert.deepEqual(scheme?.products, ["a", "b", "c"]);
});

test("an absent identifier is reported as incomplete, never as a shared value", () => {
  // The trap: stringifying a missing portIndex yields "undefined", which is a VALUE — so two
  // incomplete stamps would report a collision on it while neither was reported as incomplete.
  assert.deepEqual(missingIdentifiers(identity({ portIndex: null })), ["portIndex"]);
  assert.deepEqual(missingIdentifiers(identity({ flyApps: [] })), ["flyApps"]);
  const found = collisions({ a: identity({ portIndex: null }), b: identity({ portIndex: null }) });
  assert.ok(!found.some((c) => c.kind === "portIndex"), JSON.stringify(found));
});

test("a complete identity is missing nothing", () => {
  assert.deepEqual(missingIdentifiers(identity()), []);
});

test("every real product in this repo has a complete, unique identity", () => {
  const names = productNames();
  assert.ok(names.includes("_template"), names.join(", "));
  const identities = Object.fromEntries(names.map((n) => [n, productIdentity(n)]));
  for (const [name, id] of Object.entries(identities)) {
    assert.deepEqual(missingIdentifiers(id), [], `${name} is an incomplete stamp`);
  }
  assert.deepEqual(collisions(identities), []);
});

test("_template is checked like any other product", () => {
  // It ships in the deploy matrix as `template`, so its fly apps and bundle id are as real as a
  // stamped product's — excluding it would leave the one identity every product is derived from
  // unguarded.
  const id = productIdentity("_template");
  assert.equal(id.scheme, "template");
  assert.ok(id.flyApps.length >= 1, "template declares no fly apps");
});

test("portIndex is only a value when it is actually a number", () => {
  // `String(undefined)` is "undefined" — a VALUE. Two incomplete stamps would then be reported
  // as colliding on it, while neither was reported as incomplete: a real problem described as
  // the wrong problem, pointing at the wrong fix.
  assert.equal(portIndexOf(JSON.stringify({ name: "x", portIndex: 0 })), "0");
  assert.equal(portIndexOf(JSON.stringify({ name: "x", portIndex: 7 })), "7");
  assert.equal(portIndexOf(JSON.stringify({ name: "x" })), null);
  assert.equal(portIndexOf(JSON.stringify({ name: "x", portIndex: null })), null);
  assert.equal(portIndexOf(JSON.stringify({ name: "x", portIndex: "0" })), null);
  assert.equal(portIndexOf(""), null);
});

test("portIndex 0 is not mistaken for absent", () => {
  // _template IS portIndex 0, so a falsy check here would report the template as an incomplete
  // stamp on every run.
  assert.equal(portIndexOf(JSON.stringify({ portIndex: 0 })), "0");
});
