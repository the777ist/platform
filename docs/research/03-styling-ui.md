# Styling & UI — accuracy review (June 2026)

## Summary

**Checked:** 22 claims across NativeWind (v4 vs v5, setup, theming APIs), Tailwind major
version & the `hsl(var(--x))` preset pattern, react-native-reusables (shadcn-for-RN model,
CLI, component list), `@rn-primitives/*` versions, and the CSS-variable light/dark theming
mechanism on web vs native.

**Issue counts:** ✅ 16 · ⚠️ 4 · ❌ 0 · ❓ 2

**Headline — the v4 vs v5 decision is CORRECT and current.** As of June 2026 the npm
`latest` dist-tag for `nativewind` is **4.2.5** (published 2026-06-05). v5 is still
**`5.0.0-preview.4`** (published 2026-05-15) on a `preview` tag — i.e. a pre-release, not
stable. The plan's instruction "**use NativeWind v4; v5 is pre-release — do NOT use**" is
accurate and well-evidenced. NativeWind v4 targets **Tailwind CSS v3** (`tailwindcss@^3.4`),
which is exactly why the plan's `tailwind.config.js` preset with `hsl(var(--x))` semantic
tokens is the right, documented (shadcn-style) pattern — and why the plan must NOT adopt
Tailwind v4's CSS-first `@theme` config (that path belongs to NativeWind v5). The plan's
supporting pins are internally consistent with the v4/Tailwind-v3 choice (notably
`tailwind-merge@2.6.0`, the correct line for Tailwind v3).

**Verdict: GO on v4.** The single substantive correction is factual drift, not a design
flaw: `@rn-primitives/*` is **no longer pre-1.0** — `latest` is **1.4.0** (the plan pins
1.2.0 and repeatedly calls these packages "pre-1.0"). The "pin exact" discipline is still
sound; the "pre-1.0" rationale wording is stale. Secondary watch-items: the
react-native-reusables project has moved orgs (`mrzachnugent` → `founded-labs`) and now
supports **both NativeWind and Uniwind**, and its CLI has a known dependency on a
Tailwind-v3-style `tailwind.config.js` (matches the plan, but worth noting).

---

## Findings

### 1. NativeWind v4 is current/stable; v5 is pre-release — plan is correct

- **Location:** PHILOSOPHY.md L29 ("NativeWind v4 (v5 is pre-release — do NOT use)"); ruling #8;
  phase-2 L31, Gotchas L1427 ("Use NativeWind v4 (v5 is pre-release — forbidden)").
- **Claim:** v4 is the production choice; v5 is pre-release and must not be used.
- **Status:** ✅
- **Finding:** npm `dist-tags` for `nativewind`: `latest = 4.2.5` (2026-06-05),
  `preview = 5.0.0-preview.4` (2026-05-15), `nightly = 0.0.0-nightly.*`. v5 has been on a
  `preview` tag since 2025-09-24 and has not promoted to `latest` as of June 2026. The
  NativeWind docs site keeps v5 under a separate `/v5` path and describes it as building on
  v4/v4.1 with a still-evolving setup. Decision fully supported by evidence.
- **Recommended change:** None. Optionally note in the plan that v4 has continued to ship
  patch releases through 2026 (4.2.2–4.2.5), so v4 is actively maintained, not frozen.
- **Source(s):** npm registry `nativewind` dist-tags + time map (queried 2026-06-13);
  https://www.nativewind.dev/v5 ; https://www.nativewind.dev/v5/guides/migrate-from-v4

### 2. What v5 changes (for the record) — confirms why v4 is the safe choice

- **Location:** PHILOSOPHY.md L29; phase-2 Gotchas L1427–1433.
- **Claim (implicit):** v5 is a meaningfully different setup not worth adopting yet.
- **Status:** ✅
- **Finding:** v5's headline changes: it moves to **Tailwind CSS v4.1+** (CSS-first
  `@theme` config), simplifies Metro/Babel setup, improves web alignment (rem/spacing/
  variables) and Reanimated-backed animations, and **deprecates** several v4 APIs (runtime
  warnings now, removal later) — including the `vars()`/`cssInterop`/`remapProps` surface in
  favor of a unified `styled` API + `VariableContextProvider`. Adopting v5 would force a
  Tailwind v3→v4 migration and a different theming-config story. Staying on v4 keeps the
  plan's documented `tailwind.config.js` + `hsl(var(--x))` + `vars()` pattern valid.
- **Recommended change:** None. The Gotchas section already frames this correctly.
- **Source(s):** https://www.nativewind.dev/v5/guides/migrate-from-v4 ;
  https://www.nativewind.dev/v5/core-concepts/tailwindcss ;
  https://www.nativewind.dev/v5/guides/themes ; https://www.nativewind.dev/docs/api/css-interop

### 3. NativeWind v4 uses Tailwind CSS **v3**, not v4 — preset approach is correct

- **Location:** PHILOSOPHY.md ruling #8, "Theming wiring" gotcha L263; phase-2 step (b)
  tailwind-preset.js; DoD #4.
- **Claim (implicit):** a JS `tailwind.config.js`/preset mapping semantic names to
  `hsl(var(--x))` is the right mechanism.
- **Status:** ✅
- **Finding:** NativeWind v4 is built for **Tailwind v3** (`tailwindcss@^3.4`). Tailwind v3
  uses the classic JS config + preset model, where the shadcn convention is
  `colors.primary = "hsl(var(--primary))"` reading CSS variables. This is exactly the
  plan's preset. Tailwind **v4** (current `latest = 4.3.1`) replaces JS config with
  CSS-first `@theme`, but that only matters under NativeWind **v5** — irrelevant to a v4
  build. The plan does NOT use Tailwind v4 CSS-first config and should not, given the v4
  decision.
- **Recommended change:** None. (The plan never pins `tailwindcss` to a version; when it
  does at execution time, pin **`tailwindcss@^3.4`**, NOT v4 — worth stating explicitly to
  avoid an accidental v4 install that breaks NativeWind v4.)
- **Source(s):** LogRocket "Getting started with NativeWind" (v4 → `tailwindcss@^3.4`);
  https://tailwindcss.com/blog/tailwindcss-v4 ; npm `tailwindcss` dist-tags
  (`latest 4.3.1`, `v3-lts 3.4.19`).

### 4. `withNativeWind` metro + `jsxImportSource: "nativewind"` babel setup — correct for v4

- **Location:** PHILOSOPHY.md "metro.config.js"/"babel.config.js" gotchas L257–259; phase-2
  step (h) metro.config.js + babel.config.js.
- **Claim:** `module.exports = withNativeWind(config, { input: "./global.css" })`;
  babel `["babel-preset-expo",{jsxImportSource:"nativewind"}],"nativewind/babel"`.
- **Status:** ✅
- **Finding:** This is the documented NativeWind v4 setup: wrap the metro config with
  `withNativeWind` (from `nativewind/metro`) pointing at the CSS entry, and set
  `jsxImportSource: "nativewind"` on `babel-preset-expo` plus the `nativewind/babel`
  preset. The optional `inlineNativeRem` metro option exists but is not required. Matches
  current docs.
- **Recommended change:** None.
- **Source(s):** https://www.nativewind.dev/docs (v4 setup); LogRocket NativeWind guide;
  NativeWind v4 announcement https://www.nativewind.dev/blog/announcement-nativewind-v4

### 5. `vars()` for native theming — valid in v4 (deprecated only in v5)

- **Location:** PHILOSOPHY.md ruling #8 ("NativeWind `vars()` objects on native"); phase-2
  step (b) `theme.ts` (`vars({...})`) + `theme-provider.tsx`.
- **Claim:** native side applies theme tokens via `vars()` objects on a wrapping `View`,
  shared down the tree via context.
- **Status:** ✅ (with a forward-looking ⚠️ note)
- **Finding:** `vars()` is a documented NativeWind API: it takes a dict of CSS variables
  and returns a style object that flows to children via React Context — exactly how the
  plan's `theme-provider.tsx` uses `style={themes[theme]}`. This is correct on **v4**.
  Forward note: in **v5** `vars()` is being superseded by `VariableContextProvider` and the
  v5 docs flag the older approach as deprecated — so this code is v4-correct but would need
  revisiting on any future v5 migration (consistent with the v4 decision; not a present
  issue).
- **Recommended change:** None for v4. Add a one-line note that `vars()` is a v4-era API
  that v5 deprecates, so it is part of the v4↔v5 boundary if a migration is ever undertaken.
- **Source(s):** https://www.nativewind.dev/docs/api/vars ;
  https://www.nativewind.dev/v5/guides/themes (VariableContextProvider) ;
  https://www.nativewind.dev/docs/guides/themes

### 6. `cssInterop` — exists in v4; plan does not actually rely on it

- **Location:** Domain prompt asks to verify `cssInterop`. PHILOSOPHY.md / phase-2 do not use
  `cssInterop` in any build step.
- **Claim:** n/a (no plan claim to verify; included for completeness per domain).
- **Status:** ✅ (no issue)
- **Finding:** `cssInterop` (and `remapProps`) are real v4 APIs for styling third-party /
  native components; docs say you should never need them for your own components — and the
  plan's owned primitives wrap RN core components (`Pressable`, `Text`, `TextInput`, `View`)
  that NativeWind already handles, so the plan correctly avoids `cssInterop`. (These APIs
  are deprecated in the v5 unified-`styled` direction.)
- **Recommended change:** None.
- **Source(s):** https://www.nativewind.dev/docs/api/css-interop ;
  https://www.nativewind.dev/docs/api/remap-props ;
  https://www.nativewind.dev/docs/guides/third-party-components

### 7. The `hsl(var(--x))` semantic-token preset is the documented best practice — confirmed

- **Location:** PHILOSOPHY.md ruling #8; phase-2 step (b) tailwind-preset.js + global.css.
- **Claim:** semantic CSS variables (`--background`, `--primary`, …) as HSL triples,
  consumed via `hsl(var(--x))`, with `:root` (light) + `.dark` (dark) blocks; products
  override values, not components.
- **Status:** ✅
- **Finding:** This is precisely the react-native-reusables / shadcn pattern as documented:
  CSS variables live in `global.css` (`:root` and `.dark:root` / `prefers-color-scheme`),
  the Tailwind config maps semantic color names to `hsl(var(--…))`, and a parallel JS object
  (rn-reusables calls it `NAV_THEME` in `lib/theme.ts`/`constants.ts`) holds the same values
  for things that can't read CSS vars (e.g. React Navigation theme). The plan's split —
  web reads `:root`/`.dark`, native reads `vars()` objects from `theme.ts` — mirrors this
  exactly and is the right mechanism for "one component set, per-product brand, runtime
  dark mode" on all four targets.
- **Recommended change:** None. (Minor: rn-reusables keeps a JS `NAV_THEME` constant in
  sync with `global.css` for React Navigation; if the template wires Expo Router/RN
  Navigation theming, ensure `theme.ts` covers that surface too — likely already implied by
  the `vars()` objects.)
- **Source(s):** https://reactnativereusables.com/getting-started/initial-setup/ ;
  rn-reusables Discussion #311 "Guidelines for modifying theme" ;
  Medium "System Theme Support with NativeWind v4 and React Native Reusables".

### 8. react-native-reusables IS the shadcn-for-RN model (copy-in / owned) — confirmed

- **Location:** PHILOSOPHY.md L30 ("shadcn model: components are copied in and OWNED");
  Component-lifecycle bullet; phase-2 step (a) "adopt … via its CLI (copies OWNED source)".
- **Claim:** rn-reusables follows the shadcn copy-paste/ownership model.
- **Status:** ✅
- **Finding:** The project's own tagline is "Bringing shadcn/ui to React Native … open
  source, almost as easy to use," and docs/coverage consistently describe the
  copy-paste-and-own philosophy (components are added into your project and become yours to
  edit). The plan's two-tier ownership (Tier-1 owned primitives, Tier-2 product
  compositions) is faithful to this model.
- **Recommended change:** None.
- **Source(s):** https://github.com/founded-labs/react-native-reusables (README tagline) ;
  https://reactnativereusables.com/docs ; reactscript.com rn-reusables overview.

### 9. CLI `add` command form — correct; note the org move + a known CLI bug

- **Location:** PHILOSOPHY.md L43/L159 ("react-native-reusables components copied in via its
  CLI"); phase-2 step (a) command
  `pnpm --filter @platform/ui dlx @react-native-reusables/cli@latest add text button input card`;
  add-component.md `pnpm --filter @platform/ui dlx @react-native-reusables/cli add <name>`.
- **Claim:** the CLI package is `@react-native-reusables/cli` and `add <components>` adds
  owned source.
- **Status:** ⚠️
- **Finding:** Package name is correct: `@react-native-reusables/cli`, with npm
  `latest = 0.7.1` (and a `beta = 0.5.0-beta.5`). Documented invocation is
  `npx @react-native-reusables/cli@latest add <component>`. Two caveats: (a) the project
  **moved orgs** from `mrzachnugent/react-native-reusables` to
  `founded-labs/react-native-reusables` — links/refs to the old org are stale. (b) An open
  Jan-2026 bug (issue #509) reports `cli add` failing under some package managers because it
  shells out to `shadcn@latest`; and issue #505 notes `cli init` **forces a
  `tailwind.config.js`**, which collides with CSS-first (Uniwind/Tailwind-v4) projects but
  is fine for this plan's Tailwind-v3/NativeWind-v4 setup. The plan's "reconcile the CLI
  output by hand" step de-risks any CLI flakiness.
- **Recommended change:** Note the `founded-labs` org in docs; keep "reconcile/author by
  hand if the CLI errors" as the documented fallback (already present in spirit). Pin the
  CLI version used at adoption time if reproducibility matters (it's a dev-time tool, so
  `@latest` is acceptable).
- **Source(s):** npm `@react-native-reusables/cli` dist-tags (`latest 0.7.1`) ;
  https://github.com/founded-labs/react-native-reusables/issues/509 ;
  https://github.com/founded-labs/react-native-reusables/issues/505 ;
  https://github.com/founded-labs/react-native-reusables (README).

### 10. Component list (button / text / input / card) — all exist

- **Location:** PHILOSOPHY.md L393/L173 (button.tsx, text.tsx, …); phase-2 step (a) adds
  `text button input card`; DoD #1.
- **Claim:** rn-reusables provides Button, Text, Input, Card.
- **Status:** ✅
- **Finding:** Catalog confirmed to include Accordion, Alert, Alert Dialog, Aspect Ratio,
  Avatar, Badge, **Button**, **Card**, Checkbox, **Input**, **Text**, and more
  (forms/sheets/dialogs/navigation). All four primitives the plan adopts exist.
- **Recommended change:** None. (`Text` is a real rn-reusables primitive; the plan's
  hand-authored `text.tsx`/`button.tsx` skeletons are reasonable owned-source equivalents to
  reconcile the CLI output into.)
- **Source(s):** https://allshadcn.com/components/react-reusables/ ;
  reactscript.com rn-reusables overview ; reactnativereusables.com/docs.

### 11. react-native-reusables now supports Uniwind **and** NativeWind — context worth noting

- **Location:** PHILOSOPHY.md L30 / phase-2 (assumes rn-reusables == NativeWind-only).
- **Claim (implicit):** rn-reusables is a NativeWind library.
- **Status:** ⚠️
- **Finding:** Current rn-reusables README/docs describe components "with Nativewind**/
  Uniwind**" — i.e. it now supports two styling engines (Uniwind being a newer CSS-first
  engine). The `rn-new` scaffolder offers both **NativeWind v4.1** and **v5** templates.
  This doesn't break the plan (the plan explicitly pins NativeWind v4 and owns the source),
  but means: when running the CLI/init, ensure the **NativeWind (v4)** path is selected, not
  Uniwind, or the emitted config/tokens won't match the plan's `tailwind.config.js` preset.
- **Recommended change:** In phase-2 step (a), add a note: "select the NativeWind (v4)
  flavor when adopting; ignore Uniwind/CSS-first output." Since components are reconciled by
  hand into owned source, engine selection mainly affects the CLI's generated config, which
  the plan already overrides.
- **Source(s):** https://github.com/founded-labs/react-native-reusables (README:
  "Nativewind/Uniwind") ; search result "supports both Nativewind and Uniwind" ;
  https://github.com/founded-labs/react-native-reusables/issues/505 (Uniwind CSS-first init).

### 12. `@rn-primitives/*` are NO LONGER pre-1.0 — version + rationale drift

- **Location:** PHILOSOPHY.md L269 ("Pin react-native-reusables' `@rn-primitives/*` deps exactly
  like other pre-1.0 tools"); L36/L43 (treat as pre-1.0); phase-2 step (a) package.json
  pins `@rn-primitives/slot 1.2.0`, `@rn-primitives/types 1.2.0`; OPEN note L162; Gotcha
  L1444 ("Pre-1.0; a caret bump can break owned components").
- **Claim:** `@rn-primitives/*` are pre-1.0; pin 1.2.0; rationale = "pre-1.0 instability."
- **Status:** ⚠️
- **Finding:** As of June 2026, `@rn-primitives/slot`, `@rn-primitives/types`, and
  `@rn-primitives/portal` are all at **`latest = 1.4.0`** (slot also has `next = 1.0.0-rc.3`,
  `beta = 1.4.0-beta.2`); `@rn-primitives/hooks` is `1.1.0`. These packages are **past 1.0**
  — the "pre-1.0" framing is outdated, and the pinned `1.2.0` is a now-superseded patch line.
  The **pin-exact discipline is still correct** (these are fast-moving, and rn-reusables
  components couple tightly to specific primitive versions), but the stated _reason_
  ("pre-1.0") should be reworded, and the indicative pins refreshed to the 1.4.x line (or to
  exactly whatever the CLI emits, per the plan's own OPEN note).
- **Recommended change:** Replace "pre-1.0" rationale with "pin exact because rn-reusables
  components are version-coupled to specific `@rn-primitives/*` releases and minor bumps can
  shift behavior." Update indicative pins from `1.2.0` → current `1.4.0` (or defer to CLI
  output). The plan's "freeze to what the CLI emits at adoption time" (OPEN L162/L1545)
  already covers the exact numbers — only the prose is stale.
- **Source(s):** npm `@rn-primitives/slot` (`latest 1.4.0`, `next 1.0.0-rc.3`,
  `beta 1.4.0-beta.2`), `@rn-primitives/types 1.4.0`, `@rn-primitives/portal 1.4.0`,
  `@rn-primitives/hooks 1.1.0` (queried 2026-06-13) ;
  https://reactnative.directory/package/@rn-primitives/slot

### 13. `cva` / `clsx` / `tailwind-merge` pins — correct and Tailwind-v3-consistent

- **Location:** phase-2 step (a) package.json: `class-variance-authority 0.7.1`,
  `clsx 2.1.1`, `tailwind-merge 2.6.0`.
- **Claim:** these exact versions.
- **Status:** ✅
- **Finding:** `class-variance-authority` `latest = 0.7.1` ✅ exact match. `clsx` current
  `2.1.1` ✅. `tailwind-merge` `2.6.0` is the **correct line for Tailwind v3** — the v3.x
  line (current `latest = 3.6.0`) requires **Tailwind CSS v4**. Pinning 2.6.0 is therefore
  exactly right for the NativeWind-v4/Tailwind-v3 stack; bumping to `tailwind-merge@3` would
  silently assume Tailwind v4 and is a trap to avoid. Strong internal consistency.
- **Recommended change:** None. (Optionally add a one-line warning in the plan: "do not
  upgrade `tailwind-merge` to v3 while on Tailwind v3 / NativeWind v4.")
- **Source(s):** npm dist-tags `class-variance-authority` (`latest 0.7.1`), `clsx 2.1.1`,
  `tailwind-merge` (`latest 3.6.0`, `tailwind-merge-2 2.6.1`) ;
  https://github.com/dcastil/tailwind-merge (v3 → Tailwind v4; v3 users stay on 2.6.x).

### 14. `cn()` helper (clsx + twMerge) — correct convention

- **Location:** phase-2 step (a) `lib/utils.ts`.
- **Claim:** `cn(...inputs) => twMerge(clsx(inputs))`.
- **Status:** ✅
- **Finding:** Standard shadcn/rn-reusables `cn()` utility; matches both libraries'
  documented helper.
- **Source(s):** rn-reusables docs / shadcn convention (initial-setup).

### 15. CSS-variable light/dark on web vs native — mechanism is correct on all four targets

- **Location:** PHILOSOPHY.md ruling #8; phase-2 step (b) global.css (`:root`/`.dark:root`) +
  theme.ts (`vars()`) + theme-provider.tsx (`colorScheme.set` toggles `.dark` on web).
- **Claim:** web uses `:root`/`.dark` CSS blocks; native uses `vars()` objects; same
  semantic names everywhere; `colorScheme` controls the dark class on web.
- **Status:** ✅ (one minor selector caveat → ⚠️ sub-note)
- **Finding:** Mechanism is sound and matches NativeWind v4 + rn-reusables docs: on web,
  NativeWind emits real CSS and the `dark` variant keys off the `.dark` class (with
  `darkMode: "class"` in the preset — present in step (b)); on native, the same variables
  are supplied at runtime via `vars()` flowed through context. `colorScheme.set()` /
  `useColorScheme().setColorScheme()` is the documented control. Minor caveat: docs note
  `setColorScheme`/`toggleColorScheme` require `darkMode` configured (the preset sets
  `darkMode: "class"` ✅). The phase guide writes the dark block as `.dark:root` — shadcn
  conventionally uses `.dark` (class on `<html>`); both work, but confirm the selector
  matches where NativeWind/`colorScheme` puts the class (it toggles `.dark` on the document
  root, so `.dark:root` and `.dark` both resolve). Low risk.
- **Recommended change:** None required; optionally normalize the dark selector to `.dark`
  to match shadcn/rn-reusables defaults and avoid confusion.
- **Source(s):** https://www.nativewind.dev/docs/api/vars ;
  https://www.nativewind.dev/docs/guides/themes ; rn-reusables initial-setup (global.css
  `.dark:root` / `prefers-color-scheme`) ; LogRocket NativeWind dark-mode note
  (`darkMode` required for `setColorScheme`).

### 16. `@figma/code-connect` version — exists; pin guidance reasonable

- **Location:** phase-2 step (d) "Add `@figma/code-connect` (exact pin)".
- **Claim:** package exists; pin exact.
- **Status:** ✅
- **Finding:** `@figma/code-connect` `latest = 1.4.8`. Real, maintained; `figma.connect(...)`
  with `figma.string`/`figma.enum` is the documented API the skeletons use. Pin-exact is
  fine.
- **Source(s):** npm `@figma/code-connect` dist-tags (`latest 1.4.8`).

### 17. `style-dictionary` version — exists (current major is 5)

- **Location:** phase-2 step (e) "Add `style-dictionary` (exact pin)".
- **Claim:** used to resolve tokens → theme.
- **Status:** ✅ (note: major-version awareness)
- **Finding:** `style-dictionary` `latest = 5.4.4` (v5 line). v3→v4→v5 changed the config
  API substantially; when pinning, target the **v5** API in `figma-tokens.mjs`. The script
  is a thin custom emitter, so this is a low-risk note, not a defect.
- **Source(s):** npm `style-dictionary` dist-tags (`latest 5.4.4`).

### 18. Figma REST Variables API is Enterprise-only — correct

- **Location:** PHILOSOPHY.md "Figma bridge" (REST on Enterprise); phase-2 step (e) +
  Gotcha L1448.
- **Claim:** `GET /v1/files/:key/variables/local` requires an Enterprise plan; hence
  Tokens Studio JSON default.
- **Status:** ✅
- **Finding:** The Variables REST endpoints are documented by Figma as Enterprise-plan-only.
  The plan's source-abstracted default (committed Tokens Studio JSON, CI-runnable without a
  Figma file) is the correct, tier-independent choice.
- **Source(s):** Figma developer docs — Variables REST API (Enterprise requirement)
  (developers.figma.com). (Plan's own gotcha matches Figma's published constraint.)

---

## Resolved OPEN / TO CONFIRM (in-scope)

- **NativeWind v4 ↔ Expo SDK 56 / RN 0.85 compat (phase headline risk, OPEN L1541):**
  Partially resolvable from versioning. NativeWind v4 is actively patched into 2026
  (4.2.2–4.2.5, latest 2026-06-05), and v4 has long supported the New Architecture, so there
  is no _version-level_ blocker against SDK 56 / RN 0.85. However, exact SDK-56 metro/babel
  transform behavior must still be **verified empirically** at build time (the plan's
  approach). The "fallback = SDK 55" guard is prudent and should remain. **Net: keep the
  empirical settle step; no evidence forces SDK 55.** ❓ (must be confirmed by running it).
  Source: npm `nativewind` time map (4.2.x through 2026-06).

- **Exact pins for `@rn-primitives/*`, `nativewind`, cva, tailwind-merge (OPEN L1545):**
  Resolved with current numbers — `nativewind 4.2.5`, `@rn-primitives/* 1.4.0`
  (slot/types/portal), `class-variance-authority 0.7.1`, `clsx 2.1.1`,
  `tailwind-merge 2.6.0` (Tailwind-v3 line — do not use 3.x), `@figma/code-connect 1.4.8`,
  `style-dictionary 5.4.4`, `@react-native-reusables/cli 0.7.1`. The plan's "freeze to what
  the CLI/`expo install` emit" stance is correct; update the indicative `@rn-primitives`
  pins from 1.2.0 → 1.4.x.

- **`theme.ts` ↔ `global.css` co-generation (OPEN L1553):** Out of pure-version scope, but
  the rn-reusables model confirms the _intent_: both a CSS-var file (`global.css`) and a
  parallel JS object (rn-reusables' `NAV_THEME`/`lib/theme.ts`) must stay in sync, so having
  `figma-tokens.mjs` regenerate **both** web `:root`/`.dark` blocks and the native `vars()`
  object is the documented best practice (not just `theme.ts`). Recommend resolving the
  script's TODO to write both. ❓ (design decision, evidence supports doing both).

- **Storybook dev port (OPEN L1549):** Not a styling/UI-domain version question; no upstream
  constraint — `6006` (Storybook default) vs the app's fixed `8081` is purely a local
  choice. No issue.

---

## Sources

- npm registry (queried 2026-06-13): `nativewind` (dist-tags + time),
  `@react-native-reusables/cli`, `@rn-primitives/slot|types|portal|hooks`,
  `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss`,
  `@figma/code-connect`, `style-dictionary`, `@tanstack/react-query`
- https://www.nativewind.dev/v5
- https://www.nativewind.dev/v5/guides/migrate-from-v4
- https://www.nativewind.dev/v5/core-concepts/tailwindcss
- https://www.nativewind.dev/v5/guides/themes
- https://www.nativewind.dev/docs (v4)
- https://www.nativewind.dev/docs/api/vars
- https://www.nativewind.dev/docs/api/css-interop
- https://www.nativewind.dev/docs/api/remap-props
- https://www.nativewind.dev/docs/guides/themes
- https://www.nativewind.dev/docs/guides/third-party-components
- https://www.nativewind.dev/blog/announcement-nativewind-v4
- https://blog.logrocket.com/getting-started-nativewind-tailwind-react-native/
- https://tailwindcss.com/blog/tailwindcss-v4
- https://github.com/founded-labs/react-native-reusables
- https://github.com/founded-labs/react-native-reusables/issues/509
- https://github.com/founded-labs/react-native-reusables/issues/505
- https://reactnativereusables.com/docs
- https://reactnativereusables.com/getting-started/initial-setup/
- https://github.com/founded-labs/react-native-reusables/discussions/311
- https://allshadcn.com/components/react-reusables/
- https://reactscript.com/shadcn-ui-component-library-reusables/
- https://medium.com/@rachelcantor/system-theme-support-with-nativewind-v4-and-react-native-reusables-08fed7ff4070
- https://github.com/dcastil/tailwind-merge
- https://reactnative.directory/package/@rn-primitives/slot
