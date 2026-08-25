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

// Returns the `role` claim if the value is a decodable JWT, else null.
function jwtRole(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

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
        findings.push(`${where}: ${key} is a JWT with role="${role}" (only "anon" is publishable)`);
      }
    });
}

if (findings.length > 0) {
  console.error("");
  console.error("❌ Secret material in committed files:");
  for (const f of findings) console.error(`     ${f}`);
  console.error("");
  console.error("   This repository is public. Rotate anything real that was committed.");
  process.exit(1);
}

console.log("check-committed-secrets: committed env files carry publishable values only");
