Handover-day bootstrap of the design system from a published Figma team library
(Foundations = Variables; Components = component sets). One-time, then incremental.
Tokens FIRST, components SECOND. Runs against the real library OR the committed token
fixture (`packages/ui/figma/tokens.json`).

Step 0 — connect + inventory + reconcile: get read access (Figma MCP Dev Mode or
FIGMA_TOKEN). Pull the token manifest (get_variable_defs / REST dump → collections, modes,
names, types) and the component manifest (get_metadata over the Components page → component
sets + variant schemas). Reconcile against FIGMA.md: flag raw-hex fills not bound to
variables, modes not mapping to light/dark/brand, non-code-friendly variant values. Resolve
with design BEFORE importing.

Step 1 — establish tokens (keystone): fix the canonical CSS-var contract; map Figma
semantic variables → those names in tokens.config.json (fileKey + mode IDs); run
`node scripts/figma-tokens.mjs` → packages/ui default theme.ts + global.css. (If no Figma
file yet, run against the committed Tokens Studio fixture.)

Step 2 — establish components: walk the component manifest in dependency order
(Text → Button/Input/Card → composites); per component run the add-a-component recipe
(rn-reusables cli-add aligned to Figma variants, or author bespoke), accelerated by
get_design_context + get_code_connect_suggestions; fill the real node URLs in the
*.figma.tsx maps and publish them (`figma connect publish`, FIGMA_ACCESS_TOKEN).

Step 3 — verify on all four targets: Storybook full gallery + brand/theme toolbar;
_template app themed on web/native/desktop; commit VR baselines; prove the live bind —
change one Figma token → /sync-tokens → everything re-themes.
