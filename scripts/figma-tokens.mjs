#!/usr/bin/env node
// Figma Variables -> Style Dictionary v5 -> co-generate web global.css (:root/.dark) AND
// native theme.ts (vars()) from ONE resolved token tree (one-way, committed).
// SD v5 is ESM-only + DTCG-default — this script is .mjs to match.
// Source abstracted: default = Tokens Studio JSON export, DTCG format (tier-independent,
// CI-runnable, reviewable diff); set source:"rest" + FIGMA_TOKEN for the Enterprise-only
// Variables REST API. NOTE: this script reads tokens.config.json (NOT figma.config.json —
// that file belongs to the Code Connect CLI).
import fs from "node:fs";
import StyleDictionary from "style-dictionary";

const cfg = JSON.parse(fs.readFileSync("tokens.config.json", "utf8"));

async function loadSource() {
  if (cfg.source === "rest") {
    // Enterprise-only: GET /v1/files/:key/variables/local (needs FIGMA_TOKEN with
    // file_variables:read + file_content:read). Dereferences VARIABLE_ALIAS references and
    // emits a DTCG token tree keyed by mode (cfg.modes maps brand -> modeId).
    if (!process.env.FIGMA_TOKEN) {
      throw new Error('source:"rest" requires FIGMA_TOKEN (Enterprise plan).');
    }
    const res = await fetch(
      `https://api.figma.com/v1/files/${cfg.fileKey}/variables/local`,
      { headers: { "X-Figma-Token": process.env.FIGMA_TOKEN } },
    );
    if (!res.ok) throw new Error(`Figma REST ${res.status}`);
    return toDtcg(normalizeRest(await res.json()));
  }
  // Default: Tokens Studio DTCG JSON (committed fixture / export).
  return toDtcg(JSON.parse(fs.readFileSync(cfg.tokensFile, "utf8")));
}

// REST payload -> { light: { <name>: { $type, $value } }, dark: { ... } } for the `semantic`
// collection, resolving each variable's valuesByMode through the light/dark modes.
// ⚠️ Enterprise-only path — exercised during /bootstrap-design-system, not in CI.
function normalizeRest(json) {
  const { variables, variableCollections } = json.meta ?? {};
  if (!variables || !variableCollections) {
    throw new Error(
      "Unexpected REST payload: missing meta.variables/variableCollections",
    );
  }
  const semantic = Object.values(variableCollections).find(
    (c) => c.name.toLowerCase() === "semantic",
  );
  if (!semantic)
    throw new Error('No "semantic" variable collection in the Figma file.');
  const out = {};
  for (const mode of semantic.modes) {
    const setName = mode.name.toLowerCase(); // expected: light / dark (per FIGMA.md)
    out[setName] = {};
    for (const v of Object.values(variables)) {
      if (v.variableCollectionId !== semantic.id) continue;
      let value = v.valuesByMode[mode.modeId];
      // Dereference VARIABLE_ALIAS chains (semantic -> primitives).
      while (
        value &&
        typeof value === "object" &&
        value.type === "VARIABLE_ALIAS"
      ) {
        value = variables[value.id]?.valuesByMode[mode.modeId];
      }
      if (value && typeof value === "object" && "r" in value) {
        value = rgbaToHslChannels(value);
      }
      out[setName][v.name.replace(/^--/, "")] = {
        $type: "color",
        $value: value,
      };
    }
  }
  return out;
}

// Tokens Studio export -> plain { light: {...}, dark: {...} } DTCG tree. Accepts either
// top-level light/dark sets or "semantic/light"-style set names; strips $themes/$metadata.
function toDtcg(json) {
  const out = {};
  for (const [key, value] of Object.entries(json)) {
    if (key.startsWith("$")) continue; // $themes / $metadata bookkeeping
    const setName = key.includes("/") ? key.split("/").pop() : key;
    if (setName === "light" || setName === "dark") out[setName] = value;
  }
  if (!out.light || !out.dark) {
    throw new Error(
      `Token source must provide "light" and "dark" sets (got: ${Object.keys(json)})`,
    );
  }
  return out;
}

// ---- color helpers ----------------------------------------------------------------------

// "H S% L%" channel string from hex ("#0a0a0b"), hsl() wrapper, or already-channels input.
function toHslChannels(value) {
  if (typeof value !== "string")
    throw new Error(`Unsupported color value: ${value}`);
  const channels = /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/;
  if (channels.test(value.trim())) return value.trim();
  const hslWrap = value.match(/^hsl\(\s*([^)]+)\)$/i);
  if (hslWrap) return hslWrap[1].replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const hex = value.match(/^#?([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return rgbaToHslChannels({
      r: ((n >> 16) & 255) / 255,
      g: ((n >> 8) & 255) / 255,
      b: (n & 255) / 255,
    });
  }
  throw new Error(`Unsupported color value: ${value}`);
}

function rgbaToHslChannels({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const round = (x) => Math.round(x * 10) / 10;
  return `${round(h * 360)} ${round(s * 100)}% ${round(l * 100)}%`;
}

// ---- Style Dictionary v5 wiring ----------------------------------------------------------

// Custom transform: emit space-separated HSL CHANNELS ("240 6% 10%") so the Tailwind preset's
// hsl(var(--x)) wrapper resolves. SD's stock color transforms output hex/rgb — not channels —
// so this transform is REQUIRED for this stack.
StyleDictionary.registerTransform({
  name: "color/hsl-channels",
  type: "value",
  filter: (t) => t.$type === "color" || t.type === "color",
  transform: (t) => toHslChannels(t.$value ?? t.value),
});

// Group resolved tokens { light: { "--background": "0 0% 100%", ... }, dark: { ... } }.
function groupByMode(allTokens) {
  const modes = {};
  for (const t of allTokens) {
    const [mode, ...rest] = t.path;
    (modes[mode] ??= {})[`--${rest.join("-")}`] = t.$value ?? t.value;
  }
  return modes;
}

const MODE_ORDER = ["light", "dark"]; // resolved per product brand mode pair

// JS format: the native theme.ts (NativeWind vars() objects, light+dark) — output is
// prettier-stable so regeneration is diff-clean against the committed file.
StyleDictionary.registerFormat({
  name: "javascript/nativewind-theme",
  format: ({ dictionary }) => {
    const modes = groupByMode(dictionary.allTokens);
    const block = (name) => {
      const entries = Object.entries(modes[name] ?? {})
        .map(([k, v]) => `    "${k}": "${v}",`)
        .join("\n");
      return `  ${name}: vars({\n${entries}\n  }),`;
    };
    return (
      `import { vars } from "nativewind";\n\n` +
      `// NOTE: regenerated by scripts/figma-tokens.mjs — do NOT hand-edit.\n` +
      `export const themes = {\n${MODE_ORDER.map(block).join("\n")}\n} as const;\n\n` +
      `export type Theme = keyof typeof themes;\n`
    );
  },
});

// CSS format: the FULL web global.css — tailwind directives + @layer base with :root (light)
// and .dark:root (dark) blocks. (SD's stock css/variables format would clobber the @tailwind
// directives and cannot emit two selector blocks in one file — hence a custom format.)
StyleDictionary.registerFormat({
  name: "css/tailwind-globals",
  format: ({ dictionary }) => {
    const modes = groupByMode(dictionary.allTokens);
    const block = (selector, vars) =>
      `  ${selector} {\n` +
      Object.entries(vars ?? {})
        .map(([k, v]) => `    ${k}: ${v};`)
        .join("\n") +
      `\n  }`;
    return (
      `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n` +
      `@layer base {\n` +
      `${block(":root", modes.light)}\n` +
      `${block(".dark:root", modes.dark)}\n` +
      `}\n`
    );
  },
});

const tokens = await loadSource();
const sd = new StyleDictionary({
  tokens,
  // Both modes hold the same semantic names by design (light/background + dark/background) —
  // SD's flattened-name collision warning is expected noise here; formats key by path.
  log: { warnings: "disabled" },
  platforms: {
    // WEB: full global.css (tailwind directives + :root/.dark:root CSS-var blocks).
    web: {
      transforms: ["color/hsl-channels"],
      buildPath: "packages/ui/src/",
      files: [{ destination: "global.css", format: "css/tailwind-globals" }],
    },
    // NATIVE: theme.ts vars() objects.
    native: {
      transforms: ["color/hsl-channels"],
      buildPath: "packages/ui/src/lib/",
      files: [
        { destination: "theme.ts", format: "javascript/nativewind-theme" },
      ],
    },
  },
});
await sd.buildAllPlatforms(); // writes cfg.outputs.globalCss + cfg.outputs.themeTs
console.log("regenerated global.css (web) + theme.ts (native)");
