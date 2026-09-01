// The migration-safety gate lints the SQL that production will actually run (alembic offline
// mode) for lock-taking DDL. Its failure mode is a FALSE GREEN: every test suite runs migrations
// against an empty, idle database where any DDL is instantly safe, so a table-locking migration
// looks fine everywhere until it runs as a Fly release_command against a hot production table.
//
// Proven to bite before it was trusted: products/demo/api, still carrying the pre-timeout
// env.py, failed with require-lock-timeout + require-statement-timeout on its REAL migration
// chain — the exact rules the template's env.py fix resolves. These tests keep that bite.
import test from "node:test";
import assert from "node:assert/strict";

import {
  EXCLUDED_RULES,
  relevantFindings,
  lintSql,
  migrationSql,
} from "../check-migration-safety.mjs";
import { allApiDirs } from "../alembic-heads.mjs";

// SQL that mimics what alembic offline mode emits, with env.py's timeouts present so the
// timeout rules stay quiet and the assertion isolates the rule under test.
const migration = (body) =>
  `BEGIN;\nSET lock_timeout = '5s';\nSET statement_timeout = '10min';\n${body}\nCOMMIT;\n`;

test("the excluded-rules list carries a reason for every entry", () => {
  assert.ok(Object.keys(EXCLUDED_RULES).length >= 1);
  for (const [rule, reason] of Object.entries(EXCLUDED_RULES)) {
    assert.ok(typeof reason === "string" && reason.length > 40, `${rule} needs a real reason`);
  }
});

test("relevantFindings drops excluded rules and keeps everything else", () => {
  const excluded = Object.keys(EXCLUDED_RULES)[0];
  const kept = { rule_name: "require-concurrent-index-creation", line: 1, message: "x" };
  const dropped = { rule_name: excluded, line: 2, message: "y" };
  assert.deepEqual(relevantFindings([kept, dropped]), [kept]);
  assert.deepEqual(relevantFindings([dropped]), []);
  assert.deepEqual(relevantFindings([]), []);
});

test("dangerous DDL is caught: non-concurrent index on an existing table", () => {
  // The canonical production foot-gun: CREATE INDEX without CONCURRENTLY takes a SHARE lock that
  // blocks every write for the whole build. On the empty test DB it completes in a millisecond.
  const findings = relevantFindings(
    lintSql(migration("CREATE INDEX idx_item_name ON item (name);")),
  );
  assert.ok(
    findings.some((f) => f.rule_name === "require-concurrent-index-creation"),
    `expected require-concurrent-index-creation, got: ${findings.map((f) => f.rule_name)}`,
  );
});

test("dangerous DDL is caught: NOT NULL column added to an existing table", () => {
  const findings = relevantFindings(
    lintSql(migration("ALTER TABLE item ADD COLUMN flag boolean NOT NULL;")),
  );
  assert.ok(findings.length > 0, "adding a NOT NULL column with no default must be flagged");
});

test("missing timeouts are caught — the rule env.py's SETs exist to satisfy", () => {
  // No SET lock_timeout / statement_timeout before DDL on an existing table. If someone deletes
  // the SETs from alembic/env.py, this is the shape every product's migration SQL degrades to.
  const findings = relevantFindings(
    lintSql("BEGIN;\nALTER TABLE item ADD COLUMN note text;\nCOMMIT;\n"),
  );
  const rules = new Set(findings.map((f) => f.rule_name));
  assert.ok(
    rules.has("require-lock-timeout") && rules.has("require-statement-timeout"),
    `expected both timeout rules, got: ${[...rules]}`,
  );
});

test("safe DDL passes: new table, timeouts set, index on the table created alongside it", () => {
  // squawk tracks tables created in the same migration — DDL on a table nothing can be reading
  // yet is safe, and flagging it would teach people to ignore the gate.
  const findings = relevantFindings(
    lintSql(
      migration(
        "CREATE TABLE widget (id uuid PRIMARY KEY, name text);\n" +
          "CREATE INDEX idx_widget_name ON widget (name);\n" +
          "ALTER TABLE widget ENABLE ROW LEVEL SECURITY;",
      ),
    ),
  );
  assert.deepEqual(findings, [], JSON.stringify(findings, null, 2));
});

test("every real api's migration chain passes the gate today", () => {
  // Against the real tree: the offline SQL each product's fresh database would run. This is the
  // assertion that turns the gate from "exists" into "holds" — and it exercises the full
  // migrationSql -> lintSql path, dummy env vars and all.
  const dirs = allApiDirs();
  // Shape, not roster: _template always exists; which stamped products accompany it varies
  // per clone (demo here, others elsewhere, possibly none at all).
  assert.ok(dirs.includes("products/_template/api"), `no _template api found, got: ${dirs}`);
  for (const dir of dirs) {
    const findings = relevantFindings(lintSql(migrationSql(dir)));
    assert.deepEqual(findings, [], `${dir}: ${JSON.stringify(findings, null, 2)}`);
  }
});

test("the generated SQL actually carries the timeouts env.py promises", () => {
  // The previous test would also pass if squawk lost its timeout rules; this one pins the
  // artifact itself, so the two failure modes stay distinguishable.
  const sql = migrationSql("products/_template/api");
  assert.match(sql, /SET lock_timeout/i);
  assert.match(sql, /SET statement_timeout/i);
});
