Run this product's dev stack (Supabase must be up — `pnpm bootstrap` from the repo root):

```bash
pnpm turbo run dev --filter=*template-*
```

Or individually: `pnpm --filter @the777incident/template-api dev` (uvicorn --reload; port =
8000 + 10·portIndex from product.json) and `pnpm --filter @the777incident/template-app dev`
(Expo on :8081 — web in the browser, QR for a device).
