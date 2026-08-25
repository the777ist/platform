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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const surface = process.argv[2];

if (!surface || !["api", "app"].includes(surface)) {
  console.error("usage: node scripts/product-filters.mjs <api|app>");
  process.exit(2);
}

// Sorted explicitly: readdirSync returns filesystem order, which is NOT the same on the Windows
// dev machines and the Linux runners. Without this the generated YAML differs by platform for no
// reason, which makes any future diff of it meaningless.
const products = readdirSync(join(ROOT, "products"))
  .filter((name) => existsSync(join(ROOT, "products", name, surface)))
  .sort();

// The matrix key drops the leading underscore so `_template` stays addressable as `template`,
// which is what the workflows' matrix expressions already expect. Keeping the key stable means
// this change swaps only where the YAML comes from, never what the deploy jobs do with it.
const lines = products.map(
  (name) => `${name.replace(/^_/, "")}: ['products/${name}/${surface}/**', 'packages/**']`,
);

process.stdout.write(lines.length ? lines.join("\n") + "\n" : "");
