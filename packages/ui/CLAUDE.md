# @platform/ui — design-system runbook

The shared component library for every product, on every target (iOS / Android / web /
desktop). Components here are **OWNED source** (shadcn model — copied in, then ours), consumed
as source (no build step). Designer-facing Figma conventions live in [FIGMA.md](./FIGMA.md).

## The two invariants

1. **Semantic tokens ONLY — never name a color.** Components use `bg-primary`,
   `text-foreground`, `border-border`, … (the `@platform/config/tailwind-preset` maps them to
   `hsl(var(--x))`). No hex, no `rgb()`, no raw tailwind palette colors. This is what makes one
   component set brandable per product and dark-mode-switchable at runtime.
2. **Two-tier ownership.** Tier-1 owned primitives live in `src/components/ui/`. Tier-2
   product compositions start product-local (`app/features/<feature>/components/`) and are
   **promoted down here on 2nd use** — never shared speculatively.

## Add a component (the fixed recipe — `/add-component <name>`)

1. `cli-add` (or author by hand): `pnpm --filter @platform/ui dlx @react-native-reusables/cli add <name>`,
   then reconcile into the owned shadcn shape — cva variants, semantic tokens only, `cn()`,
   `className` escape hatch.
2. Pin any new `@rn-primitives/*` deps **exact** (no caret — version-coupled to
   react-native-reusables).
3. Write `src/components/ui/<name>.stories.tsx` — **one story per cva variant**.
4. Write `src/components/ui/<name>.figma.tsx` — Code Connect map (Figma props → cva variants).
5. Export from `src/index.ts`.
6. Commit a VR baseline (light + dark): `pnpm --filter @platform/ui build-storybook` then
   `pnpm --filter @platform/ui exec playwright test --update-snapshots` (baselines live in
   `.storybook/visual-regression.spec.ts-snapshots/`; the nightly `e2e-nightly.yml` VR job
   diffs every story × light/dark against them).

## Theming (how it works)

- The tailwind preset declares semantic **names**; this package ships the default **values**:
  `src/global.css` (`:root`/`.dark` blocks, web) and `src/lib/theme.ts` (NativeWind `vars()`
  objects, native). `src/theme-provider.tsx` applies them.
- Products rebrand by overriding variable VALUES in their own `global.css`/`theme.ts` —
  component code is never forked.
- **`src/lib/theme.ts` and the CSS-var blocks in `src/global.css` are GENERATED** by
  `scripts/figma-tokens.mjs` (`/sync-tokens`). Never hand-edit; change tokens in the Figma
  source (or the committed fixture `figma/tokens.json`) and regenerate.

## Storybook workbench

- `pnpm --filter @platform/ui storybook` → http://localhost:6006 (app stays on 8081).
- Toolbar: **Theme** (light|dark) and **Brand** (template|demo) — the live preview surface for
  the Figma token modes (Figma modes ARE the brand modes).
- `pnpm --filter @platform/ui build-storybook` → `storybook-static/` (+ `index.json`, consumed
  by the Playwright VR sweep).

## Figma bridge

- **Tokens:** `/sync-tokens` → `node scripts/figma-tokens.mjs` (source-abstracted: committed
  Tokens Studio DTCG fixture by default; REST Variables API on Enterprise). Config:
  `tokens.config.json` at repo root.
- **Components:** colocated `*.figma.tsx` Code Connect maps; CLI config is the repo-root
  `figma.config.json`; publish uses `FIGMA_ACCESS_TOKEN` (distinct from the REST pull's
  `FIGMA_TOKEN`).
- **Handover day:** `/bootstrap-design-system` — reconcile → tokens → components → verify.
