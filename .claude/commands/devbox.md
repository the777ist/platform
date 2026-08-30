Operate the Fly.io persistent cloud workstation (one machine + one volume per seat; full
runbook: [devbox/README.md](../../devbox/README.md)). Argument: $ARGUMENTS — a subcommand,
optionally followed by flags.

```bash
node scripts/devbox.mjs up          # start the machine
node scripts/devbox.mjs ssh         # attach (tmux `main`; auto-starts a stopped machine)
node scripts/devbox.mjs down        # stop — EXPLICIT by design: nothing auto-stops this box,
                                    #   and a forgotten running machine bills by the hour
node scripts/devbox.mjs status      # machine + volume state
node scripts/devbox.mjs deploy      # rebuild + swap the image (RESTARTS the machine — tmux and
                                    #   running work die; volume state survives)
node scripts/devbox.mjs create --org <org>   # one-time provisioning (see runbook first)
node scripts/devbox.mjs destroy --force      # deletes the app AND the volume — every login and
                                             #   clone on the seat. Never run without the user
                                             #   explicitly asking for exactly this.
```

Rules for driving this as an agent:

- "Pause" IS `down`: a stopped Machine keeps its whole volume (Claude/gh/MCP auth, clones,
  docker images) and resumes in seconds. There is no separate pause concept, and detaching
  tmux (`C-b d`) is the in-session equivalent when the box should stay running.
- The wrapper REFUSES to run while `devbox/fly.toml` still names the `example-devbox`
  placeholder. That refusal is template discipline, not a bug: this repo is cloned per
  company, and each clone's operator must swap in `<org>-devbox` (or pass `--app <name>`
  explicitly for a one-off) so the box lands in the right Fly org. Do NOT edit the
  committed placeholder to make the error go away.
- Preflight failures name their own fix (`fly auth login`, install flyctl) — relay them,
  don't work around them.
- After finishing work on the box on the user's behalf, leave it the way you found it: if
  you started it, `down` it — the no-watchdog decision means nothing else will.
- `deploy` and `destroy` are disruptive; confirm with the user before running either unless
  they just asked for exactly that.
