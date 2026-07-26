Remove a stamped product â€” the inverse of `/new-product`. Argument: $ARGUMENTS (the
product's kebab-case name; `products/_template` is refused â€” it's the mold).

```bash
pnpm remove-product $ARGUMENTS   # = node scripts/remove-product.mjs $ARGUMENTS [--yes]
```

DESTRUCTIVE: it stops the product's local Supabase stack (with `--no-backup`, dropping its
data volumes) BEFORE deleting `products/<name>`, removes the brand-mode entry from
`tokens.config.json`, runs `pnpm install` to drop the workspaces from the lockfile, and
prints the de-provision checklist (Fly apps, Supabase projects, Vercel, EAS, Sentry,
desktop-releases repo, CI secrets + the product's deploy-api/eas-update filter entries).
Interactive runs must type the product name to confirm; non-interactive runs need `--yes`.
The deletion lands in the working tree â€” review and commit it.
