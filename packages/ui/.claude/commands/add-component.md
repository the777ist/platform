Add a Tier-1 owned primitive to @platform/ui. Argument: $ARGUMENTS (component name).

1. cli-add (or author): `pnpm --filter @platform/ui dlx @react-native-reusables/cli add <name>`
   then reconcile into the owned shadcn shape (cva variants, semantic tokens ONLY, cn()).
   The CLI prompts for a components.json in fresh checkouts — authoring by hand into the
   shadcn shape (see src/components/ui/button.tsx as the reference) is equally valid.
2. Pin any new @rn-primitives/* deps EXACT (no caret).
3. Write src/components/ui/<name>.stories.tsx — one story per cva variant.
4. Write src/components/ui/<name>.figma.tsx — Code Connect map (Figma props → cva variants).
5. Export from src/index.ts.
6. Commit a VR baseline (light + dark) by running the Storybook build + Playwright snapshot.
