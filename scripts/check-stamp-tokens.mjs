#!/usr/bin/env node
// scripts/check-stamp-tokens.mjs — no stamped product may carry the TEMPLATE's tokens.
//
// The generator rewrites WHOLE-WORD tokens (`template`, `Template`, `template_api`). Anything that
// embeds a token inside a longer identifier slips straight through: `template_api_test` is not
// whole-word `template_api`, so it was copied verbatim into every stamped product and each one
// documented the template's database name. That survived in the repo until it was found by hand.
//
// CLAUDE.md tells you to audit a stamp with `git grep -i template products/<name>`. This is that
// audit, enforced, for every product, on every push and every CI run — so the next embedded token
// is caught the day it is written instead of years later.
//
// Deliberately narrow to keep it honest: it matches the token followed by a word separator
// (`template_api`, `template-app`, `template_api_test`) or by an uppercase letter (`TemplateCard`),
// NOT the ordinary English word. A product is free to have an email `template`, a `templates/`
// directory, the plural `Templates`, or the word in prose.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_DIR = "products/_template";

// `template` or `Template` immediately followed by - or _ and more word characters.
const LEAKED_TOKEN = /\btemplate[-_]\w+/i;

// PascalCase compounds need their own pattern, and they are the sneakier half. The generator
// rewrites `\bTemplate\b`, which cannot match before another word character — so `TemplateCard`
// or `TemplateProps` survives stamping intact, and the kebab/snake pattern above does not see it
// either (there is no - or _ to anchor on). Case-SENSITIVE on purpose: `Templates` is the English
// plural and must stay legal.
const LEAKED_PASCAL = /\bTemplate[A-Z]\w*/;

// Binary-ish files git tracks that are pointless (and noisy) to scan as text.
const SKIP_EXT = /\.(png|jpg|jpeg|gif|ico|webp|pdf|ttf|otf|woff2?|keystore|patch)$/i;

if (!existsSync(join(ROOT, "products"))) {
  console.log("check-stamp-tokens: no products/ directory");
  process.exit(0);
}

/** Exported so the rule itself is testable without touching the filesystem. */
export function leaksTemplateToken(line) {
  return LEAKED_TOKEN.test(line) || LEAKED_PASCAL.test(line);
}

function main() {
  const files = execFileSync("git", ["ls-files", "products"], { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    // The template is where the tokens are SUPPOSED to live.
    .filter((f) => !f.startsWith(`${TEMPLATE_DIR}/`))
    .filter((f) => !SKIP_EXT.test(f));

  const leaks = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(join(ROOT, file), "utf8");
    } catch {
      continue; // unreadable/binary — nothing to assert
    }
    text.split(/\r?\n/).forEach((line, i) => {
      if (leaksTemplateToken(line)) leaks.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }

  if (leaks.length > 0) {
    console.error("");
    console.error("❌ Template token leaked into a stamped product:");
    for (const leak of leaks) console.error(`     ${leak}`);
    console.error("");
    console.error("   The generator only rewrites WHOLE-WORD tokens, so an embedded one is copied");
    console.error("   verbatim. Fix it in products/_template (keep the token word-delimited, e.g.");
    console.error('   "template_api" + "_suffix"), then re-stamp the product.');
    process.exit(1);
  }

  console.log(`check-stamp-tokens: ${files.length} stamped file(s) scanned, no template tokens`);
}

// Guarded so importing this module (to test the rules) does not run the scan or exit the process.
if (
  process.argv[1] &&
  process.argv[1]
    .split(String.fromCharCode(92))
    .join("/")
    .endsWith("scripts/check-stamp-tokens.mjs")
) {
  main();
}
