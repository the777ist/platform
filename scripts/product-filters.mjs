#!/usr/bin/env node
// scripts/product-filters.mjs — emit the dorny/paths-filter config for the per-product deploy
// workflows, DERIVED from products/* instead of hand-maintained in two YAML files.
//
// Why: deploy-api.yml and eas-update.yml each carried a hardcoded product list, so a newly stamped
// product silently never deployed until someone remembered to edit both workflows (the CLAUDE.md
// gotcha). That is the same "two lists that quietly disagree" failure the hooks were just fixed
// for; a platform meant to spawn many products cannot keep a manual roster.
//
// usage: node scripts/product-filters.mjs <api|app>
// prints, one product per line:
//   template: ['products/_template/api/**', 'packages/**']
//   demo: ['products/demo/api/**', 'packages/**']
//
// `packages/**` is on every product deliberately: a shared package change can alter any product's
// build output, so every product redeploys (the co-evolve guard, same rule the gates use).
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SURFACES = ["api", "app"];

/**
 * Directory names under products/ that actually have this surface, sorted.
 *
 * Sorted explicitly: readdirSync returns filesystem order, which is NOT the same on the Windows
 * dev machines and the Linux runners. Without this the generated YAML differs by platform for no
 * reason, which makes any future diff of it meaningless.
 */
export function productsWithSurface(surface, root = ROOT) {
  return readdirSync(join(root, "products"))
    .filter((name) => existsSync(join(root, "products", name, surface)))
    .sort();
}

/**
 * One dorny/paths-filter line per product.
 *
 * The KEY drops a leading underscore so `_template` stays addressable as `template`, which is
 * what the workflows' matrix expressions already expect — but the PATH keeps the real directory
 * name. Getting that pairing backwards is the quiet failure: `products/template/api/**` matches
 * nothing, so the filter is always false and the product simply never deploys, with every
 * workflow still green.
 *
 * `packages/**` is on every product deliberately: a shared package change can alter any product's
 * build output, so every product redeploys (the co-evolve guard, same rule the gates use).
 */
export function filterLines(products, surface) {
  return products.map(
    (name) => `${name.replace(/^_/, "")}: ['products/${name}/${surface}/**', 'packages/**']`,
  );
}

// --- CLI ---------------------------------------------------------------------------------------
// Guarded so importing this module (to test the rules) neither writes to stdout nor exits.
if (
  process.argv[1] &&
  process.argv[1].split(String.fromCharCode(92)).join("/").endsWith("scripts/product-filters.mjs")
) {
  const surface = process.argv[2];
  if (!surface || !SURFACES.includes(surface)) {
    console.error("usage: node scripts/product-filters.mjs <api|app>");
    process.exit(2);
  }
  const lines = filterLines(productsWithSurface(surface), surface);
  process.stdout.write(lines.length ? lines.join("\n") + "\n" : "");
}
