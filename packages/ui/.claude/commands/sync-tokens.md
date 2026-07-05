Regenerate theme files from the Figma token source. Never hand-edit generated theme.ts.

1. `node scripts/figma-tokens.mjs`
2. Review the diff in packages/ui/src/lib/theme.ts (+ packages/ui/src/global.css).
3. Commit. (CI re-runs and `git diff --exit-code` guards drift, like typegen.)
