#!/usr/bin/env node
// scripts/check-semantic-tokens.mjs — enforce the LOCKED theming rule (PHILOSOPHY / CLAUDE.md):
// "NEVER name a color in a component — tokens only (bg-primary, not hex). A brand is a
// token-VALUE override, never forked components."
//
// The whole multi-brand mechanism rests on it: a product is re-branded by swapping token VALUES
// in its theme, with ZERO component edits. One hardcoded `#3b82f6` in a component silently opts
// that element out — it keeps the old brand's colour in every product, in both light and dark
// mode, and the only way to notice is to look at it. Nothing checked for this.
//
// Deliberately narrow, so it stays believable:
//   - only COMPONENT source is scanned (packages/ui components, each app's app/ and features/)
//   - `theme.ts` and `global.css` are where token VALUES are SUPPOSED to live, and app.config.ts
//     is Expo's native splash/icon config, which cannot use CSS variables — all excluded
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Component source only.
const SCANNED = [
  /^packages\/ui\/src\/.*\.tsx?$/,
  /^products\/[^/]+\/app\/app\/.*\.tsx?$/,
  /^products\/[^/]+\/app\/features\/.*\.tsx?$/,
];

// Where colour VALUES legitimately live.
const EXEMPT = [
  /(^|\/)theme\.ts$/, // generated token values (figma-tokens.mjs)
  /(^|\/)app\.config\.ts$/, // Expo native config: splash/icon colours cannot be CSS vars
  /\.stories\.tsx$/, // workbench fixtures, not shipped UI
  /\.figma\.tsx$/, // Code Connect maps
];

// A hex literal, or a raw colour function. `hsl(var(--x))` is the SANCTIONED form — that is a
// token reference, not a named colour — so it is explicitly allowed.
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RAW_COLOR_FN = /\b(?:rgba?|hsla?)\(\s*(?!var\()/;

// packages/ui/CLAUDE.md states the invariant as "No hex, no rgb(), no RAW TAILWIND PALETTE
// COLORS". `bg-blue-500` opts out of the brand exactly as thoroughly as `#3b82f6`, and is far
// likelier to be written by accident because it looks like an ordinary utility class.
const TAILWIND_PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|shadow|outline|decoration|divide|accent|caret|placeholder)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((f) => SCANNED.some((re) => re.test(f)))
  .filter((f) => !EXEMPT.some((re) => re.test(f)));

const findings = [];
for (const file of files) {
  readFileSync(join(ROOT, file), "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
      if (HEX.test(line) || RAW_COLOR_FN.test(line) || TAILWIND_PALETTE.test(line)) {
        findings.push(`${file}:${i + 1}: ${line.trim()}`);
      }
    });
}

if (findings.length > 0) {
  console.error("");
  console.error("❌ Hardcoded colour in a component — use a semantic token instead:");
  for (const f of findings) console.error(`     ${f}`);
  console.error("");
  console.error("   A brand is a token-VALUE override, never a forked component. A named colour");
  console.error("   here keeps one brand's value in every product, in light AND dark mode, and");
  console.error("   the only way to notice is to look at it. Use bg-primary / text-foreground /");
  console.error("   border-border etc., or add a token if none fits.");
  process.exit(1);
}

console.log(`check-semantic-tokens: ${files.length} component file(s) scanned, no named colours`);
