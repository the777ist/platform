// Exports the web bundle the E2E static server serves. Runs as the FIRST half of the
// serve webServer's command chain in playwright.config.ts — Playwright launches
// webServer processes BEFORE global setup, so the export cannot live in
// global-setup.ts (in a cold environment `dist/` wouldn't exist when the server's
// readiness check runs; see the nightly CI failure this fixed).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// `expo export` FORCES NODE_ENV=production, so it would bake the .env.production
// PLACEHOLDER fly.dev URLs and the E2E would target infra that doesn't exist. Direct
// env vars beat dotenv files in @expo/env — inject .env.development's EXPO_PUBLIC_*
// explicitly so the bundle points at the LOCAL stack.
const env = { ...process.env, ...readEnvFile(path.join(appDir, ".env.development")) };
// expo-cli parses CI with getenv.boolish, which THROWS on an empty string
// (CI= from a wrapping shell) — drop it unless it carries a real value.
if (!env.CI) delete env.CI;
// --clear: Metro's transform cache does NOT key on EXPO_PUBLIC_* values — without
// it a previous export's bundle (wrong env baked in) is replayed byte-identical.
execSync("npx expo export --platform web --clear", { cwd: appDir, stdio: "inherit", env });

function readEnvFile(file) {
  const vars = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) vars[match[1]] = match[2].trim(); // trim strips CRLF remnants on Windows
  }
  return vars;
}
