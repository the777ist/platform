// The token rewrite in new-product.mjs is the single most leveraged logic in this repo: every
// product that will ever exist is produced by it, and a mistake is stamped permanently into that
// product's package names, Python module, fly apps, supabase project id and realtime channel.
//
// It had no tests. It was exercised ~15 times by hand during this branch, which proves it works
// today and nothing about tomorrow.
import test from "node:test";
import assert from "node:assert/strict";

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildReplacers,
  checklistText,
  isText,
  rewriteContents,
  toPascal,
  toSnake,
} from "../new-product.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");

const as = (name, text, file = "x.ts") => rewriteContents(file, text, buildReplacers(name));

test("kebab names convert to the Pascal and snake forms the stamp needs", () => {
  assert.equal(toPascal("demo"), "Demo");
  assert.equal(toSnake("demo"), "demo");
  // Multi-word products are the case that actually exercises the conversion.
  assert.equal(toPascal("my-app"), "MyApp");
  assert.equal(toSnake("my-app"), "my_app");
});

test("each token form is rewritten", () => {
  assert.equal(as("demo", "@platform/template-app"), "@platform/demo-app");
  assert.equal(as("demo", "from template_api.main import app"), "from demo_api.main import app");
  assert.equal(as("demo", "export const Template = () => null"), "export const Demo = () => null");
  assert.equal(as("demo", 'channel: "template:realtime"'), 'channel: "demo:realtime"');
});

test("a path self-reference is rewritten even though _ is a word character", () => {
  // `\btemplate\b` cannot match inside `_template`, so this needs its own rule — and it would
  // not be caught by `git grep -iw` either. That is why the replacer list has a path entry.
  assert.equal(as("demo", "see products/_template/api"), "see products/demo/api");
});

test("words that merely CONTAIN template are left alone", () => {
  for (const word of ["templates", "templated", "templating", "TEMPLATES"]) {
    assert.equal(as("demo", `a ${word} thing`), `a ${word} thing`, word);
  }
});

test("a literal `template =` KEY in TOML survives the rewrite", () => {
  // supabase's config.toml has OTP message-template keys named `template`. Rewriting them
  // produces a config the CLI rejects outright ("'auth.sms' has invalid keys").
  const toml = 'template = "Your code is {{ .Code }}"';
  assert.equal(as("demo", toml, "config.toml"), toml);
});

test("but a real token in the same TOML file IS rewritten", () => {
  // The key guard must be surgical, not a blanket skip for .toml files.
  assert.equal(
    as("demo", 'project_id = "example-template"', "config.toml"),
    'project_id = "example-demo"',
  );
});

test("multi-word product names produce valid identifiers throughout", () => {
  assert.equal(as("my-app", "@platform/template-api"), "@platform/my-app-api");
  // The Python module must be snake_case; a kebab module name would not be importable.
  assert.equal(as("my-app", "import template_api"), "import my_app_api");
});

test("KNOWN LIMIT: an embedded token is NOT rewritten — this is why the stamp guard exists", () => {
  // `\btemplate_api\b` cannot match inside `template_api_test`, because `_` is a word character.
  // This is not a bug being asserted as correct; it is the documented boundary of a whole-word
  // rewrite, and it is exactly the shape that put the template's database name into every
  // stamped product. scripts/check-stamp-tokens.mjs exists to catch what this cannot fix, and
  // _template must keep such tokens word-delimited.
  assert.equal(as("demo", "template_api_test"), "template_api_test");
});

test("KNOWN LIMIT: a PascalCase compound is NOT rewritten either", () => {
  // `\bTemplate\b` cannot match before another word character, so `TemplateCard` survives the
  // stamp with the template's name welded into a public symbol. No such identifier exists in
  // _template today; this test is what keeps the boundary documented rather than rediscovered.
  // It is the SNEAKIER half of the whole-word limit: the kebab/snake guard pattern has nothing
  // to anchor on here (no - or _), which is why check-stamp-tokens carries a second pattern.
  assert.equal(
    as("demo", "export function TemplateCard() {}"),
    "export function TemplateCard() {}",
  );
});

test("text files are rewritten and binaries are not", () => {
  for (const path of ["a.ts", "a.py", "a.toml", "a.sql", "a.mako", "uv.lock", "Dockerfile"]) {
    assert.ok(isText(path), `${path} must be rewritten`);
  }
  for (const path of ["icon.png", "splash.jpg", "font.woff2"]) {
    assert.ok(!isText(path), `${path} must be copied verbatim`);
  }
});

test("every _template python line keeps E501 headroom for a 20-char product name", () => {
  // The stamp rewrites tokens IN PLACE, so a line's length grows by (len(name) - len("template"))
  // per occurrence — and ruff's line-length 100 gates the stamped repo's very first commit.
  // Proven by a real stamp: "application" (11 chars, +3 per token) pushed two 99-char template
  // lines to 102+ and the new product failed ruff before its first commit. prettier auto-fixes
  // the JS side in the pre-commit hook; ruff does NOT fix E501, so python is the failure class.
  // 20 chars is the supported ceiling this test enforces — longer names may need manual wrapping.
  const longName = "x".repeat(20);
  const replacers = buildReplacers(longName);
  const templateDir = join(ROOT, "products", "_template");
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".venv") walk(p);
      } else if (entry.name.endsWith(".py")) {
        const stamped = rewriteContents(entry.name, readFileSync(p, "utf8"), replacers);
        stamped.split("\n").forEach((line, i) => {
          // ruff's E501 exempts lines carrying a pragma comment (# noqa / # pyright: / # type:)
          // — proven empirically: a 119-char pyright-ignore line passes `ruff check --select
          // E501` in this repo today. Mirror that, or this guard fails lines ruff never will.
          if (/#\s*(noqa|pyright:|type:)/.test(line)) return;
          if (line.length > 100) offenders.push(`${relative(ROOT, p)}:${i + 1} (${line.length})`);
        });
      }
    }
  };
  walk(templateDir);
  assert.deepEqual(
    offenders,
    [],
    `lines that break E501 when stamped as "${longName}":\n${offenders.join("\n")}`,
  );
});

test("the checklist banner prints the ports the stamp actually used, bases included", () => {
  // Regression: the banner recomputed 8000+10i / 54321+100i from the DEFAULTS while the stamp
  // used portPlan(portBases()) — in a rebased repo the printed first-run steps targeted a stack
  // that did not exist. The banner must flow through the same plan as the stamped files.
  const rebased = checklistText("thing", 2, { api: 8200, supabase: 56321 });
  assert.ok(rebased.includes("http://localhost:8220"), rebased.split("\n")[2]);
  assert.ok(rebased.includes("Supabase block base 56521"), rebased.split("\n")[2]);
  assert.ok(!rebased.includes("8020"), "default-base api port leaked into a rebased banner");
});
