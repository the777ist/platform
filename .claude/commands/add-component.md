Add a Tier-1 owned primitive to the SHARED `packages/ui` (no product arg). Argument:
$ARGUMENTS (component name).

Delegates to the design-system runbook — follow the fixed recipe in
`packages/ui/CLAUDE.md` (also available as `packages/ui/.claude/commands/add-component.md`):

1. cli-add or author into `src/components/ui/<name>.tsx` — owned shadcn shape, cva
   variants, semantic tokens ONLY.
2. Pin new `@rn-primitives/*` deps EXACT.
3. `<name>.stories.tsx` — one story per cva variant.
4. `<name>.figma.tsx` — Code Connect map.
5. Export from `src/index.ts`.
6. Commit the VR baseline (light + dark):
   `pnpm --filter @the777incident/ui build-storybook && pnpm --filter @the777incident/ui exec playwright test --update-snapshots`
