Run the full quality gate over ONLY what changed (plus dependents — the co-evolve guard):

```bash
node scripts/pre-push.mjs origin/main        # or any base: a sha, a tag, another branch
```

This is deliberately the SAME entry point the pre-push hook runs, over the same
`scripts/affected.mjs` scope module that `ci.yml` uses — so this command, the hook and CI cannot
disagree about what a change affects. It runs `lint typecheck test build openapi` scoped to the
change, then the typegen drift check, `lint:root` (the files no package owns), and the Alembic
single-head check.

Do NOT hand-roll `turbo run ... --affected` as a substitute. Two traps make the obvious version
quietly weaker than it looks:

- `--affected` is MUTUALLY EXCLUSIVE with `--filter` — pass both and the filters are silently
  dropped, so any exclusion you add does nothing.
- a change to a `globalDependencies` file (`tsconfig.base.json`, `eslint.config.mjs`,
  `pnpm-workspace.yaml`, `mise.toml`) lives in no package directory, so affected-detection selects
  ZERO packages and the "gate" passes having run nothing. `scripts/affected.mjs` widens to every
  package in that case; a raw `--affected` does not.

Touching a shared `packages/*` correctly rebuilds every dependent product; a cache hit on an
untouched product is the expected proof that scoping works. A product whose local Postgres is down
has its pytest skipped with a loud warning — CI always runs it.
