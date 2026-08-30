#!/usr/bin/env node
// scripts/devbox.mjs — lifecycle wrapper for the Fly.io persistent workstation (devbox/).
//
// One machine + one volume per seat; the image is the toolchain, the volume is the identity
// (see devbox/README.md). This wrapper exists for two reasons beyond convenience:
//
//  - TEMPLATE DISCIPLINE. The committed app name is the org placeholder `example-devbox`,
//    and every subcommand REFUSES to run until it is swapped for a real <org>-devbox (or an
//    explicit --app is passed). Without that refusal the first `create` in a cloned repo
//    would happily park a company's workstation on the placeholder name.
//  - THE ONE-MACHINE INVARIANT. Volumes are single-attach and the whole persistence story
//    assumes exactly one machine. Every deploy passes --ha=false (Fly otherwise creates a
//    second machine "for availability"), and machineId() refuses to guess when it finds any
//    machine count other than one.
//
// Zero dependencies, flyctl does the real work. Commands:
//   node scripts/devbox.mjs create --org <org> [--app <name>] [--region <r>] [--volume-size <gb>]
//   node scripts/devbox.mjs up | down | ssh | status
//   node scripts/devbox.mjs deploy            (image refresh — restarts the machine)
//   node scripts/devbox.mjs destroy --force   (kills the app AND the volume: all logins/clones)
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PLACEHOLDER = "example-devbox";
const DEVBOX_DIR = join(ROOT, "devbox");
const FLY_CONFIG = join(DEVBOX_DIR, "fly.toml");

/**
 * Deliberately naive fly.toml parse: two top-level string keys, no toml dependency. The file
 * is committed and hand-edited exactly once (the org swap), so a real parser buys nothing.
 */
export function readFlyConfig(text = readFileSync(FLY_CONFIG, "utf8")) {
  const app = text.match(/^app\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  const region = text.match(/^primary_region\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  return { app, region };
}

/**
 * The template-discipline gate. Returns the app name to operate on, or throws with the
 * org-activation instructions while the committed name is still the placeholder.
 */
export function resolveApp(flags, config = readFlyConfig()) {
  if (flags.app) return flags.app;
  if (config.app && config.app !== PLACEHOLDER) return config.app;
  throw new Error(
    `devbox/fly.toml still names the org placeholder "${PLACEHOLDER}".\n` +
      `   Swap it for <org>-devbox (see devbox/README.md "Org activation"), or pass\n` +
      `   --app <name> explicitly for a one-off. Refusing to guess an org's app name.`,
  );
}

/**
 * Does the app already have a usable `data` volume? `fly volumes create` is NOT idempotent —
 * a second create mints a second volume with the same name (verified live: a failed first
 * deploy plus a retry produced an orphan), and a stray volume is both a monthly bill and a
 * machine-placement footgun. Creation is therefore guarded by a LIST, never by error text.
 */
export function hasDataVolume(volumes) {
  return volumes.some((v) => v.name === "data" && !v.pending_destroy);
}

/** Exactly-one-machine lookup; anything else is a broken invariant, never a guess. */
export function pickMachine(machines) {
  if (machines.length === 1) return machines[0];
  if (machines.length === 0) {
    throw new Error("no machines exist for this app — run `node scripts/devbox.mjs create` first");
  }
  throw new Error(
    `expected exactly ONE machine, found ${machines.length} ` +
      `(${machines.map((m) => m.id).join(", ")}) — the one-machine invariant is broken; ` +
      `inspect with \`fly machines list\` and remove the extras before continuing.`,
  );
}

const fly = (args, opts = {}) =>
  execFileSync("fly", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });

// Interactive passthrough — the user sees and types everything (ssh, deploy output).
const flyInteractive = (args, opts = {}) =>
  spawnSync("fly", args, { stdio: "inherit", shell: false, ...opts });

function preflight() {
  try {
    fly(["version"]);
  } catch {
    fail("flyctl is not installed or not on PATH — install: https://fly.io/docs/flyctl/install/");
  }
  try {
    fly(["auth", "whoami"]);
  } catch {
    fail("flyctl is not authenticated — run: fly auth login");
  }
}

function machineFor(app) {
  const out = fly(["machines", "list", "-a", app, "--json"]);
  return pickMachine(JSON.parse(out || "[]"));
}

function fail(message) {
  console.error(`❌ devbox: ${message}`);
  process.exit(1);
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--force") flags.force = true;
    else if (arg.startsWith("--"))
      flags[arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  return flags;
}

// "already exists" is a fine outcome for create's idempotent steps — note it and continue.
function runTolerating(args, alreadyExistsHint) {
  const result = spawnSync("fly", args, { encoding: "utf8", shell: false });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(result.stdout ?? "");
  if (result.status === 0) return;
  if (/already (exists|taken|been taken)/i.test(output)) {
    console.log(`   ↳ ${alreadyExistsHint} — continuing`);
    return;
  }
  process.stderr.write(result.stderr ?? "");
  fail(`\`fly ${args.join(" ")}\` failed (see above)`);
}

function cmdCreate(flags) {
  const app = resolveApp(flags);
  if (!flags.org) {
    fail(
      "create needs --org <fly-org-slug> — the whole point is that each company clone's\n" +
        "   devbox lands in THAT company's Fly organization (see devbox/README.md).",
    );
  }
  const region = flags.region ?? readFlyConfig().region ?? "lhr";
  const size = flags.volumeSize ?? "20";
  console.log(`devbox: creating ${app} in org ${flags.org} (${region}, ${size}GB volume)`);
  runTolerating(["apps", "create", app, "--org", flags.org], "app already exists");
  let volumes = [];
  try {
    volumes = JSON.parse(fly(["volumes", "list", "-a", app, "--json"]) || "[]");
  } catch {
    // a just-created app can briefly 404 on volume listing — treat as none
  }
  if (hasDataVolume(volumes)) {
    console.log("   ↳ data volume already exists — skipping creation");
  } else {
    runTolerating(
      ["volumes", "create", "data", "-a", app, "--region", region, "--size", size, "--yes"],
      "volume already exists",
    );
  }
  // --ha=false: without it Fly creates a SECOND machine for availability, which breaks the
  // one-volume-one-machine persistence model outright.
  // cwd matters: flyctl uses the INVOKING directory as the docker build context (--config
  // only locates the toml), so this must run from devbox/ or COPY entrypoint.sh fails.
  const deploy = flyInteractive(
    ["deploy", "--config", "fly.toml", "-a", app, "--ha=false", "--regions", region],
    { cwd: DEVBOX_DIR },
  );
  if (deploy.status !== 0) fail("deploy failed — see output above");
  console.log(
    `\n✅ devbox created. First boot (everything lands on the volume and persists):\n` +
      `   node scripts/devbox.mjs ssh     then, inside tmux:\n` +
      `   1. claude          → /login\n` +
      `   2. gh auth login   (+ git config --global user.name/user.email)\n` +
      `   3. gh repo clone <org>/<repo> && cd <repo> && pnpm bootstrap\n` +
      `   4. claude in the repo → /mcp → authenticate each OAuth server\n` +
      `   Full runbook: devbox/README.md`,
  );
}

function cmdUp(app) {
  const machine = machineFor(app);
  if (machine.state === "started") {
    console.log(`devbox: ${app} is already running`);
    return;
  }
  flyInteractive(["machine", "start", machine.id, "-a", app]);
}

function cmdDown(app) {
  const machine = machineFor(app);
  if (machine.state === "stopped") {
    console.log(`devbox: ${app} is already stopped`);
    return;
  }
  flyInteractive(["machine", "stop", machine.id, "-a", app]);
}

function cmdSsh(app) {
  const machine = machineFor(app);
  if (machine.state !== "started") {
    console.log("devbox: machine is stopped — starting it first");
    flyInteractive(["machine", "start", machine.id, "-a", app]);
    // fly machine start returns before ssh-ability; a short poll beats a blind sleep.
    for (let i = 0; i < 30; i++) {
      const state = JSON.parse(fly(["machines", "list", "-a", app, "--json"]))[0]?.state;
      if (state === "started") break;
      spawnSync(process.execPath, ["-e", "setTimeout(()=>{},1000)"]);
    }
  }
  // `su - dev` = LOGIN shell → /etc/profile.d/devbox.sh → mise on PATH, HOME on the volume.
  // (flyctl grew `ssh console --user`, but su is version-proof and guarantees the login shell.)
  // tmux -A attaches the existing `main` session or creates it — a dropped connection resumes
  // exactly where it was.
  const result = flyInteractive([
    "ssh",
    "console",
    "-a",
    app,
    "--pty",
    "-C",
    "su - dev -c 'tmux new-session -A -s main'",
  ]);
  process.exit(result.status ?? 0);
}

function cmdStatus(app) {
  flyInteractive(["status", "-a", app]);
  flyInteractive(["volumes", "list", "-a", app]);
}

function cmdDeploy(app, flags) {
  console.log(
    "⚠️  devbox: a redeploy RESTARTS the machine — your tmux session and anything running die.\n" +
      "   Volume state (logins, clones, docker images) survives. Ctrl-C now to abort.",
  );
  const region = flags.region ?? readFlyConfig().region ?? "lhr";
  const result = flyInteractive(
    ["deploy", "--config", "fly.toml", "-a", app, "--ha=false", "--regions", region],
    { cwd: DEVBOX_DIR },
  );
  process.exit(result.status ?? 0);
}

function cmdDestroy(app, flags) {
  if (!flags.force) {
    fail(
      `destroy deletes ${app} AND its volume — Claude/gh/MCP logins, clones, everything.\n` +
        "   If you mean it, re-run with --force.",
    );
  }
  flyInteractive(["apps", "destroy", app, "--yes"]);
}

// --- CLI ---------------------------------------------------------------------------------------
if (
  process.argv[1] &&
  process.argv[1].split(String.fromCharCode(92)).join("/").endsWith("scripts/devbox.mjs")
) {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  const commands = ["create", "up", "down", "ssh", "status", "deploy", "destroy"];
  if (!commands.includes(command)) {
    console.error(`usage: node scripts/devbox.mjs <${commands.join(" | ")}> [flags]`);
    process.exit(2);
  }
  try {
    preflight();
    const app = resolveApp(flags);
    if (command === "create") cmdCreate(flags);
    else if (command === "up") cmdUp(app);
    else if (command === "down") cmdDown(app);
    else if (command === "ssh") cmdSsh(app);
    else if (command === "status") cmdStatus(app);
    else if (command === "deploy") cmdDeploy(app, flags);
    else if (command === "destroy") cmdDestroy(app, flags);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
