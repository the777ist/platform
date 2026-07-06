Stamp a new product from `products/_template`. Argument: $ARGUMENTS (kebab-case name,
`/^[a-z][a-z0-9-]*$/`).

```bash
pnpm new-product $ARGUMENTS   # = node scripts/new-product.mjs $ARGUMENTS
```

The generator validates the name, assigns the next portIndex, copies + token-rewrites the
template (contents AND paths), applies port math (API 8000+10i, Supabase 54321+100i), writes
`product.json`, registers the Figma brand-mode placeholder in `tokens.config.json`, runs
`pnpm install`, and prints the infra checklist (Supabase projects, Fly apps, Vercel, EAS
projectId, desktop-releases repo, Sentry DSNs, CI secrets). Work through that checklist —
those are the accounts it cannot create for you.
