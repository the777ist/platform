Regenerate THIS product's OpenAPI contract + typed client (after any api change):

```bash
pnpm turbo run openapi build --filter=*demo-api-client
```

Commit the regenerated `api/openapi.json` + `api-client/src/**` — CI's drift check fails
a stale regen. Never hand-edit the generated client.
