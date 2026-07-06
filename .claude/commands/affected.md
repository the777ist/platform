Run the full quality gate over ONLY what changed (plus dependents — the co-evolve guard):

```bash
pnpm turbo run lint typecheck test build --affected
```

Compares against the default base (or set `TURBO_SCM_BASE`/`TURBO_SCM_HEAD`). Touching a
shared `packages/*` correctly rebuilds every dependent product; a cache hit on an untouched
product is the expected proof that scoping works.
