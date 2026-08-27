// The theme gate is the only thing standing between the design system and a token that renders
// as nothing. Its rules are only as good as its PARSERS: a pattern that silently matches nothing
// makes the whole gate report success over a broken contract — which is exactly what happened
// while writing it (a dynamically built RegExp lost its escaping and reported every token as
// undefined, then, once "fixed" the wrong way, would have reported none).
//
// So the parsers are tested against fixture STRINGS written out here. The expected values live in
// this file, never imported from the module under test.
import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  presetVars,
  themeVars,
  cssVars,
  diffTokens,
  generatedFilesMatchSource,
} from "../check-theme-tokens.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("preset vars are collected from every position, including inside calc()", () => {
  const preset = `
    // docs mention hsl(var(--example)) in prose
    /* and a block comment with var(--blockdoc) */
    module.exports = {
      theme: { extend: {
        colors: { ring: "hsl(var(--ring))", primary: { DEFAULT: "hsl(var(--primary))" } },
        borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)" },
      } },
    };`;
  assert.deepEqual([...presetVars(preset)].sort(), ["--primary", "--radius", "--ring"]);
});

test("a var named only in a comment is not demanded of the theme", () => {
  // The real preset documents the convention as `hsl(var(--x))`. Requiring a value for `--x`
  // would make the gate wrong on day one, and a gate that cries wolf gets bypassed.
  assert.equal(presetVars("// see hsl(var(--x)) for the form").size, 0);
  assert.equal(presetVars("/* var(--y) */").size, 0);
});

test("theme.ts yields both modes with their values", () => {
  const theme = `
    import { vars } from "nativewind";
    export const themes = {
      light: vars({
        "--background": "0 0% 100%",
        "--radius": "8px",
      }),
      dark: vars({
        "--background": "240 10% 4%",
        "--radius": "8px",
      }),
    } as const;`;
  const parsed = themeVars(theme);
  assert.deepEqual(
    [...parsed.light],
    [
      ["--background", "0 0% 100%"],
      ["--radius", "8px"],
    ],
  );
  assert.equal(parsed.dark.get("--background"), "240 10% 4%");
  // The light block must NOT bleed into dark: a lazy match reaching the wrong `})` would make
  // both modes look identical and hide every parity bug the gate exists to catch.
  assert.notEqual(parsed.light.get("--background"), parsed.dark.get("--background"));
});

test("a theme with no recognisable block yields empty maps rather than throwing", () => {
  const parsed = themeVars("export const themes = {} as const;");
  assert.equal(parsed.light.size, 0);
  assert.equal(parsed.dark.size, 0);
});

test("global.css splits :root from .dark:root", () => {
  const css = `
    @layer base {
      :root {
        --background: 0 0% 100%;
        --radius: 8px;
      }
      .dark:root {
        --background: 240 10% 4%;
        --radius: 8px;
      }
    }`;
  const parsed = cssVars(css);
  // The trap: `.dark:root` CONTAINS the substring `:root`. A naive pattern matches the dark
  // block as if it were light, so every product reads as "light == dark" and the gate goes
  // green while dark mode is unthemed.
  assert.equal(parsed.light.get("--background"), "0 0% 100%");
  assert.equal(parsed.dark.get("--background"), "240 10% 4%");
  assert.equal(parsed.light.get("--radius"), "8px");
});

test("`.dark:root` is never mistaken for `:root`, whatever order the blocks appear in", () => {
  // The trap: `.dark:root` CONTAINS the substring `:root`, so a pattern without a boundary
  // guard matches it. Ordering hides this — with light written first, the naive pattern finds
  // the light block anyway and looks correct. So the fixture puts DARK FIRST, which is the only
  // arrangement that can tell the two patterns apart. If light silently read the dark block,
  // every product would compare light-against-dark and the gate would go green on an unthemed
  // dark mode.
  const darkFirst = `
    @layer base {
      .dark:root { --background: 240 10% 4%; }
      :root { --background: 0 0% 100%; }
    }`;
  const parsed = cssVars(darkFirst);
  assert.equal(parsed.light.get("--background"), "0 0% 100%");
  assert.equal(parsed.dark.get("--background"), "240 10% 4%");
});

test("a css value with internal spaces survives intact", () => {
  // HSL channel triplets are the normal case; trimming or splitting on whitespace would
  // quietly turn "240 6% 10%" into something that no longer compares equal to theme.ts.
  const parsed = cssVars(":root {\n  --primary: 240 6% 10%;\n}");
  assert.equal(parsed.light.get("--primary"), "240 6% 10%");
});

test("diffTokens separates missing, extra and mismatched", () => {
  const expected = new Map([
    ["--a", "1"],
    ["--b", "2"],
    ["--c", "3"],
  ]);
  const actual = new Map([
    ["--a", "1"],
    ["--b", "999"],
    ["--d", "4"],
  ]);
  const { missing, extra, mismatched } = diffTokens(expected, actual);
  assert.deepEqual(missing, ["--c"]);
  assert.deepEqual(extra, ["--d"]);
  assert.equal(mismatched.length, 1);
  assert.match(mismatched[0], /--b/);
  // A value difference must NOT also be reported as missing — the three lists are how you tell
  // "nobody generated this" apart from "web and native drifted".
  assert.ok(!missing.includes("--b"));
});

test("identical maps produce no findings", () => {
  const m = () => new Map([["--a", "1"]]);
  const { missing, extra, mismatched } = diffTokens(m(), m());
  assert.deepEqual([missing, extra, mismatched], [[], [], []]);
});

test("the generated files match the token SOURCE, not just each other", () => {
  assert.deepEqual(generatedFilesMatchSource(), []);
});

test("a hand-edited generated file IS detected", () => {
  // Asserting "no drift" on a clean tree proves nothing — it passes just as well when the check
  // is stubbed to return nothing, which is how the first version of this test was written.
  // Drift has to be planted for the assertion to mean anything.
  //
  // The failure being pinned: the three rules above compare the generated copies against ONE
  // ANOTHER, so a value hand-edited consistently across theme.ts and every global.css satisfied
  // all of them while the committed design system differed from the tokens it is generated from.
  const file = join(REPO, "packages/ui/src/lib/theme.ts");
  const original = readFileSync(file, "utf8");
  try {
    writeFileSync(file, original.replace("0 84% 60%", "9 99% 61%"));
    assert.ok(
      generatedFilesMatchSource().includes("packages/ui/src/lib/theme.ts"),
      "a hand-edited theme.ts was not reported as drift",
    );
  } finally {
    writeFileSync(file, original);
  }
});

test("it REPORTS drift without silently fixing it", () => {
  // The check regenerates in place to compare, so it must put the developer's file back — both
  // so the guard has no side effects, and so what it found is still there to look at. On a clean
  // tree a missing restore is invisible (the regenerated bytes match), so this too needs drift
  // planted to be a real test.
  const file = join(REPO, "packages/ui/src/lib/theme.ts");
  const original = readFileSync(file, "utf8");
  const edited = original.replace("0 84% 60%", "9 99% 61%");
  try {
    writeFileSync(file, edited);
    generatedFilesMatchSource();
    assert.equal(readFileSync(file, "utf8"), edited, "the check overwrote the file it was judging");
  } finally {
    writeFileSync(file, original);
  }
});
