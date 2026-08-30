# Devbox — persistent cloud workstation on Fly.io

A **personal, persistent** Claude Code workstation: one Fly Machine + one Fly Volume per
seat. Start it, ssh in, work in tmux, stop it — and come back days later to the **same
machine**: Claude login, MCP OAuth tokens, gh auth, git config, repo clones, pnpm store and
even the pulled Supabase docker images are all still there.

The split that makes that work:

- **Image = tools** (this directory's `Dockerfile`; rebuilt on every `deploy`): OS, docker,
  mise-pinned Node 24 / pnpm 11 / Python 3.13 / uv, Supabase CLI, gh, tmux, Claude Code.
- **Volume = identity** (`/data`, survives everything): `HOME=/data/home/dev` plus dockerd's
  data-root. Nothing identity-shaped is ever in the image; nothing toolchain-shaped should
  live on the volume.

What it is **not**: it is not exposed to the network (no services — reachable only via
`fly ssh console` over WireGuard), it does **not** auto-stop (no idle watchdog by design —
`down` is explicit, and a forgotten running machine bills by the hour), and it is not a
deploy target (no CI workflow; `deploy` here means "refresh the workstation image").

## Prerequisites

- [flyctl](https://fly.io/docs/flyctl/install/) installed, and `fly auth login` completed.
- Membership in the company's Fly organization (each cloned repo's devbox lives in **that
  company's** org, on that company's billing). One Fly **account** can belong to many
  organizations — you do not need a login per company; `create --org` routes the app, volume
  and billing. If a company insists on a fully separate Fly account, run the wrapper with
  `FLY_API_TOKEN=<that org's token>` in the environment instead of re-logging-in.

## Org activation (once per repo clone)

1. Edit `devbox/fly.toml`: swap the `example-devbox` placeholder for `<org>-devbox`
   (PHILOSOPHY naming; `scripts/devbox.mjs` refuses to run until you do). In the same edit,
   update the first test in `scripts/__tests__/devbox.test.mjs` to expect YOUR app name —
   in the template it pins the placeholder (template discipline), and in your clone it
   becomes the org-baked pin; leaving it unchanged fails your first pre-push. **Caveat:**
   unlike product fly apps, no repo guard checks this name — Fly app names are globally
   unique, so `create` fails on a collision; pick another.
2. ```bash
   node scripts/devbox.mjs create --org <fly-org-slug>
   ```
   Creates the app, one 20GB volume in `lhr` (measured: a fully-bootstrapped seat uses
   ~9GB; volumes extend anytime but never shrink, so the default stays small), and deploys
   the machine (`--ha=false` — the
   one-machine invariant is load-bearing). Flags: `--app`, `--region`, `--volume-size`.

## First boot (once per seat — everything below persists on the volume)

```bash
node scripts/devbox.mjs ssh          # starts the machine if stopped; lands in tmux as `dev`
```

Inside the box:

1. `claude` → `/login` (Claude Code auth → `~/.claude`, on the volume)
2. `gh auth login` and `git config --global user.name/user.email`
3. `gh repo clone <org>/<repo> && cd <repo> && pnpm bootstrap` — bootstrap runs `mise trust`
   itself (trust is keyed to the absolute path, and this clone's path is new), installs, and
   starts every product's Supabase stack against the in-box docker daemon
4. `claude` inside the repo → `/mcp` → authenticate each OAuth server (Sentry, Expo, Vercel,
   plus Figma/Supabase/etc.) — tokens land under `HOME`, on the volume
5. Per-product first-run steps (api `.env`, migrate, seed) as per the root README

Three auth layers, three homes — none of them in the repo:

| Layer                                         | Lives                          | Scope              |
| --------------------------------------------- | ------------------------------ | ------------------ |
| Fly (who may operate/ssh the box)             | operator's `~/.fly/config.yml` | per Fly account    |
| Seat identity (Claude, gh, git, `/mcp` OAuth) | this seat's volume (`HOME`)    | per seat           |
| claude.ai connectors (Gmail/Drive/…)          | Anthropic server-side          | per Claude account |

The third row is why a FRESH seat can show some connectors already authenticated the moment
you `/login`: those grants ride your claude.ai account, not the machine — nothing was copied
from anywhere. Manage them at claude.ai → Settings → Connectors (account-wide; there is no
per-machine off switch).

## Daily lifecycle

```bash
node scripts/devbox.mjs up          # start the machine
node scripts/devbox.mjs ssh         # attach (tmux session `main`; also auto-starts if stopped)
# ... work; detach with C-b d; a dropped connection re-attaches on the next ssh ...
node scripts/devbox.mjs down        # stop — EXPLICIT, nothing stops it for you
node scripts/devbox.mjs status      # machine + volume state
```

## Upgrades

Toolchain lives in the image: bump the Dockerfile (mise pins, `SUPABASE_CLI_VERSION`, or just
rebuild to pick up the latest Claude Code) and run `node scripts/devbox.mjs deploy`.
**A redeploy restarts the machine** — tmux and running work die; logins, clones and docker
images survive (volume). Keep the Dockerfile's mise pins in sync with the root `mise.toml`
when that changes — drift costs a re-download at `pnpm bootstrap`, not a broken box.

## Team seats

One app + volume **per person**: `<org>-devbox-<name>`, each created with
`create --org <org> --app <org>-devbox-<name>`. Volumes are single-attach, so seats can't be
shared — and shouldn't be: Claude, gh and MCP auth are per-HOME, which makes them per-seat by
construction. Everyone deploys from the same committed Dockerfile, so tooling stays identical
across the team.

## What persists vs what resets

| Layer                                                                               | Survives stop/start | Survives redeploy |
| ----------------------------------------------------------------------------------- | ------------------- | ----------------- |
| Volume: HOME (Claude/gh/MCP auth, clones, pnpm store, shell history), docker images | yes                 | yes               |
| Image: OS, toolchain, Claude Code binary                                            | yes                 | replaced (fresh)  |
| Running state: tmux sessions, dev servers, started Supabase stacks                  | no                  | no                |

(Stacks restart with `pnpm bootstrap` / `supabase start` — the image layers are already on
the volume, so it's fast.)

## Troubleshooting

- **dockerd is down** (`supabase start` fails): `cat /data/log/dockerd.log`; restart with
  `sudo sh -c 'dockerd --data-root /data/docker >>/data/log/dockerd.log 2>&1 &'`. The
  entrypoint keeps the machine up even when dockerd fails, precisely so you can do this.
- **Volume full**: `df -h /data`, then `docker system prune`, `pnpm store prune`, or grow it:
  `fly volumes extend <vol-id> -a <app> --size <gb>`.
- **ssh hangs**: it's the WireGuard agent — `fly doctor`, or `fly agent restart`.
- **Crash-loop after a bad image**: `fly logs -a <app>`; fix the Dockerfile and redeploy (the
  volume is untouched by any of this).

## Costs (approximate — check [fly.io/pricing](https://fly.io/pricing))

Running `shared-cpu-4x`/8GB is roughly cents per hour (low tens of $/month if left on 24/7 —
which is why `down` matters); stopped, you pay storage only: the 20GB volume ≈ $3/month plus
a small rootfs charge. The whole design assumes mostly-stopped.
