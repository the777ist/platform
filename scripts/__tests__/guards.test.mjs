// The four repo guards are the only thing enforcing invariants that no type checker or test can
// reach: no focused tests, no template token in a stamped product, no committed service-role key,
// no named colour in a component. Each was proven to bite ONCE, by hand, by planting a violation.
// Nothing re-proved it afterwards — and a guard that silently stops matching looks exactly like a
// clean repo.
//
// These test the RULES directly (each script exports its predicate and guards its own main), so
// they need no filesystem, no git, and no fixture repo.
import test from "node:test";
import assert from "node:assert/strict";

import { isFocused, isSkipped, isTestFile } from "../check-focused-tests.mjs";
import { leaksTemplateToken } from "../check-stamp-tokens.mjs";
import { jwtRole } from "../check-committed-secrets.mjs";
import { namesAColour } from "../check-semantic-tokens.mjs";

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const jwt = (payload) => `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;

test("focused tests are caught for every runner spelling", () => {
  for (const line of [
    'describe.only("x", () => {})',
    'it.only("x", () => {})',
    'test.only("x", () => {})',
    "describe . only (", // spacing is not a way around it
  ]) {
    assert.ok(isFocused(line), `should be flagged: ${line}`);
  }
});

test("ordinary test code is not mistaken for a focused test", () => {
  for (const line of [
    'describe("x", () => {})',
    'it("only renders once", () => {})', // the WORD only, not the modifier
    "const readOnly = (x) => x;", // the \\b guard
    "expect(el.props.readOnly).toBe(true);",
  ]) {
    assert.ok(!isFocused(line), `should NOT be flagged: ${line}`);
  }
});

test("skips are reported separately from focused tests", () => {
  assert.ok(isSkipped('it.skip("x", () => {})'));
  assert.ok(!isFocused('it.skip("x", () => {})'));
});

test("only real test files are scanned", () => {
  for (const path of ["a.test.ts", "a.test.tsx", "a.spec.js", "a.spec.mjs"]) {
    assert.ok(isTestFile(path), path);
  }
  for (const path of ["a.ts", "testing.ts", "a.test.py", "contest.js"]) {
    assert.ok(!isTestFile(path), path);
  }
});

test("an EMBEDDED template token is caught — the whole reason this guard exists", () => {
  // The generator rewrites whole-word tokens only, so this is the shape that slipped through
  // and made every stamped product document the template's database name.
  assert.ok(leaksTemplateToken("auto-creates a `template_api_test` database"));
  assert.ok(leaksTemplateToken("@platform/template-app"));
  assert.ok(leaksTemplateToken("channel: 'template_api'"));
});

test("ordinary uses of the English word template are not flagged", () => {
  for (const line of [
    "# content_path = './supabase/templates/invite.html'", // supabase CLI's own comment
    "an email template lives here",
    "TEMPLATE",
  ]) {
    assert.ok(!leaksTemplateToken(line), `should NOT be flagged: ${line}`);
  }
});

test("a service-role JWT is identified by its ROLE claim, not its shape", () => {
  // The anon key is the same shape and is published on purpose, so shape alone cannot decide.
  assert.equal(jwtRole(jwt({ role: "service_role" })), "service_role");
  assert.equal(jwtRole(jwt({ role: "anon" })), "anon");
});

test("non-JWT values decode to null rather than throwing", () => {
  for (const value of ["", "plain-secret", "a.b", "not.a.jwt", `${b64({})}.@@@.sig`]) {
    assert.equal(jwtRole(value), null, `should be null: ${value}`);
  }
});

test("named colours are caught in all three forms", () => {
  for (const line of [
    'const c = "#3b82f6";',
    "color: rgb(59, 130, 246)",
    "color: rgba(59,130,246,.5)",
    'className="bg-blue-500"', // a palette class opts out just as thoroughly
    'className="text-red-600"',
  ]) {
    assert.ok(namesAColour(line), `should be flagged: ${line}`);
  }
});

test("token references and semantic classes are allowed", () => {
  for (const line of [
    'placeholderTextColor="hsl(var(--muted-foreground))"', // the sanctioned form
    'className="bg-primary text-foreground border-border"',
    'className="bg-card text-card-foreground"',
    'className="h-10 px-4 rounded-md"',
  ]) {
    assert.ok(!namesAColour(line), `should NOT be flagged: ${line}`);
  }
});
