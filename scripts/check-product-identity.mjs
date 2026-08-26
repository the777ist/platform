#!/usr/bin/env node
// scripts/check-product-identity.mjs — no two products may share an identifier.
//
// This repo exists to spawn products, and every one of them carries a handful of names that MUST
// be unique. Nothing checked that. The generator allocates them correctly today, but it is the
// only thing that does: a hand-edited product.json, a rename after stamping, or a token rewrite
// that half-applied all produce a collision that no test, type check or lint can see.
//
// What each collision costs:
//   fly app name    one product's deploy OVERWRITES another's. The worst one here.
//   bundle id       two apps that cannot coexist on a device, and an App Store conflict.
//   scheme          deep links open whichever app happened to install last.
//   portIndex       two local stacks fight for the same ports, and e2e derives ONE SUPABASE_URL
//                   from it — so a suite can pass against the wrong product's database.
//   project_id      the same, for the Supabase CLI's local containers.
//   slug            two products publishing OTA updates to ONE EAS project.
//   sentryProject   two products' errors in one stream, discovered during an incident.
//
// `_template` is included deliberately: it is in the deploy matrix as `template`, so its names
// are as real as any product's.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const first = (text, re) => text.match(re)?.[1] ?? null;

export function portIndexOf(productJson) {
  if (!productJson) return null;
  const value = JSON.parse(productJson).portIndex;
  return typeof value === "number" ? String(value) : null;
}
const all = (text, re) => [...text.matchAll(re)].map((m) => m[1]);

/** Every identifier a product claims, keyed by the kind of collision it would cause. */
export function productIdentity(name, root = ROOT) {
  const dir = join(root, "products", name);
  const read = (...p) => (existsSync(join(dir, ...p)) ? readFileSync(join(dir, ...p), "utf8") : "");

  const appConfig = read("app", "app.config.ts");
  const supabase = read("supabase", "config.toml");
  const productJson = read("product.json");

  const flyApps = [];
  const apiDir = join(dir, "api");
  if (existsSync(apiDir)) {
    for (const file of readdirSync(apiDir).filter((f) => /^fly\..*\.toml$/.test(f))) {
      flyApps.push(...all(readFileSync(join(apiDir, file), "utf8"), /^app\s*=\s*"([^"]+)"/gm));
    }
  }

  return {
    // Stringified so it compares like the others, but only when it is actually a number.
    // `String(undefined)` would be "undefined" — a value, which two incomplete stamps would then
    // "collide" on for the wrong reason while neither was reported as incomplete.
    portIndex: portIndexOf(productJson),
    bundleId: first(appConfig, /bundleIdentifier:\s*"([^"]+)"/),
    androidPackage: first(appConfig, /package:\s*"([^"]+)"/),
    scheme: first(appConfig, /scheme:\s*"([^"]+)"/),
    // The EAS project is keyed by slug: two products sharing one publish OTA updates to the
    // same project, so a staging push to one can reach the other's installed binaries.
    slug: first(appConfig, /slug:\s*"([^"]+)"/),
    // A shared Sentry project mixes two products' errors into one stream, which is discovered
    // during an incident, at the moment it costs most.
    sentryProject: first(appConfig, /project:\s*"([^"]+)"/),
    projectId: first(supabase, /^project_id\s*=\s*"([^"]+)"/m),
    flyApps: flyApps.sort(),
  };
}

export function productNames(root = ROOT) {
  const dir = join(root, "products");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => existsSync(join(dir, n, "product.json")))
    .sort();
}

/**
 * Identifiers claimed by more than one product.
 * Returns [{ kind, value, products }]; empty when every name is unique.
 */
export function collisions(identities) {
  const seen = new Map(); // `${kind}:${value}` -> [product]
  for (const [product, identity] of Object.entries(identities)) {
    for (const [kind, value] of Object.entries(identity)) {
      for (const v of Array.isArray(value) ? value : [value]) {
        if (v === null || v === "") continue;
        const key = `${kind}\u0000${v}`;
        seen.set(key, [...(seen.get(key) ?? []), product]);
      }
    }
  }
  return [...seen.entries()]
    .filter(([, products]) => products.length > 1)
    .map(([key, products]) => {
      const [kind, value] = key.split("\u0000");
      return { kind, value, products };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.value.localeCompare(b.value));
}

/** Identifiers a product is missing entirely — an incomplete stamp, not a collision. */
export function missingIdentifiers(identity) {
  return Object.entries(identity)
    .filter(([, v]) => (Array.isArray(v) ? v.length === 0 : v === null))
    .map(([kind]) => kind);
}

function main() {
  const names = productNames();
  if (names.length === 0) {
    console.log("check-product-identity: no products");
    return;
  }
  const identities = Object.fromEntries(names.map((n) => [n, productIdentity(n)]));
  const problems = [];

  for (const [product, identity] of Object.entries(identities)) {
    for (const kind of missingIdentifiers(identity)) {
      problems.push(`${product} declares no ${kind} — an incomplete stamp`);
    }
  }
  for (const { kind, value, products } of collisions(identities)) {
    problems.push(`${kind} "${value}" is claimed by ${products.join(" and ")}`);
  }

  if (problems.length > 0) {
    console.error("");
    console.error("❌ Products share an identity:");
    for (const p of problems) console.error(`     ${p}`);
    console.error("");
    console.error("   Every product needs its OWN fly apps, bundle id, scheme, portIndex and");
    console.error("   supabase project. A shared fly app name means one deploy overwrites the");
    console.error(
      "   other; a shared portIndex means a suite can pass against the wrong database.",
    );
    process.exit(1);
  }

  console.log(
    `check-product-identity: ${names.length} product(s), no shared identifiers ` +
      `(${names.join(", ")})`,
  );
}

// Guarded so importing this module (to test the rules) does not run the scan or exit the process.
if (
  process.argv[1] &&
  process.argv[1]
    .split(String.fromCharCode(92))
    .join("/")
    .endsWith("scripts/check-product-identity.mjs")
) {
  main();
}
