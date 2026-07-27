Run this product's dev stack (Supabase must be up — `pnpm bootstrap` from the repo root).

FIRST RUN: the local stack starts EMPTY — `api/.env` must exist (copy `.env.example`,
paste the `supabase status` service_role key; keep JWKS/JWT lines commented out) and the
schema/data created: `uv run alembic upgrade head && uv run python -m template_api.seed`
from `api/`. Full recipe in README "Run it locally".

```bash
pnpm turbo run dev --filter=*template-*
```

Or individually: `pnpm --filter @platform/template-api dev` (uvicorn --reload; port =
8000 + 10·portIndex from product.json) and `pnpm --filter @platform/template-app dev`
(Expo on :8081 — web in the browser, QR for a device).
