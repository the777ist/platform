#!/usr/bin/env node
// Regenerate ALL brand raster sizes from the single source.svg.
// PHILOSOPHY.md (Branding assets): "placeholder icon/splash/favicon ... from a single source;
// a regen script produces all sizes". Run after editing source.svg:
//   pnpm --filter <this app> brand:gen   (or: node assets/brand/gen-brand.mjs)
//
// Rasterization dep is intentionally NOT vendored into the zero-dep generator — this
// script lives in the app workspace and uses the app's toolchain (`sharp`, app devDep,
// pinned exact). The size MATRIX below is the contract; keep it and app.config.ts in sync.
// Outputs are COMMITTED so CI/builds never need the rasterizer.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "source.svg");

// The four assets app.config.ts references. Keep this list and app.config.ts in sync.
const TARGETS = [
  { out: "icon.png", size: 1024 }, // App store / Expo `icon`
  { out: "adaptive-icon.png", size: 1024 }, // Android adaptive foreground
  { out: "splash.png", size: 1284 }, // expo-splash-screen image
  { out: "favicon.png", size: 48 }, // web favicon
];

async function main() {
  const sharp = (await import("sharp")).default;
  const svg = await readFile(SRC);
  for (const { out, size } of TARGETS) {
    await sharp(svg).resize(size, size).png().toFile(join(HERE, out));
    console.log(`gen-brand: source.svg -> ${out} @ ${size}px`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
