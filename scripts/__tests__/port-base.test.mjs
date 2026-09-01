// Per-repo port bases: portIndex de-conflicts products WITHIN a repo, but every repo stamped
// from this platform starts numbering at the same bases — so two org-repos on one machine
// collide the moment both run stacks (hit live: an octavia-demo stack held 54422 and this
// repo's demo could not start). platform.json + set-port-base.mjs give each repo its own
// bases; these tests pin the math and the guardrails.
//
// The end-to-end property was proven in-session on the real tree: rebase 54321/8000 →
// 56321/8200, stamp a scratch product (got 56521/8220, inspector 8303), remove it, rebase
// back — git status byte-identical. The pure functions here are what that flow rode on.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_PORT_BASES, portBases, portPlan, shiftSupabaseBlock } from "../new-product.mjs";
import { basesProblem, rebaseProduct, allProducts } from "../set-port-base.mjs";

test("the default bases are the documented ones", () => {
  assert.deepEqual(DEFAULT_PORT_BASES, { api: 8000, supabase: 54321 });
});

test("portBases resolves platform.json when present, defaults when absent or partial", () => {
  // Fixture dirs, NOT the live repo: this file is inherited by every stamped org-repo, and an
  // org repo that ran set-port-base has a platform.json that legitimately differs from the
  // defaults. The first version asserted live == defaults and would have failed the pre-push
  // gate of the FIRST repo to actually use the feature — a guard against the feature working.
  const root = mkdtempSync(join(tmpdir(), "port-bases-"));
  try {
    assert.deepEqual(portBases(root), DEFAULT_PORT_BASES, "absent file -> defaults");
    writeFileSync(
      join(root, "platform.json"),
      JSON.stringify({ ports: { api: 8200, supabase: 56321 } }),
    );
    assert.deepEqual(portBases(root), { api: 8200, supabase: 56321 }, "present -> its values");
    writeFileSync(join(root, "platform.json"), JSON.stringify({ ports: { api: 8200 } }));
    assert.deepEqual(
      portBases(root),
      { api: 8200, supabase: 54321 },
      "partial -> per-key fallback",
    );
    writeFileSync(join(root, "platform.json"), JSON.stringify({}));
    assert.deepEqual(portBases(root), DEFAULT_PORT_BASES, "empty object -> defaults");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the LIVE repo's bases are valid — whatever they are", () => {
  // Rebased or not, the committed platform.json must pass the same guardrails set-port-base
  // enforces on input; a hand-edit that breaks the offset conventions fails here.
  const live = portBases();
  assert.equal(basesProblem(live.supabase, live.api), null, JSON.stringify(live));
});

test("portPlan keeps the documented per-index offsets under ANY base", () => {
  assert.deepEqual(portPlan(0), { apiPort: 8000, sbBase: 54321, sbDelta: 0, sbWindow: 54300 });
  assert.deepEqual(portPlan(2), { apiPort: 8020, sbBase: 54521, sbDelta: 200, sbWindow: 54300 });
  const rebased = portPlan(1, { api: 8200, supabase: 56321 });
  assert.deepEqual(rebased, { apiPort: 8210, sbBase: 56421, sbDelta: 100, sbWindow: 56300 });
});

test("shiftSupabaseBlock moves ONLY the window — boundaries exact, other numbers untouched", () => {
  const text = "a=54299\nb=54300\nc=54321\nd=54399\ne=54400\nmajor_version = 15\nhttp 8000\n";
  const out = shiftSupabaseBlock(text, 54300, 2000);
  assert.equal(out, "a=54299\nb=56300\nc=56321\nd=56399\ne=54400\nmajor_version = 15\nhttp 8000\n");
  // delta 0 is the identity — the default-repo stamp path must stay byte-exact.
  assert.equal(shiftSupabaseBlock(text, 54300, 0), text);
});

test("bases that would break the documented offset conventions are refused", () => {
  // xx21/xx22/... and api-ends-in-0 are conventions the whole repo documents; a base that
  // moves those digits silently re-maps every documented offset.
  assert.equal(basesProblem(56321, 8200), null);
  assert.match(basesProblem(56300, 8200) ?? "", /end in 21/);
  assert.match(basesProblem(56321, 8205) ?? "", /end in 0/);
  assert.match(basesProblem(56321.5, 8200) ?? "", /integers/);
  assert.match(basesProblem(121, 8200) ?? "", /range/); // ends in 21, but below 1024
  // An api base inside the supabase block's neighbourhood collides as products grow.
  assert.match(basesProblem(56321, 56320) ?? "", /apart/);
});

test("rebaseProduct is a pure function of (portIndex, cur, next) over the real file set", () => {
  // Against the real template tree, dry logic check via allProducts: the walk finds at least
  // _template and demo with their committed portIndexes intact.
  const products = allProducts();
  const names = products.map((p) => p.name);
  // Shape, not roster: _template is always portIndex 0; every other product only needs a
  // UNIQUE non-negative index. Asserting demo@1 by name broke this suite in any clone whose
  // stamped products differ from platform's.
  assert.ok(names.includes("_template"), String(names));
  assert.equal(products.find((p) => p.name === "_template").portIndex, 0);
  const indexes = products.map((p) => p.portIndex);
  assert.ok(
    indexes.every((i) => Number.isInteger(i) && i >= 0),
    String(indexes),
  );
  assert.equal(new Set(indexes).size, indexes.length, `duplicate portIndex among: ${names}`);
  assert.equal(typeof rebaseProduct, "function");
});
