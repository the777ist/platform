Regenerate a product's OpenAPI contract + typed client. Argument: $ARGUMENTS (product
name, e.g. `template`, `demo`).

```bash
pnpm turbo run openapi build --filter=*$ARGUMENTS-api-client
```

`openapi` exports the FastAPI schema (sorted keys, stable diffs); the api-client build runs
hey-api → typed SDK + TanStack Query options. The output is COMMITTED — commit the diff, and
never hand-edit anything under `api-client/src/`. CI's drift check
(`git diff --exit-code products/*/api-client products/*/api/openapi.json`) fails on a stale
regen.
