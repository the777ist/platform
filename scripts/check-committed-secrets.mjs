#!/usr/bin/env node
// scripts/check-committed-secrets.mjs — enforce the locked env rule (PHILOSOPHY "Env/config"):
// committed env files carry PUBLISHABLE values only. Service-role keys and JWT secrets live in
// each platform's native store and are never committed, and never `EXPO_PUBLIC_*`.
//
// This repo is PUBLIC, so a committed service-role key is not a lint failure — it is a live
// incident: that key bypasses RLS on the project it belongs to. GitHub push protection catches
// well-known provider formats, but a Supabase service-role key is just a JWT and does not reliably
// trip it. Until now nothing enforced the rule at all.
//
// Precision matters here, because the SAME shape is legitimate: every product commits
// `EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...`, which is publishable by design and gated by RLS. So the
// check does not flag "looks like a JWT" — it DECODES the payload and flags `role: service_role`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const ENV_FILE = /(^|\/)\.env(\.|$)/;
// Key NAMES that must never carry a value in a committed file.
const SECRET_KEY = /(SERVICE_ROLE|JWT_SECRET|SECRET_KEY|PRIVATE_KEY|_PASSWORD|ACCESS_TOKEN)/i;
// A publishable frontend var must never be named like a secret.
const PUBLIC_BUT_SECRET = /^EXPO_PUBLIC_.*(SECRET|SERVICE_ROLE|PRIVATE)/i;
// A bare `.env` / `.env.local` is machine-local and must never be tracked at all.
const NEVER_TRACKED = /(^|\/)\.env(\.local)?$/;

// A JWT ANYWHERE in a tracked file, not only in a .env. The env-file scan below is the rule that
// gets written down; this is the one that catches reality. A service-role key reaches a public
// repo through a workflow, a test fixture, a README snippet or a debug script far more easily
// than through a committed .env, and none of those were being read at all.
//
// The segment lengths are deliberately loose: precision comes from DECODING the payload and
// checking the role claim, not from the shape. Demanding a full-length signature would miss a
// key that was truncated on the way in, and buy no accuracy at all.
const JWT_ANYWHERE = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

// The Supabase CLI ships ONE well-known local keypair, published in its own docs and byte-identical
// on every machine. Its issuer is `supabase-demo` and it authorises nothing beyond a throwaway
// local stack, so e2e-nightly.yml uses the service-role half of it deliberately. Every OTHER
// service-role key is a live incident on a public repo. Allowlisting by ISSUER rather than by the
// literal key means a rotated demo key still passes and a real key still cannot.
const PUBLIC_DEMO_ISS = "supabase-demo";

// Binary-ish files git tracks that cannot contain a pasted key and are slow to read as text.
const SKIP_EXT = /\.(png|jpg|jpeg|gif|ico|webp|pdf|ttf|otf|woff2?|keystore|patch)$/i;

/** The decoded payload if the value is a decodable JWT, else null. */
export function jwtPayload(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload === "object" && payload !== null ? payload : null;
  } catch {
    return null;
  }
}

/** True for a service-role key that is NOT the Supabase CLI's public local demo key. */
export function isLeakedServiceRole(value) {
  const payload = jwtPayload(value);
  return payload?.role === "service_role" && payload.iss !== PUBLIC_DEMO_ISS;
}

/** Every leaked service-role key in a blob of text, with the line it sits on. */
export function findLeakedKeys(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const match of line.matchAll(JWT_ANYWHERE)) {
      if (isLeakedServiceRole(match[0])) hits.push({ line: i + 1, token: match[0] });
    }
  });
  return hits;
}

// Returns the `role` claim if the value is a decodable JWT, else null.
export function jwtRole(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function main() {
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);

  const findings = [];
  for (const file of tracked.filter((f) => ENV_FILE.test(f) || NEVER_TRACKED.test(f))) {
    if (NEVER_TRACKED.test(file)) {
      findings.push(`${file}: a bare .env/.env.local must never be committed (machine-local)`);
      continue;
    }
    const isExample = basename(file).endsWith(".example");
    readFileSync(join(ROOT, file), "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const eq = trimmed.indexOf("=");
        if (eq < 0) return;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        const where = `${file}:${i + 1}`;

        if (PUBLIC_BUT_SECRET.test(key)) {
          findings.push(`${where}: ${key} — a secret must never be an EXPO_PUBLIC_* var`);
          return;
        }
        // An empty placeholder is the whole point of a .env.example.
        if (!value) return;
        if (SECRET_KEY.test(key) && !isExample) {
          findings.push(
            `${where}: ${key} has a committed value — secrets belong in the platform store`,
          );
          return;
        }
        const role = jwtRole(value);
        if (role && role !== "anon") {
          findings.push(
            `${where}: ${key} is a JWT with role="${role}" (only "anon" is publishable)`,
          );
        }
      });
  }

  // Repo-wide sweep for a service-role key pasted ANYWHERE, not just into a .env.
  for (const file of tracked.filter((f) => !SKIP_EXT.test(f))) {
    let text;
    try {
      text = readFileSync(join(ROOT, file), "utf8");
    } catch {
      continue; // unreadable/binary — nothing to assert
    }
    for (const { line, token } of findLeakedKeys(text)) {
      findings.push(
        `${file}:${line}: a service_role JWT (…${token.slice(-8)}) — it bypasses RLS entirely`,
      );
    }
  }

  if (findings.length > 0) {
    console.error("");
    console.error("❌ Secret material in committed files:");
    for (const f of findings) console.error(`     ${f}`);
    console.error("");
    console.error("   This repository is public. Rotate anything real that was committed.");
    process.exit(1);
  }

  console.log(
    `check-committed-secrets: ${tracked.length} tracked file(s) scanned, ` +
      "no service-role keys; committed env files carry publishable values only",
  );
}

// Guarded so importing this module (to test the rules) does not run the scan or exit the process.
if (
  process.argv[1] &&
  process.argv[1]
    .split(String.fromCharCode(92))
    .join("/")
    .endsWith("scripts/check-committed-secrets.mjs")
) {
  main();
}
