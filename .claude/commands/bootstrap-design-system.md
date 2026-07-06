Handover-day import of a published Figma team library into `packages/ui` (no product arg;
one-time, then incremental). Follow the full procedure in PHILOSOPHY.md ("Bootstrap the
design system from Figma") — summary:

0. **Connect + inventory + reconcile**: pull the token manifest (variables: collections,
   modes, names, types) and component manifest (component sets + variant schemas);
   reconcile against `packages/ui/FIGMA.md` conventions WITH design before importing
   (raw-hex fills, modes that don't map to light/dark×brand, non-code-friendly variants).
1. **Tokens first (keystone)**: map Figma semantic variables → the canonical CSS-var
   contract in `tokens.config.json`, then `/sync-tokens` → `packages/ui` `theme.ts` +
   `global.css`.
2. **Components second**: walk the manifest in dependency order (Text → Button/Input/Card
   → composites); per component run `/add-component` aligned to the Figma variants;
   publish Code Connect maps.
3. **Verify on all four targets**: Storybook gallery + brand/theme toolbar; `_template`
   app on web/native/desktop; commit VR baselines; prove the live bind — change one Figma
   token → `/sync-tokens` → everything re-themes.
