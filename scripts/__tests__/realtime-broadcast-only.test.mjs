// Broadcast-only and RLS-deny-all are one decision, not two. A `postgres_changes` subscription
// reads rows straight from the database over the CLIENT's credentials, so under deny-all it
// returns nothing — and the natural fix at 5pm is a permissive SELECT policy. That is the RLS
// hole, and it never arrives labelled as one; it arrives as "realtime wasn't working, so I
// opened up the table". After that every row is readable by every authenticated user.
//
// The rule was written in two documents and enforced by nobody.
import test from "node:test";
import assert from "node:assert/strict";

import { clientSourceFiles, usesPostgresChanges } from "../check-realtime-broadcast-only.mjs";

test("a postgres_changes subscription is caught", () => {
  assert.ok(usesPostgresChanges('.on("postgres_changes", { event: "*" }, handler)'));
});

test("the spellings someone would actually reach for are all caught", () => {
  // The wire value supabase-js expects, plus the shapes a helper or a hyphenated constant takes.
  for (const line of [
    'channel.on("postgres_changes", {}, fn)',
    "channel.on('POSTGRES_CHANGES', {}, fn)",
    'const EVENT = "postgres-changes";',
    "subscribeTo({ type: postgresChanges })",
  ]) {
    assert.ok(usesPostgresChanges(line), `should be flagged: ${line}`);
  }
});

test("a broadcast subscription is exactly what SHOULD pass", () => {
  assert.ok(!usesPostgresChanges('.on("broadcast", { event: "invalidate" }, handler)'));
});

test("a comment ABOUT the rule is not a violation of it", () => {
  // The guard must not flag the comments that keep the decision legible, or the first thing
  // anyone does is delete the explanation.
  for (const line of [
    "// no postgres_changes subscriptions — broadcast only",
    "  /* postgres_changes would need an RLS hole */",
    "// See CLAUDE.md: no Postgres-Changes subscriptions.",
  ]) {
    assert.ok(!usesPostgresChanges(line), `should NOT be flagged: ${line}`);
  }
});

test("code with a trailing comment is still judged on its code", () => {
  // The inverse of the case above: stripping comments must not become a way to hide the call.
  assert.ok(usesPostgresChanges('.on("postgres_changes", {}, fn) // temporary, honest'));
});

test("ordinary words are not mistaken for it", () => {
  for (const line of [
    'const changes = "postgres";',
    "// database changes",
    "postgresPool.query()",
  ]) {
    assert.ok(!usesPostgresChanges(line), `should NOT be flagged: ${line}`);
  }
});

test("the scan reaches the client code that could contain a subscription", () => {
  // Non-vacuity: a file list that silently came back empty would report broadcast-only forever.
  const files = clientSourceFiles();
  assert.ok(files.length > 20, `only found ${files.length} client files`);
  assert.ok(files.includes("packages/core/src/realtime.ts"), "the realtime module is not scanned");
  assert.ok(
    files.some((f) => /^products\/[^/]+\/app\//.test(f)),
    "no product app files are scanned",
  );
});

test("the API is NOT scanned — it holds the service role legitimately", () => {
  // The API broadcasts over the service-role HTTP endpoint by design; scanning it would flag
  // the very implementation the rule prescribes.
  assert.ok(!clientSourceFiles().some((f) => /\/api\//.test(f)));
});
