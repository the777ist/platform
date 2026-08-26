// The token rewrite in new-product.mjs is the single most leveraged logic in this repo: every
// product that will ever exist is produced by it, and a mistake is stamped permanently into that
// product's package names, Python module, fly apps, supabase project id and realtime channel.
//
// It had no tests. It was exercised ~15 times by hand during this branch, which proves it works
// today and nothing about tomorrow.
import test from "node:test";
import assert from "node:assert/strict";

import { buildReplacers, isText, rewriteContents, toPascal, toSnake } from "../new-product.mjs";

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
