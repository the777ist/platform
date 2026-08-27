Regenerate theme files from the Figma token source. Never hand-edit generated theme.ts.

1. `node scripts/figma-tokens.mjs`
2. Review the diff in packages/ui/src/lib/theme.ts (+ packages/ui/src/global.css).
3. Commit. (`node scripts/check-theme-tokens.mjs` runs in pre-push AND CI: it regenerates from
   tokens.json and fails if the committed theme.ts / global.css differ, so a hand-edit to a
   generated file cannot land.)
