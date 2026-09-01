#!/usr/bin/env node
// scripts/check-theme-tokens.mjs — the "Token coverage test" BUILDOUT.md §7 asks for, which it
// describes as a wave-0 gate ("retrofitting them across 90+ components is not fun").
//
// It exists because the theming contract is spread across four kinds of file that nothing forced
// to agree:
//
//   packages/config/tailwind-preset.cjs   declares the semantic NAMES -> var() bindings
//   packages/ui/figma/tokens.json         the source of truth for the VALUES
//   packages/ui/src/lib/theme.ts          generated native values (NativeWind vars())
//   packages/ui/src/global.css            generated web values (:root / .dark:root)
//   products/<p>/app/global.css           per-product copies, hand-maintained today
//
// The hole this closes was real and shipping: the preset bound --accent, --popover and --radius,
// and NO layer defined them. Button, Card and Input all use rounded-md/rounded-lg, which the
// preset maps to calc(var(--radius) - 2px) — so every rounded corner in the design system
// resolved against an undefined variable. BUILDOUT.md §7 names that exact hole. A var with no
// value does not throw: it renders as nothing, in one theme or on one platform, and looks like a
// design choice.
//
// Three rules, because each catches a different way the contract rots:
//   1. COVERAGE  every var() the preset references has a value in BOTH light and dark.
//   2. PARITY    light and dark define the identical key set — a token present in one mode only
//                is invisible in the other, which is the hardest theming bug to see.
//   3. AGREEMENT every global.css matches theme.ts exactly, keys AND values. Web and native read
//                different files for the same token; nothing regenerates the product copies, so
//                a /sync-tokens that updates packages/ui silently leaves each product behind.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- parsers, exported so the rules are testable against fixture STRINGS, no filesystem --------

/**
 * Every `--x` the preset resolves through var(), including inside calc().
 * Comments are stripped first: the preset's own docblock spells out `hsl(var(--x))` as an
 * example, and a gate that demands a value for a variable named in prose is a gate people
 * learn to work around.
 */
export function presetVars(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return new Set([...code.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g)].map((m) => m[1]));
}

// One literal per mode. Built as literals rather than `new RegExp(\`${mode}...\`)` on purpose:
// the escaping in a dynamically built pattern is invisible to every linter here, and a pattern
// that silently matches nothing turns this whole gate into a no-op that reports success.
const THEME_BLOCK = {
  light: /light:\s*vars\(\{([\s\S]*?)\}\)/,
  dark: /dark:\s*vars\(\{([\s\S]*?)\}\)/,
};
const THEME_ENTRY = /"(--[a-zA-Z0-9-]+)"\s*:\s*"([^"]*)"/g;

/** `light: vars({...})` / `dark: vars({...})` from theme.ts -> { light: Map, dark: Map }. */
export function themeVars(source) {
  const out = {};
  for (const mode of ["light", "dark"]) {
    const block = source.match(THEME_BLOCK[mode]);
    out[mode] = new Map(block ? [...block[1].matchAll(THEME_ENTRY)].map((m) => [m[1], m[2]]) : []);
  }
  return out;
}

/**
 * `:root {...}` / `.dark:root {...}` from a global.css -> { light: Map, dark: Map }.
 * The light selector is matched only after whitespace/{/; so that `.dark:root` — which CONTAINS
 * the substring `:root` — cannot be mistaken for it.
 */
export function cssVars(source) {
  const grab = (re) => {
    const m = source.match(re);
    return new Map(
      m
        ? [...m[1].matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()])
        : [],
    );
  };
  return {
    light: grab(/(?:^|[\s{;]):root\s*\{([^}]*)\}/m),
    dark: grab(/\.dark:root\s*\{([^}]*)\}/m),
  };
}

/**
 * The generated files must still match what the SOURCE produces.
 *
 * CLAUDE.md: "Token VALUES are authored ONLY in packages/ui/figma/tokens.json ... never
 * hand-edit generated theme values." Nothing enforced it. A value hand-edited consistently
 * across theme.ts and every global.css satisfied all three rules above — they check the copies
 * against each other, never against their source — so the committed design system could differ
 * from the tokens it is supposedly generated from, and the next /sync-tokens would silently
 * revert somebody's brand change with no explanation.
 *
 * Regenerates and compares, then restores the files, so the check itself has no side effects.
 */
export function generatedFilesMatchSource(root = ROOT) {
  const outputs = ["packages/ui/src/lib/theme.ts", "packages/ui/src/global.css"];
  const before = outputs.map((f) => readFileSync(join(root, f), "utf8"));
  try {
    execFileSync("node", ["scripts/figma-tokens.mjs"], { cwd: root, stdio: "ignore" });
    return outputs.filter((f, i) => readFileSync(join(root, f), "utf8") !== before[i]);
  } finally {
    outputs.forEach((f, i) => writeFileSync(join(root, f), before[i]));
  }
}

/** Compare two token maps -> the three ways they can disagree. */
export function diffTokens(expected, actual) {
  const missing = [...expected.keys()].filter((k) => !actual.has(k));
  const extra = [...actual.keys()].filter((k) => !expected.has(k));
  const mismatched = [...expected.entries()]
    .filter(([k, v]) => actual.has(k) && actual.get(k) !== v)
    .map(([k, v]) => `${k}: expected "${v}", found "${actual.get(k)}"`);
  return { missing, extra, mismatched };
}

// --- the gate ----------------------------------------------------------------------------------

function main() {
  const read = (p) => readFileSync(join(ROOT, p), "utf8");
  const PRESET = "packages/config/tailwind-preset.cjs";
  const THEME = "packages/ui/src/lib/theme.ts";
  const UI_CSS = "packages/ui/src/global.css";

  const problems = [];
  const declared = presetVars(read(PRESET));
  const theme = themeVars(read(THEME));

  // 1. COVERAGE — every declared var has a value in both modes.
  for (const mode of ["light", "dark"]) {
    const undefinedVars = [...declared].filter((v) => !theme[mode].has(v)).sort();
    if (undefinedVars.length > 0) {
      problems.push(
        `${THEME} (${mode}) has no value for ${undefinedVars.length} var(s) the preset binds: ${undefinedVars.join(", ")}`,
      );
    }
  }

  // 2. PARITY — the two modes define the same names.
  const onlyLight = [...theme.light.keys()].filter((k) => !theme.dark.has(k));
  const onlyDark = [...theme.dark.keys()].filter((k) => !theme.light.has(k));
  if (onlyLight.length || onlyDark.length) {
    problems.push(
      `${THEME}: light and dark define different tokens` +
        (onlyLight.length ? ` — light-only: ${onlyLight.join(", ")}` : "") +
        (onlyDark.length ? ` — dark-only: ${onlyDark.join(", ")}` : ""),
    );
  }

  // 3. AGREEMENT — every global.css matches theme.ts, in both modes.
  const cssFiles = execFileSync("git", ["ls-files", "*global.css"], { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    // `git ls-files` lists TRACKED paths, including files deleted from disk but not yet staged
    // (mid-`/remove-product`). Reading those used to throw a raw ENOENT out of the guard; on a
    // clean checkout (CI) tracked == on-disk, so skipping the missing ones never hides anything.
    .filter((f) => existsSync(join(ROOT, f)));
  if (!cssFiles.includes(UI_CSS)) problems.push(`expected ${UI_CSS} to be tracked by git`);
  for (const file of cssFiles) {
    const css = cssVars(read(file));
    for (const mode of ["light", "dark"]) {
      const { missing, extra, mismatched } = diffTokens(theme[mode], css[mode]);
      if (missing.length) problems.push(`${file} (${mode}) is missing: ${missing.join(", ")}`);
      if (extra.length)
        problems.push(`${file} (${mode}) defines tokens theme.ts does not: ${extra.join(", ")}`);
      for (const m of mismatched) problems.push(`${file} (${mode}) disagrees with theme.ts — ${m}`);
    }
  }

  // 4. SOURCE — the generated files still match what tokens.json produces.
  for (const stale of generatedFilesMatchSource()) {
    problems.push(
      `${stale} does not match packages/ui/figma/tokens.json — it was hand-edited, or the ` +
        `source changed without a regen`,
    );
  }

  if (problems.length > 0) {
    console.error("");
    console.error("❌ Theme token contract broken:");
    for (const p of problems) console.error(`     ${p}`);
    console.error("");
    console.error("   Token VALUES are authored in packages/ui/figma/tokens.json and generated");
    console.error(
      "   into theme.ts + global.css by `node scripts/figma-tokens.mjs` (/sync-tokens).",
    );
    console.error("   Never hand-edit the generated files; fix the source and regenerate, then");
    console.error("   copy packages/ui/src/global.css over each products/<p>/app/global.css.");
    process.exit(1);
  }

  console.log(
    `check-theme-tokens: ${declared.size} preset var(s) resolved in light+dark, ` +
      `${cssFiles.length} global.css file(s) agree with theme.ts`,
  );
}

// Guarded so importing this module (to test the parsers) does not run the gate or exit the process.
if (
  process.argv[1] &&
  process.argv[1]
    .split(String.fromCharCode(92))
    .join("/")
    .endsWith("scripts/check-theme-tokens.mjs")
) {
  if (!existsSync(join(ROOT, "packages/ui/src/lib/theme.ts"))) {
    console.log("check-theme-tokens: no packages/ui theme — skipping");
    process.exit(0);
  }
  main();
}
