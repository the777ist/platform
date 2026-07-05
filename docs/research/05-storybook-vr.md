# Storybook + visual regression — accuracy review (June 2026)

## Summary

**14 claims checked** across PHILOSOPHY.md (Design-system-workbench bullet, Testing-strategy VR
row, directory tree) and `docs/phase-2-design-system.md` step (c) / `docs/phase-8-cicd-obs.md`
step (e).

- ✅ Accurate: 8
- ⚠️ Needs change / imprecise: 5
- ❌ Wrong: 0
- ❓ Open: 1

**Headline:** The framework package **`@storybook/react-native-web-vite` exists and is real**,
the RN-web-via-Vite path is officially supported and recommended, and the Playwright
`index.json` + `toHaveScreenshot` + `globals=theme:dark` VR approach is sound and current.
The one material drift is **version**: the plan/guide are written against **Storybook 8**
implicitly (and the guide cites no major), but as of June 2026 the current `latest` is
**Storybook 10** (10.4.4), with 9.1.20 and 8.6.18 also maintained. The more impactful
_correctness_ issues are in the Phase-2 setup mechanics: the documented NativeWind path uses
**`pluginReactOptions.jsxImportSource: "nativewind"`** in the framework `options` (the plan
omits this), and the framework's bundled **`vite-plugin-rnw` aliases `react-native` →
`react-native-web` automatically** (the plan's manual `resolve.alias` is redundant, not the
documented happy path). NativeWind-in-Storybook is a known, finicky integration (open
Storybook issue #32018) — the plan's "just import global.css + alias" recipe is incomplete.

**Verdict: SOUND with corrections.** The architecture (single RNW-Vite workbench, per-variant
CSF3 stories, static build → Playwright over `index.json`, committed baselines, nightly CI)
is exactly the supported pattern. Fix the framework setup details (jsxImportSource, drop the
manual alias, add the Tailwind/Vite CSS step explicitly) and pin to a real, current major.

---

## Findings

### 1. Framework package name `@storybook/react-native-web-vite`

- **Location:** PHILOSOPHY.md Decision-sheet "Design system workbench" + line 292 ("framework
  `@storybook/react-native-web-vite`"); phase-2 step (c) `main.ts`.
- **Claim:** A Storybook framework package named `@storybook/react-native-web-vite` exists and
  renders RN components through react-native-web via Vite (not on-device
  `@storybook/react-native`).
- **Status:** ✅
- **Finding:** Confirmed real and published. npm `latest` = **10.4.4** (registry modified
  2026-06-12). Maintained across majors via dist-tags `v8: 8.6.18`, `v9: 9.1.20`,
  `latest (v10): 10.4.4`. Official docs page exists
  (`/docs/get-started/frameworks/react-native-web-vite`). It is a distinct framework from
  on-device `@storybook/react-native`, exactly as the plan states. Storybook 9 explicitly
  ships RN + RN-Web side-by-side; this is the recommended web-fidelity path.
- **Recommended change:** None to the name. Pin to a chosen major (see Finding 2).
- **Source(s):** npm registry (`npm view @storybook/react-native-web-vite`); Storybook 9 blog;
  Storybook docs frameworks/react-native-web-vite.

### 2. Storybook major version — plan reads as SB8, current is SB10

- **Location:** Whole plan (no major named); phase-2 step (c) install list (`storybook`,
  `@storybook/react-native-web-vite`, `@storybook/react-vite`, `vite`, …).
- **Claim:** (implicit) the Storybook 8-era package set / API.
- **Status:** ⚠️
- **Finding:** As of June 2026 the current major is **Storybook 10** (10.0 released
  Oct/Nov 2025; `latest` 10.4.4). SB9 (9.1.20) and SB8 (8.6.18) remain published and the
  framework package tracks all three. The framework's own peer deps require
  `storybook: "^10.4.4"` for `@latest`. SB10's headline breaking change is **ESM-only**
  (drop CJS); SB9 was the leaner-install / built-in-test release. RN `>=0.74.5` is a peer dep,
  so SDK 56 / RN 0.85 is fine on any of these lines.
- **Recommended change:** Decide the major explicitly and pin it. Recommend **Storybook 9
  (9.1.x)** for the lowest-friction RN-Web path unless ESM-only (SB10) is desired across the
  monorepo — the phase-2 "freeze to installed versions" note already covers pinning, but the
  guide should name the target major. Confirm the toolchain is ESM-clean before choosing SB10.
- **Source(s):** Storybook 10.0 release page; Storybook 10 blog; npm dist-tags; framework
  peerDependencies.

### 3. NativeWind/Tailwind through Vite — missing `jsxImportSource: "nativewind"`

- **Location:** PHILOSOPHY.md line 293–294 ("Vite config … runs the NativeWind/Tailwind step on
  `global.css`"); phase-2 step (c) `main.ts` `viteFinal`.
- **Claim:** NativeWind utilities resolve in Storybook by importing `global.css` and running a
  Tailwind step; the `main.ts` shown only sets `resolve.alias`.
- **Status:** ⚠️ (the more important correctness issue)
- **Finding:** The documented + example-repo setup configures NativeWind via the framework
  **`options.pluginReactOptions.jsxImportSource: "nativewind"`** (alongside
  `jsxRuntime: "automatic"`), NOT just a CSS import. The plan/guide `main.ts` omits this
  entirely, so `className`/NativeWind utilities will **not** resolve as written. NativeWind in
  RNW-Vite Storybook is a known, fiddly integration — open Storybook issue **#32018**
  ("NativeWind Styles Not Displaying in Storybook React Native Web Vite") documents that you
  need _all_ of: `jsxImportSource: "nativewind"`, the Tailwind directives imported
  (`global.css`), and an actual Tailwind CSS pipeline in Vite (PostCSS+autoprefixer for
  Tailwind v3, or `@tailwindcss/vite` for v4). The reference example
  (`dannyhw/vite-rnw-example`) uses NativeWind v4 + Tailwind v3 + `autoprefixer` +
  `@vitejs/plugin-react`, framework `options.pluginReactOptions.jsxImportSource: "nativewind"`,
  and `import "../global.css"` in preview.
- **Recommended change:** Replace the `main.ts` skeleton with the framework-`options` form:
  ```ts
  framework: {
    name: "@storybook/react-native-web-vite",
    options: { pluginReactOptions: { jsxRuntime: "automatic", jsxImportSource: "nativewind" } },
  }
  ```
  and make the Tailwind CSS pipeline explicit (PostCSS+`tailwindcss`+`autoprefixer`, or
  `@tailwindcss/vite`). Add issue #32018 as a gotcha. The phase-2 guide already lists
  `@tailwindcss/vite` (or postcss/tailwind/autoprefixer) as a devDep — good, but the wiring
  must appear in `main.ts`/Vite, not be left implicit.
- **Source(s):** Storybook docs frameworks/react-native-web-vite; `dannyhw/vite-rnw-example`
  `.storybook/main.ts`; Storybook issue #32018; Storybook discussion #28399.

### 4. Manual `react-native` → `react-native-web` alias in `viteFinal`

- **Location:** PHILOSOPHY.md line 293 ("Vite config aliases `react-native` → `react-native-web`");
  phase-2 step (c) `main.ts` `resolve.alias`; phase-2 Gotchas ("Without the `resolve.alias`
  … RN imports fail").
- **Claim:** You must manually alias `react-native` → `react-native-web` in the Storybook Vite
  config or RN imports fail.
- **Status:** ⚠️
- **Finding:** Not accurate for this framework. `@storybook/react-native-web-vite` bundles
  **`vite-plugin-rnw`** (confirmed in its `dependencies`), which performs the
  react-native→react-native-web aliasing (and pulls in RN/Expo modules) **automatically**. The
  reference example's `main.ts` contains **no** manual `react-native` alias. The manual alias
  is harmless-but-redundant, and the Gotcha's claim that omitting it breaks RN imports is
  wrong for the documented setup. (The `@` → `src` alias is still legitimately needed for the
  component import convention.)
- **Recommended change:** Drop the `"react-native": "react-native-web"` alias from `main.ts`
  and the corresponding Gotcha; keep only the `@` → `src` alias (or use the framework's
  `vite-tsconfig-paths` dep, also bundled). Note the alias is auto-handled by `vite-plugin-rnw`.
- **Source(s):** framework `dependencies` (`vite-plugin-rnw`, `vite-tsconfig-paths`);
  `dannyhw/vite-rnw-example` `.storybook/main.ts`; Storybook docs / dev.to RNW-Vite article.

### 5. Type imports from `@storybook/react` (stories + preview)

- **Location:** phase-2 step (c): `import type { Preview, Decorator } from "@storybook/react"`
  and `import type { Meta, StoryObj } from "@storybook/react"` in the story files.
- **Claim:** Story/preview types come from `@storybook/react`.
- **Status:** ⚠️
- **Finding:** Works (the reference example imports `Preview` from `@storybook/react`, and
  `@storybook/react` is a transitive dep of the framework), so this is not broken. But the
  **SB9/10 documented convention** is to import `Meta`/`StoryObj`/`Preview`/`Decorator` from
  the **framework package** — here `@storybook/react-native-web-vite` (or `@storybook/react-vite`)
  — for correct framework-specific typing and future-proofing (SB10 pushes CSF factories /
  `preview.meta`). Using `@storybook/react` is the legacy path.
- **Recommended change:** Prefer `import type { Meta, StoryObj } from "@storybook/react-native-web-vite"`
  and `import type { Preview, Decorator } from "@storybook/react-native-web-vite"`. Optional /
  low-severity; flag as a convention update, not a bug.
- **Source(s):** Storybook docs install/setup (framework-package import guidance); Storybook 10
  blog (CSF factories); `dannyhw/vite-rnw-example` preview.

### 6. Static build → `storybook-static/` + `index.json`

- **Location:** PHILOSOPHY.md line 299–300 ("`storybook build` → `storybook-static/`; Playwright
  reads `storybook-static/index.json`"); phase-2 DoD #6; phase-8 step (e) VR spec
  (`index.entries`, filter `type === "story"`).
- **Claim:** `storybook build` emits `storybook-static/` containing `index.json`, whose
  `entries` map carries per-story metadata with a `type` field (`"story"`).
- **Status:** ✅
- **Finding:** Correct and current. `stories.json` was **removed in Storybook 8**; **only
  `index.json` is produced in 9.x/10.x**, served at `/index.json` and written into
  `storybook-static/`. Its shape is `{ v, entries: { [id]: { id, title, name, type, … } } }`
  with `type ∈ {"story","docs"}`. The phase-8 VR loop (`Object.values(index.entries).filter(e
=> e.type === "story")`) matches the real schema. `storybook index` can also generate just
  the index faster (a nice optimization, not required).
- **Recommended change:** None. (Optional: mention `storybook index` for faster index-only
  regeneration in CI.)
- **Source(s):** Storybook indexers docs (main-config-indexers); Storybook composition docs;
  lost-pixel issue #431 ("index.json in 9.x, stories.json removed in v8").

### 7. Playwright `toHaveScreenshot` + committed baselines, nightly

- **Location:** PHILOSOPHY.md Testing-strategy VR row + line 299–300; phase-8 step (e)
  `visual-regression.spec.ts` (`toHaveScreenshot`) + `playwright.config.ts`; `e2e-nightly.yml`.
- **Claim:** Playwright `toHaveScreenshot` against the served static build, committed
  baselines, run nightly + on-demand.
- **Status:** ✅
- **Finding:** Sound and current. Playwright `latest` = **1.60.0** (June 2026). `toHaveScreenshot`
  with committed baselines (`*-snapshots/`, `--update-snapshots`) is the standard,
  well-documented free VR approach for Storybook (multiple canonical guides). Serving
  `storybook-static` via `http-server`/`serve` and visiting `iframe.html?id=…` per story is
  the established pattern. The two-job nightly split (E2E vs VR) is reasonable.
- **Recommended change:** None functional. Note OS/browser-version pinning matters for
  pixel-stable baselines — run VR in the same container as CI (Playwright's pinned chromium via
  `playwright install --with-deps chromium`, which the workflow already does). Consider
  documenting `maxDiffPixelRatio`/`threshold` to reduce flake.
- **Source(s):** npm `@playwright/test` (1.60.0); Playwright VR guides (pow.rs, oberlehner,
  jamesiv.es); Bug0 Playwright VR 2026.

### 8. Navigating `iframe.html?id=<story>&globals=theme:dark`

- **Location:** PHILOSOPHY.md line 300; phase-8 VR spec
  (`/iframe.html?id=${story.id}&globals=theme:${theme}`).
- **Claim:** Setting the toolbar theme global via the iframe URL using `globals=theme:dark`
  drives the light/dark decorator per story.
- **Status:** ✅
- **Finding:** Correct syntax. The `globals` URL param was added in PR **#15056**; the format
  is `globals=key:value` (comma-separated for multiple, e.g. `globals=theme:dark,brand:demo`).
  It only takes effect because the preview decorator reads `ctx.globals.theme`/`ctx.globals.brand`
  — which the phase-2 `preview.tsx` decorator does (toggles `.dark`, applies brand vars). Note
  the common pitfall: a bare `theme=dark` query param does **not** work — must be `globals=…`.
  The plan uses the correct form.
- **Recommended change:** None. (Optional: the VR spec only sweeps `theme` × {light,dark}; to
  fully cover the locked "brand switcher" it should also sweep `brand:template|demo`, e.g.
  `globals=theme:dark,brand:demo`, to baseline the demo brand mode — consistent with PHILOSOPHY.md's
  "each story × {light,dark}" which currently omits brand.)
- **Source(s):** Storybook PR #15056 (globals URL param); Storybook toolbars-and-globals docs;
  issue #11604; discussion #23328.

### 9. `globalTypes` + toolbar for theme + brand; decorator wraps in theme provider

- **Location:** PHILOSOPHY.md line 293–294 ("toolbar exposes a light/dark toggle AND a brand
  switcher … two toolbar `globalTypes`"); phase-2 step (c) `preview.tsx`.
- **Claim:** Two `globalTypes` (`theme`, `brand`) render as toolbar dropdowns; a global
  decorator imports `global.css`, wraps in the theme provider, and applies theme/brand.
- **Status:** ✅
- **Finding:** API-correct. `globalTypes` with a `toolbar` config (items/icon/title/dynamicTitle)
  is the documented way to add toolbar dropdowns; global `decorators` reading `ctx.globals`
  is standard. This is unchanged through SB8→10 (SB10 adds CSF-factory `preview.meta` as an
  _additional_ option, not a replacement). The decorator's `document.documentElement` /
  `setProperty` brand-override approach is valid for the web (RNW) target.
- **Recommended change:** None required. (Forward-looking: SB10 favors typed `globalTypes`/CSF
  factories; current form remains supported.)
- **Source(s):** Storybook toolbars-and-globals docs; newline.co themes-with-globals;
  discussion #18446.

### 10. `*.stories.tsx` CSF3, one story per cva variant

- **Location:** PHILOSOPHY.md line 42 ("`*.stories.tsx`, one story per cva variant"); phase-2 step
  (c) `button.stories.tsx`.
- **Claim:** CSF3 `*.stories.tsx` with a `meta` default export + per-variant named `StoryObj`
  exports.
- **Status:** ✅
- **Finding:** Matches CSF3 exactly (`const meta: Meta<typeof X>`, `export default meta`,
  `export const Default: Story = { args: {…} }`). Current and idiomatic in SB8/9/10. Only the
  type-import source is the convention nit from Finding 5.
- **Recommended change:** None beyond Finding 5.
- **Source(s):** Storybook CSF / intro-to-storybook tutorial; SB10 blog.

### 11. Storybook dev port 6006 vs app 8081

- **Location:** phase-2 step (c) `storybook dev -p 6006`; OPEN flag + Gotcha.
- **Claim:** Storybook dev defaults to 6006; chosen to avoid the Expo 8081 clash.
- **Status:** ✅
- **Finding:** Correct — 6006 is the Storybook default dev port; no conflict with Expo's 8081.
  The phase-8 VR config serves `storybook-static` on 6006 too (consistent). Pure config choice,
  no drift.
- **Recommended change:** None. (The OPEN flag can be resolved/closed.)
- **Source(s):** Storybook docs (default port 6006).

### 12. `react-native-web` peer/version compatibility

- **Location:** phase-2 step (c) install list (`react-native-web`); RN 0.85 / SDK 56 target.
- **Claim:** RN-web works with the framework on the SDK 56 / RN 0.85 stack.
- **Status:** ✅
- **Finding:** Compatible. Framework peers: `react-native >= 0.74.5`,
  `react-native-web ^0.19.12 || ^0.20.0 || ^0.21.0`, `react ^16…^19`, `vite ^5…^8`. RN 0.85 and
  current RNW (0.20/0.21) fall in range. No version conflict with the SDK-56 frontend.
- **Recommended change:** Pin `react-native-web` to whatever `expo install` resolves for SDK 56
  (the plan already says install Expo deps via `expo install`).
- **Source(s):** framework peerDependencies.

### 13. `@storybook/react-vite` listed as a separate install dep

- **Location:** phase-2 step (c) install list includes both `@storybook/react-native-web-vite`
  and `@storybook/react-vite` + `vite` + `@vitejs/plugin-react`.
- **Claim:** You must separately install `@storybook/react-vite`.
- **Status:** ⚠️
- **Finding:** Slightly redundant. `@storybook/react-native-web-vite` **depends on**
  `@storybook/react-vite`, `@storybook/react`, and `@storybook/builder-vite` (confirmed in its
  `dependencies`), so they are pulled transitively. `vite` and `react-native-web` are _peer_
  deps you must provide; `@vitejs/plugin-react` is bundled via the framework's React plugin
  options. Listing `@storybook/react-vite` explicitly isn't wrong, but it's not required and
  could drift out of lockstep with the framework's pinned version.
- **Recommended change:** Install `storybook` + `@storybook/react-native-web-vite` + the peers
  (`vite`, `react`, `react-dom`, `react-native`, `react-native-web`) + the Tailwind toolchain.
  Drop the explicit `@storybook/react-vite` (and `@vitejs/plugin-react` unless you need to
  override plugin options). Let the framework pin its own `@storybook/*` siblings.
- **Source(s):** framework `dependencies` (`@storybook/react-vite`, `@storybook/react`,
  `@storybook/builder-vite`, `vite-plugin-rnw`).

### 14. Chromatic declined / self-hosted Playwright VR

- **Location:** PHILOSOPHY.md line 42 ("Chromatic deliberately declined … self-hosted Playwright").
- **Claim:** Self-hosted Playwright VR over the static build is a viable free alternative to
  Chromatic, consistent with the no-paid-SaaS stance.
- **Status:** ✅
- **Finding:** Sound. The "run VR with Storybook + Playwright for free" pattern is widely
  documented and is the standard self-hosted alternative to Chromatic. The trade-off (you own
  baseline pixel-stability / cross-machine flake management) is real but well-understood and
  mitigated by running baselines in the CI container.
- **Recommended change:** None. (Operational note already in Finding 7.)
- **Source(s):** oberlehner / pow.rs free-VR guides; Storybook test-runner docs.

---

## Resolved OPEN / TO CONFIRM (in-scope)

- **phase-2 OPEN: Storybook dev port (6006 vs app 8081).** ✅ Resolved — **6006** is the
  Storybook default and does not clash with Expo's 8081. Keep 6006. (Storybook docs.)
- **phase-2 OPEN: exact Storybook/Vite version pins.** Resolvable now —
  framework `@latest` 10.4.4 requires `storybook ^10.4.4`; maintained alternatives are
  `9.1.20` and `8.6.18`. Pin a chosen major (recommend SB9 `9.1.x` unless the repo is ESM-only
  ready for SB10) plus `vite ^5–^8`, `react-native-web ^0.20/^0.21`. (npm dist-tags +
  peerDependencies.)
- **phase-2 (c) OPEN — react-native alias requirement.** ✅ Resolved — **not required**;
  `vite-plugin-rnw` (bundled by the framework) aliases it automatically (Finding 4). Keep only
  the `@` → `src` alias.
- **❓ Still open (out of pure-VR scope but flagged):** whether the VR sweep should also cover
  the **brand** global (`globals=theme:…,brand:…`) — PHILOSOPHY.md's VR row says "each story ×
  {light,dark}" only, yet the workbench's locked feature is the brand switcher. Recommend
  extending the matrix to baseline `brand:demo` as well (Finding 8). Needs a product decision,
  not a doc fact.

---

## Sources

- npm registry — `@storybook/react-native-web-vite` (version 10.4.4; dist-tags v8 8.6.18 / v9
  9.1.20 / latest 10.4.4; peer + dependencies incl. `vite-plugin-rnw`, `@storybook/react-vite`,
  `@storybook/react`, `@storybook/builder-vite`)
- npm registry — `storybook` dist-tags (v7 7.6.24 / v8 8.6.18 / v9 9.1.20 / latest 10.4.4)
- npm registry — `@playwright/test` (latest 1.60.0)
- https://storybook.js.org/docs/get-started/frameworks/react-native-web-vite
- https://storybook.js.org/blog/storybook-9/
- https://storybook.js.org/announce/sb9
- https://storybook.js.org/releases/10.0
- https://storybook.js.org/blog/storybook-10/
- https://storybook.js.org/docs/releases/migration-guide
- https://storybook.js.org/docs/get-started/install
- https://storybook.js.org/docs/api/main-config/main-config-indexers
- https://storybook.js.org/docs/sharing/storybook-composition
- https://storybook.js.org/docs/essentials/toolbars-and-globals/
- https://github.com/storybookjs/storybook/pull/15056 (globals URL param)
- https://github.com/storybookjs/storybook/issues/11604 (global args via iframe URL)
- https://github.com/storybookjs/storybook/discussions/23328 (theme via iframe query)
- https://github.com/storybookjs/storybook/issues/32018 (NativeWind styles not displaying in RNW-Vite)
- https://github.com/storybookjs/storybook/discussions/28399 (NativeWind + RNW-Vite)
- https://github.com/dannyhw/vite-rnw-example (NativeWind + Tailwind + RNW-Vite reference: main.ts options.pluginReactOptions.jsxImportSource:"nativewind"; @storybook/* ^8.6.12; nativewind ^4)
- https://github.com/lost-pixel/lost-pixel/issues/431 (index.json in 9.x; stories.json removed in v8)
- https://dev.to/dannyhw/react-native-web-with-vite-1jg5
- https://markus.oberlehner.net/blog/running-visual-regression-tests-with-storybook-and-playwright-for-free
- https://pow.rs/blog/playwright-vrt/
- https://jamesiv.es/blog/frontend/testing/2024/03/11/visual-testing-storybook-with-playwright/
- https://bug0.com/knowledge-base/playwright-visual-regression-testing
