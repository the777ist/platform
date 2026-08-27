// /sync-tokens is how a designer's Figma export becomes every colour in every product. It runs
// rarely and by hand, it is in no CI job, and until now nothing checked any of it.
//
// The conversion is the part that can be wrong QUIETLY. A hex that lands on the wrong HSL
// triplet does not throw — it produces a committed diff full of plausible-looking numbers and a
// brand that is subtly off in every product at once. And because the preset consumes bare
// channels through `hsl(var(--x))`, a value emitted in the wrong FORM (with an hsl() wrapper,
// or as hex) yields `hsl(#3b82f6)`, which is not a colour at all: the element renders unstyled
// and looks like a missing token rather than a bad conversion.
import test from "node:test";
import assert from "node:assert/strict";

import { toHslChannels, rgbaToHslChannels, toDtcg, groupByMode } from "../figma-tokens.mjs";

test("hex converts to the bare HSL channel triplet the preset expects", () => {
  // Not `hsl(...)`, not hex. The preset wraps this in hsl(var(--x)), so anything else here
  // produces an invalid colour and an unstyled element.
  assert.equal(toHslChannels("#ffffff"), "0 0% 100%");
  assert.equal(toHslChannels("#000000"), "0 0% 0%");
});

test("the primary hues land where they should", () => {
  // Spot-checked against known values rather than against the implementation: pure red is hue
  // 0, green 120, blue 240, each fully saturated at 50% lightness.
  assert.equal(toHslChannels("#ff0000"), "0 100% 50%");
  assert.equal(toHslChannels("#00ff00"), "120 100% 50%");
  assert.equal(toHslChannels("#0000ff"), "240 100% 50%");
});

test("a real brand colour round-trips to the expected triplet", () => {
  // tailwind blue-500 (#3b82f6) is hsl(217.2 91.2% 59.8%).
  const [h, s, l] = toHslChannels("#3b82f6").split(" ");
  assert.ok(Math.abs(Number(h) - 217.2) < 0.5, `hue was ${h}`);
  assert.equal(s, "91.2%");
  assert.equal(l, "59.8%");
});

test("a value already in channel form is passed through untouched", () => {
  // The committed fixture is authored this way, so re-running the generator must be a no-op
  // rather than a re-conversion that drifts.
  assert.equal(toHslChannels("240 6% 10%"), "240 6% 10%");
  assert.equal(toHslChannels("  0 0% 100%  "), "0 0% 100%");
});

test("an hsl() wrapper is unwrapped to channels", () => {
  assert.equal(toHslChannels("hsl(240 6% 10%)"), "240 6% 10%");
  // Comma form too — Figma plugins emit both.
  assert.equal(toHslChannels("hsl(240, 6%, 10%)"), "240 6% 10%");
});

test("hex is accepted with or without the leading hash", () => {
  assert.equal(toHslChannels("ffffff"), toHslChannels("#ffffff"));
});

test("an unusable value THROWS rather than emitting something plausible", () => {
  // The important direction. Silently emitting "0 0% 0%" for an unrecognised value would ship a
  // black brand and a clean exit code; failing the generator makes a designer's bad export
  // visible while it is still one person's problem.
  for (const bad of ["rgb(1,2,3)", "#12345", "not-a-colour", "", "#gggggg"]) {
    assert.throws(() => toHslChannels(bad), /Unsupported color value/, `should throw: ${bad}`);
  }
  assert.throws(() => toHslChannels(0xffffff), /Unsupported color value/);
});

test("greys have zero saturation, whatever their lightness", () => {
  // max === min is the branch that would otherwise divide by zero.
  for (const hex of ["#808080", "#cccccc", "#111111"]) {
    assert.match(toHslChannels(hex), /^0 0% /, hex);
  }
});

test("rgba channels convert directly, for the Figma REST path", () => {
  // The Enterprise REST API returns 0..1 floats, not hex, and that path never runs in CI.
  assert.equal(rgbaToHslChannels({ r: 1, g: 1, b: 1 }), "0 0% 100%");
  assert.equal(rgbaToHslChannels({ r: 1, g: 0, b: 0 }), "0 100% 50%");
  assert.equal(rgbaToHslChannels({ r: 0, g: 0, b: 0 }), "0 0% 0%");
});

test("a token source must provide BOTH modes", () => {
  // A one-mode export is the shape that produces a product with no dark theme at all, so it has
  // to fail loudly at the source rather than emit half a theme.
  assert.throws(() => toDtcg({ light: {} }), /must provide "light" and "dark"/);
  assert.throws(() => toDtcg({ dark: {} }), /must provide "light" and "dark"/);
  assert.throws(() => toDtcg({}), /must provide "light" and "dark"/);
});

test("Tokens Studio set names are accepted in both spellings", () => {
  const flat = toDtcg({ light: { a: 1 }, dark: { b: 2 } });
  assert.deepEqual(flat, { light: { a: 1 }, dark: { b: 2 } });
  // "semantic/light" is what a Tokens Studio export actually emits.
  const scoped = toDtcg({ "semantic/light": { a: 1 }, "semantic/dark": { b: 2 } });
  assert.deepEqual(scoped, { light: { a: 1 }, dark: { b: 2 } });
});

test("$themes and $metadata bookkeeping is discarded", () => {
  const parsed = toDtcg({ $themes: [], $metadata: {}, light: { a: 1 }, dark: { b: 2 } });
  assert.deepEqual(Object.keys(parsed).sort(), ["dark", "light"]);
});

test("tokens are grouped per mode with a -- prefix", () => {
  const grouped = groupByMode([
    { path: ["light", "background"], $value: "0 0% 100%" },
    { path: ["light", "card", "foreground"], $value: "240 10% 4%" },
    { path: ["dark", "background"], $value: "240 10% 4%" },
  ]);
  // A nested path becomes a single hyphenated var name — `card-foreground`, not `card.foreground`.
  assert.deepEqual(grouped.light, {
    "--background": "0 0% 100%",
    "--card-foreground": "240 10% 4%",
  });
  assert.deepEqual(grouped.dark, { "--background": "240 10% 4%" });
});
