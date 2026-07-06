Regenerate every product's theme files from the Figma token source (no product arg —
operates on the shared token pipeline):

```bash
node scripts/figma-tokens.mjs
```

Source-abstracted (PHILOSOPHY Figma bridge): committed Tokens Studio DTCG export by default
(`packages/ui/figma/tokens.json`), Figma REST Variables API on Enterprise plans. Config:
`tokens.config.json` at repo root (fileKey + brand-mode ids — `TODO-MODE-ID-*` until the
designer creates the modes). Output (`theme.ts` + `global.css` CSS-var blocks per product +
`packages/ui` defaults) is GENERATED AND COMMITTED — review the diff, never hand-edit.
