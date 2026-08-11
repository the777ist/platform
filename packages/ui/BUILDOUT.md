# @platform/ui — build-out

How to take `packages/ui` from 5 components to a complete, cross-platform, themed design
system: the full shadcn/ui surface **plus** the full AI-chat surface, on iOS + Android + web +
desktop, with mobile as the priority target.

This is the **build-out** doc. [CLAUDE.md](./CLAUDE.md) stays the steady-state runbook; when
the build-out is done, the rules here fold into it and this file becomes history.

---

## 0. Scope and the two deviations

**Mobile-first, universal from day 1.** Every component ships to iOS, Android, web and
Electron from its first commit. There is no "web version first, port later" — a component
that only works on one platform is not done. Where the platforms genuinely disagree (see
§3), the _API_ stays identical and the _implementation_ splits.

Two deliberate deviations from [PHILOSOPHY.md](../../PHILOSOPHY.md):

| Locked decision                                                | Deviation                                                               | Why it's safe                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #54 — Figma Variables are the source of truth for token values | **Tokens are hand-authored in-repo.** No Figma import, no Code Connect. | `scripts/figma-tokens.mjs` already treats a committed DTCG JSON file as its _default_ source (`source: "tokens-studio"`). We are using the documented default path, not bypassing the pipeline. Figma can be attached later by flipping `tokens.config.json` to `source: "rest"` — zero component changes. |
| #53 — Tier-1 = react-native-reusables components copied in     | **Tier-1 also includes hand-authored components and other registries.** | The invariant that matters is _owned source + semantic tokens only_, not the provenance. RNR covers 32 of the 62 shadcn registry components; the rest have to come from somewhere.                                                                                                                         |

Everything else holds — especially **semantic tokens only, never name a color**, and
**promote-on-2nd-use** for Tier-2 compositions.

Until Figma is attached, `*.figma.tsx` Code Connect maps are **not** written. Step 4 of the
`/add-component` recipe is replaced by the docs entry in step 9 below.

---

## 1. Where the theme lives

### The three layers

```
Layer 1  PRIMITIVES     raw scales — gray.50…950, blue.500, radius.md, space.4
                        ↓ referenced by
Layer 2  SEMANTIC       what components consume — --primary, --background, --radius
                        ↓ re-pointed by
Layer 3  BRAND MODES    per-product overrides — one mode per product × {light, dark}
```

Components **only ever** touch layer 2. A component that references a layer-1 token is a bug,
same as a hex literal. Layer 1 exists so that layer 2 is expressed in terms of a real scale
rather than 40 unrelated hand-picked values — that is what makes a rebrand coherent instead of
a game of whack-a-mole.

### The file map

| What                                              | Where                                                                                                                   | Generated?                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Token **names** + `var()` bindings (the contract) | `packages/config/tailwind-preset.cjs`                                                                                   | hand-written                                 |
| Token **values** — the source of truth            | `packages/ui/tokens/primitives.json`<br>`packages/ui/tokens/semantic.json`<br>`packages/ui/tokens/brand.<product>.json` | **hand-authored (this is where you design)** |
| Pipeline config                                   | `tokens.config.json` (repo root)                                                                                        | hand-written                                 |
| Generator                                         | `scripts/figma-tokens.mjs` (Style Dictionary v5)                                                                        | —                                            |
| Native values (NativeWind `vars()`)               | `packages/ui/src/lib/theme.ts`                                                                                          | ⚙️ generated                                 |
| Web values (`:root` / `.dark`)                    | `packages/ui/src/global.css`                                                                                            | ⚙️ generated                                 |
| Runtime application                               | `packages/ui/src/theme-provider.tsx`                                                                                    | hand-written                                 |
| Per-product override                              | `products/<p>/app/theme.ts` + `global.css`                                                                              | ⚙️ generated                                 |

**The only files you edit to change how the system looks are the three under
`packages/ui/tokens/`.** Everything downstream is regenerated by `/sync-tokens`. Never
hand-edit `theme.ts` or `global.css` — the generator overwrites them and CI diffs them.

This replaces today's single `packages/ui/figma/tokens.json` (a flat light/dark fixture). The
split into primitives / semantic / brand is what lets layer 2 be authored as
`"primary": { "$value": "{blue.600}" }` instead of a bare triplet repeated per mode.

### How a product rebrands

1. Add `packages/ui/tokens/brand.<product>.json` — override only the layer-2 tokens that
   differ, referencing layer-1 primitives.
2. Run `/sync-tokens`. It regenerates `products/<product>/app/theme.ts` + `global.css`.
3. Done. **No component is edited, forked, or copied.**

If a product needs a token the shared set doesn't have, add the **name** to
`tailwind-preset.cjs` with a sensible default value in `semantic.json` (so every other product
still builds) and the **value** in that product's brand file. Adding a name is a shared-surface
change and needs the coverage test in §7 to stay green.

### The token contract — full surface

Today's 15 tokens cover ~5 components. The full library needs all of the following. **Author
every one of these before importing components** — `--accent` and `--popover` are already
declared in the preset with no value anywhere, so any component using `bg-accent` renders
transparent today.

> **This list is mirrored, designer-facing, in [FIGMA.md](./FIGMA.md) §1.** That copy is the
> contract handed to a design team, and it is the same contract — hand it to them _before_ they
> start, not at handover. **Change one, change both.** The §7 coverage test catches a token that
> has no value; it cannot catch these two lists disagreeing.

**Colors** — HSL channel triplets (`240 6% 10%`), consumed as `hsl(var(--x))`:

```
background foreground
card card-foreground
popover popover-foreground
primary primary-foreground
secondary secondary-foreground
muted muted-foreground
accent accent-foreground
destructive destructive-foreground
success success-foreground          ← not in shadcn; you want it
warning warning-foreground          ← not in shadcn; you want it
border input ring
overlay                             ← scrim behind modals/sheets; RN needs it explicit
chart-1 chart-2 chart-3 chart-4 chart-5
sidebar sidebar-foreground sidebar-primary sidebar-primary-foreground
sidebar-accent sidebar-accent-foreground sidebar-border sidebar-ring
```

**Non-color:**

| Token                        | Notes                                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--radius`                   | base value; preset already derives `sm`/`md`/`lg`. Add `xl`. Single most effective brand lever after `--primary`.                                                          |
| `--font-sans`, `--font-mono` | Must name fonts actually loaded via `expo-font`. A family name that isn't loaded silently falls back on native — no error.                                                 |
| `--elevation-1/2/3`          | **Platform-split.** iOS uses `shadowColor/Offset/Opacity/Radius`, Android uses `elevation`, web uses `box-shadow`. Do not try to express this as one token value — see §3. |

**Spacing and type scale** stay on Tailwind's defaults. Don't tokenize what you aren't
changing.

### Dark mode

`darkMode: "class"` is already set. Web toggles `.dark` on the root; native swaps the `vars()`
object via `ThemeProvider`. Both are driven from the same generated source, so **light and dark
are authored together, per brand, from day 1** — never bolted on after.

---

## 2. What we're building — the ledger

Strategy codes used throughout:

| Code  | Meaning                                                                           |
| ----- | --------------------------------------------------------------------------------- |
| **R** | Import from react-native-reusables, reconcile to owned shape                      |
| **N** | Copy in from NativeWindUI (`npx nwui-cli@latest add`), **convert RGB→HSL tokens** |
| **A** | Author from scratch over `@rn-primitives/*` or raw RN APIs                        |
| **S** | Platform split — one API, `.native.tsx` + `.web.tsx` implementations              |
| **M** | Mobile re-interpretation — same role and API, different interaction/presentation  |
| **W** | Web/desktop-only — renders a documented graceful fallback on native               |

### shadcn/ui surface (62 registry components)

**Direct from RNR (27 to import; you have 5).**

`accordion` `alert` `alert-dialog` `aspect-ratio` `avatar` `badge` `checkbox` `collapsible`
`context-menu` `dialog` `dropdown-menu` `hover-card` `icon` `label` `menubar`
`native-only-animated-view` `popover` `progress` `radio-group` `select` `separator` `skeleton`
`switch` `tabs` `textarea` `toggle` `toggle-group` `tooltip`

Already present, but **reconcile against the real RNR shape first** — the current `button.tsx`
is hand-authored and doesn't use RNR's `TextClassContext` / `Slot asChild` pattern that every
imported component expects: `text` `button` `badge` `input` `card`.

**Everything else:**

| Component                                                   | Strategy | How                                                                                                                                                                                               |
| ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sheet`                                                     | **S**    | Bottom sheet on native (`@gorhom/bottom-sheet`, or **N**), side sheet on web. Highest-value non-RNR component for a mobile app — build it early.                                                  |
| `drawer`                                                    | **S**    | Same primitive as `sheet`; different default side/snap points.                                                                                                                                    |
| `sonner` / toast                                            | **A**    | Over `@rn-primitives/portal` + Reanimated. Must respect safe-area insets on native.                                                                                                               |
| `slider`                                                    | **N**    | Wraps `@react-native-community/slider`.                                                                                                                                                           |
| `spinner`                                                   | **S**    | `ActivityIndicator` native / CSS spinner web.                                                                                                                                                     |
| `form`                                                      | **A**    | `react-hook-form` is platform-agnostic — wire it to `Field`.                                                                                                                                      |
| `field`                                                     | **A**    | Label + control + description + error. The workhorse; build before `form`.                                                                                                                        |
| `item`                                                      | **A**    | List-row primitive. Trivial on web, **essential** on mobile — most mobile UI is rows.                                                                                                             |
| `empty`                                                     | **A**    | Icon + title + description + action. Trivial.                                                                                                                                                     |
| `input-group`                                               | **A**    | Input + affixes.                                                                                                                                                                                  |
| `button-group`                                              | **A**    | Trivial composition.                                                                                                                                                                              |
| `input-otp`                                                 | **A**    | RN `TextInput` with per-char boxes + `autoComplete="one-time-code"`.                                                                                                                              |
| `scroll-area`                                               | **S**    | Native `ScrollView` / web styled scrollbars.                                                                                                                                                      |
| `typography`                                                | **A**    | Heading/prose variants on your existing `Text`.                                                                                                                                                   |
| `breadcrumb`                                                | **M**    | Full trail on web; on mobile collapse to back-affordance + current page.                                                                                                                          |
| `table` / `data-table`                                      | **M**    | There is no `<table>` in RN. Mobile = `FlatList` of `Item` cards; web = real table. Same props, two renderers.                                                                                    |
| `command`                                                   | **M**    | Web = overlay palette; mobile = full-screen search sheet. `FlatList` + fuzzy filter.                                                                                                              |
| `combobox`                                                  | **A**    | Composition of `popover` + `command`. Build after both.                                                                                                                                           |
| `calendar`                                                  | **S**    | `react-native-calendars` or **N** date-picker native; `react-day-picker` web.                                                                                                                     |
| `date-picker`                                               | **S**    | `calendar` inside `popover` (web) / bottom sheet (native).                                                                                                                                        |
| `carousel`                                                  | **S**    | `FlatList` `pagingEnabled` native; embla web.                                                                                                                                                     |
| `chart`                                                     | **S**    | `victory-native` (Skia) native; `recharts` web. **Heavy — defer to last.**                                                                                                                        |
| `pagination`                                                | **M**    | Web = page controls; mobile = infinite scroll. You already use `useInfiniteQuery`.                                                                                                                |
| `navigation-menu`                                           | **M**    | Mobile = expo-router tabs/drawer, not a component. Web-only component + documented native pattern.                                                                                                |
| `sidebar`                                                   | **M**    | Mobile = drawer navigation. Web/desktop = real sidebar.                                                                                                                                           |
| `menubar`                                                   | **W**    | Desktop-only pattern. Ships via RNR, but document it as desktop/web.                                                                                                                              |
| `resizable`                                                 | **W**    | Pointer-only. Desktop/web only.                                                                                                                                                                   |
| `kbd`                                                       | **W**    | No meaning without a keyboard. Renders `null` on native.                                                                                                                                          |
| `native-select`                                             | **S**    | Web `<select>`; native = the platform picker (iOS wheel / Android dialog). **Prefer this over `select` for mobile forms** — the OS control is faster, accessible for free, and what users expect. |
| `direction`                                                 | **A**    | LTR/RTL provider. Cheap now, expensive to retrofit — on RN it needs `I18nManager` and logical properties wired together. Build in wave 1 even if you ship English-only.                           |
| `message` `message-scroller` `bubble` `attachment` `marker` | —        | shadcn's own chat set (June 2026). **Overlaps the AI surface — see the foundation decision below.**                                                                                               |

`data-table`, `date-picker` and `typography` are docs _recipes_ upstream, not registry files.
They're treated as components here because on mobile they need real implementations, not just a
composition guide.

### AI surface (48 in AI Elements)

Lives in `packages/ui/src/components/ai/`, kept separate from `ui/` primitives.

#### First: pick the chat foundation

Three sources now overlap on the same core chat components. Pick one, deliberately:

| Foundation                                                                            | What it gives                                                                                                                                                                                                            | Verdict for this product                                                                                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **`@assistant-ui/react-native`**                                                      | Unstyled RN primitives (`View`/`TextInput`/`FlatList`/`Pressable`) + the **runtime**: streaming, message parts, tool calls, branching, attachments, thread management. Shares runtime and adapters with its web package. | ✅ **Use this.** The only option that is actually native, and the runtime is the expensive part.                                       |
| **shadcn chat set** (`message`, `message-scroller`, `bubble`, `attachment`, `marker`) | Scroll anchoring, streamed replies, history prepend, jump-to-message. Radix/Base UI, DOM.                                                                                                                                | Reference only. `message-scroller`'s anchoring behaviour is the best spec available for what our `conversation` must do on `FlatList`. |
| **AI Elements** (Vercel)                                                              | The widest surface (48), but DOM — `radix-ui`, `motion`, `streamdown`, `@xyflow/react`, `media-chrome`.                                                                                                                  | Reference only — the API surface below is drawn from it.                                                                               |

**Presentational only.** These components take plain props. The runtime/adapter wiring belongs
in `packages/core` (plumbing, product-agnostic — products pass their config in), never here.

#### Scope decision: "all AI components" is 48, and you don't want 48

AI Elements' surface has grown well past chat. Roughly half of it is a **coding-agent IDE**
surface and a **workflow-graph canvas** — neither has a sensible mobile form, and neither is
implied by "an AI product." Build groups 1–3; take groups 4–6 only if the product turns out to
need them.

**Group 1 — Core chat (18). Build all.**
`conversation` `message` `prompt-input` `reasoning` `tool` `sources` `inline-citation` `task`
`chain-of-thought` `suggestion` `code-block` `context` `attachments` `artifact` `image`
`shimmer` `confirmation` `queue`

**Group 2 — Voice + audio (5). Build all — this is where mobile beats web.**
`speech-input` `transcription` `mic-selector` `voice-selector` `audio-player`

Native mic and audio are a genuine advantage of shipping mobile-first; `expo-audio` /
`expo-speech` do what `media-chrome` does on web, better. Do not treat these as optional.

**Group 3 — Agent/model config (4). Build — cheap compositions.**
`model-selector` `persona` `agent` `schema-display`

**Group 4 — Coding-agent surface (12). Defer.**
`terminal` `file-tree` `stack-trace` `test-results` `sandbox` `commit`
`environment-variables` `package-info` `plan` `checkpoint` `snippet` `jsx-preview`

Only if you are building a coding agent. `terminal` and `file-tree` on a phone are a bad idea
regardless.

**Group 5 — Workflow canvas (6). Skip on mobile.**
`canvas` `node` `edge` `connection` `controls` `panel`

Pan/zoom node graphs (`@xyflow/react` on web) are a desktop interaction. If the product needs
one on mobile, it needs a bespoke design, not a port.

**Group 6 — Web-only (3). Fallback or skip.**
`web-preview` (**W** — `react-native-webview` if truly needed) · `toolbar` (**W**) ·
`open-in-chat` (skip)

#### Group 1–3 build notes

| Component                        | Built on                | Notes                                                                               |
| -------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| `conversation`                   | `ThreadPrimitive`       | Inverted `FlatList`. Handles auto-scroll natively — replaces `use-stick-to-bottom`. |
| `message`                        | `MessagePrimitive`      | Role variants via cva.                                                              |
| `prompt-input`                   | `ComposerPrimitive`     | **Keyboard avoidance is the hard part on mobile** — budget for it.                  |
| `actions`                        | `ActionBarPrimitive`    | Copy / regenerate / feedback row.                                                   |
| `branch`                         | `BranchPickerPrimitive` |                                                                                     |
| `thread-list`                    | `ThreadListPrimitive`   | Pairs with drawer nav on mobile.                                                    |
| `attachment`                     | `AttachmentPrimitive`   | `expo-image-picker` + `expo-document-picker` already in the template.               |
| `response`                       | — (author)              | **Streaming markdown. The single hardest item — see §8 spike.**                     |
| `code-block`                     | — (author)              | Horizontal `ScrollView` + highlighter, copy via `expo-clipboard`. See §8.           |
| `reasoning`                      | — (author)              | `Collapsible` + `Text`. Pure composition.                                           |
| `tool`                           | — (author)              | `Collapsible` + `Badge` + `CodeBlock`.                                              |
| `sources`, `inline-citation`     | — (author)              | `Badge` + `popover`/sheet.                                                          |
| `task`, `chain-of-thought`       | — (author)              | `Collapsible` + `Item`.                                                             |
| `suggestion`                     | — (author)              | Horizontal `ScrollView` of chips.                                                   |
| `loader`                         | — (author)              | Shimmer over `Skeleton`.                                                            |
| `context`                        | — (author)              | Token-usage meter over `Progress`.                                                  |
| `artifact`                       | — (author)              | Full-screen sheet on mobile, side panel on web. **S**                               |
| `image`                          | — (author)              | `expo-image`.                                                                       |
| `confirmation`                   | — (author)              | Tool-call approval gate. `alert-dialog` on web, bottom sheet on native. **S**       |
| `queue`                          | — (author)              | Pending-message list. `Item` rows.                                                  |
| `shimmer`                        | — (author)              | Live-status text shimmer ("Thinking…"). Reanimated native / CSS web. **S**          |
| `speech-input`                   | — (author)              | `expo-audio` recording + waveform. Native mic permission flow.                      |
| `transcription`                  | — (author)              | Streaming partial transcript — same incremental-render problem as `response`.       |
| `mic-selector`, `voice-selector` | — (author)              | `native-select` / bottom sheet + preview playback.                                  |
| `audio-player`                   | — (author)              | `expo-audio` native / `media-chrome` web. **S**                                     |
| `model-selector`, `persona`      | — (author)              | `native-select` or sheet + `Item`.                                                  |
| `agent`, `schema-display`        | — (author)              | Read-only config display. `Collapsible` + `CodeBlock`.                              |

`actions`, `branch` and `thread-list` are no longer standalone entries in AI Elements (folded
into `message`), but `@assistant-ui/react-native` exposes `ActionBarPrimitive`,
`BranchPickerPrimitive` and `ThreadListPrimitive` — so we ship them as our own components.
Likewise AI Elements' `response` is `MessageResponse`; ours is a separate component because the
RN markdown renderer is a substantial thing of its own (§8).

`ai-elements`, the shadcn chat set, `shadcn.io/ai` and assistant-ui's Tool UI are all Radix/DOM
— **reference material for markup, anatomy and prop naming only**, never dependencies.

---

## 3. Cross-platform doctrine

**Rule 1 — API parity is non-negotiable, visual parity is not.** `<Sheet>` takes the same props
everywhere. It renders as a bottom sheet on native and a side panel on web. Product code never
branches on platform; the component does.

**Rule 2 — split at the file, not inside it.** Metro and webpack both resolve `.native.tsx` /
`.web.tsx` / `.ios.tsx` / `.android.tsx` automatically. Use that instead of `Platform.OS`
branches, which ship both branches to both bundles and defeat tree-shaking.

```
sheet/
  index.ts          ← re-exports; the only thing index.ts of the package touches
  sheet.native.tsx  ← @gorhom/bottom-sheet
  sheet.web.tsx     ← @rn-primitives/dialog with side positioning
  sheet.types.ts    ← the SHARED prop contract — both files must satisfy it
```

The `.types.ts` file is what stops the two implementations drifting. `tsc` enforces it.

**Rule 3 — pointer-only interactions get a touch equivalent.** Every hover/right-click concept
needs a mobile answer, decided per component and written into its docs entry:

| Web interaction                 | Native equivalent                             |
| ------------------------------- | --------------------------------------------- |
| hover (`hover-card`, `tooltip`) | long-press                                    |
| right-click (`context-menu`)    | long-press                                    |
| `:focus-visible` ring           | pressed/active state — `--ring` still applies |
| scroll-driven                   | gesture-driven, momentum + rubber-band        |

**Rule 4 — mobile constraints are acceptance criteria, not polish.**

- Touch targets **≥ 44×44pt**, even when the visual is smaller. A 32pt `sm` button needs
  `hitSlop`.
- Anything anchored to a screen edge respects `react-native-safe-area-context` insets —
  toasts, sheets, `prompt-input`.
- Anything with a text input above the fold handles keyboard avoidance.
- Elevation is per-platform (see §1) — never a raw `box-shadow`.

**Rule 5 — desktop is web plus window chrome.** Electron consumes the same web build. Desktop
gets no separate component work; `menubar`/`resizable`/`sidebar` are simply where it diverges.

---

## 4. The per-component recipe

Run this for **every** component. It supersedes the 6-step recipe in
[CLAUDE.md](./CLAUDE.md#add-a-component-the-fixed-recipe--add-component-name) for the duration
of the build-out.

**1. Declare the strategy.** Write the code (**R/N/A/S/M/W**) and, for **S**/**M**, one
sentence on how each platform behaves. This is a decision, and it goes in the PR description.

**2. Get the source.**

- **R** — `pnpm --filter @platform/ui dlx @react-native-reusables/cli add <name>`
- **N** — `npx nwui-cli@latest add <name>`, then **convert its RGB triplets to HSL** and drop
  its `--android-*` platform tokens. NativeWindUI ships a different token convention than
  ours; this conversion is mandatory, not optional.
- **A** — author against the shadcn web component's markup for anatomy and prop names.

**3. Reconcile to the owned shape.** cva variants, `cn()` merge, `className` escape hatch,
`TextClassContext` where text is nested, `asChild` via `@rn-primitives/slot` where shadcn has
it. Match the sibling components in `src/components/ui/` — consistency beats the upstream
source.

**4. Purge every literal color.** `grep -nE '#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(' src/components/ui/<name>*`
must come back empty. Map each to a semantic token. If none fits, **add a token** (§1) — do
not inline the value.

**5. Pin new deps exact.** No caret on `@rn-primitives/*` (version-coupled to RNR) or on any
native module. Native modules also need adding to `products/_template/app/package.json` and a
re-stamp of `demo` — never edit `products/demo` directly.

**6. Satisfy the mobile checklist.** Touch target, safe-area, keyboard, elevation, pointer
equivalent (§3, rule 4). Verify on a real device or simulator, not just the Storybook web
preview — react-native-web will happily render something that crashes on iOS.

**7. Stories — one per cva variant**, in `<name>.stories.tsx`. For **S**/**M** components add a
story per platform behaviour so the split is visible in the workbench.

**8. Test.** RNTL in `__tests__/<name>.test.tsx`: renders, variant classes apply, interaction
fires, and the accessibility role/label is right on both platforms (`accessibilityRole` native,
ARIA web).

**9. Document.** Append an entry to `packages/ui/docs/components/<name>.md`: strategy code,
platform behaviours, props table, pointer-equivalent decision, and any deps added. **This
replaces the Code Connect step** while there is no Figma library. When Figma is attached, this
file is the spec the `*.figma.tsx` map is written from.

**10. Export** from `src/index.ts`.

**11. Commit VR baselines** — light + dark, per platform, per §7's capped matrix.

---

## 5. Build order

Ordered so that mobile-critical work lands first and nothing waits on a dependency.

| Wave                                 | Contents                                                                                                                                                                | Gate to clear before moving on                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **0 — Tokens**                       | Author all three `tokens/*.json` layers. Regenerate. Add the §7 gates.                                                                                                  | Coverage test green; no-literal-color rule live. **Blocks everything.** |
| **1 — Foundations**                  | `text` + `typography`, `icon`, `direction` (LTR/RTL), `native-only-animated-view`, `PortalHost` in the app root, reconcile the existing 5.                              | Portal renders on iOS, Android and web.                                 |
| **2 — Atoms (R)**                    | `label` `separator` `skeleton` `aspect-ratio` `avatar` `progress` `checkbox` `switch` `radio-group` `toggle` `textarea` `alert` `badge` `input` `card` `button`         | All green in Storybook light+dark.                                      |
| **3 — Layered (R)**                  | `collapsible` `accordion` `tabs` `toggle-group` `dialog` `alert-dialog` `popover` `tooltip` `hover-card` `dropdown-menu` `context-menu` `select`                        | Overlays position correctly on device, incl. safe-area.                 |
| **4 — Mobile-critical gaps (A/N/S)** | `sheet` `drawer` `toast` `item` `field` `form` `native-select` `spinner` `empty` `input-group` `button-group` `input-otp` `slider` `scroll-area`                        | **This is the wave that makes it a real mobile app toolkit.**           |
| **5a — AI core chat**                | assistant-ui runtime in `packages/core`, then AI group 1 (18). Presentational components first; `response`/`code-block` after their spikes resolve.                     | A working chat screen on iOS.                                           |
| **5b — AI voice + config**           | AI groups 2 (voice/audio, 5) and 3 (model/agent config, 4).                                                                                                             | Push-to-talk working on a real device.                                  |
| **6 — Web/desktop-heavy**            | `table`/`data-table` `command` `combobox` `sidebar` `navigation-menu` `breadcrumb` `pagination` `calendar` `date-picker` `carousel` `menubar` `resizable` `kbd` `chart` | `chart` last — heaviest, least mobile-critical.                         |

Waves 2 and 3 are mechanical and parallelize well across sessions. Waves 4–6 need real design
decisions per component.

---

## 6. Per-product tweaking

In strict order of preference — reach for the next one only when the previous genuinely can't
express it:

1. **Token values.** Product brand file, regenerate. Covers ~90% of real rebrand needs. A
   distinct `--primary`, `--radius` and `--font-sans` differentiates a product more than people
   expect.
2. **New token name.** Add to the preset + a default in `semantic.json`, override in the
   product's brand file.
3. **Product-local composition** in `products/<p>/app/features/<x>/components/`, promoted to
   `packages/ui` on 2nd use.

**Never** fork a component into a product. **Never** name a color.

Also: the Storybook brand switcher is hardcoded `template|demo`. Make it enumerate
`packages/ui/tokens/brand.*.json` before the second real product exists, or the workbench stops
covering your actual brands.

---

## 7. Gates

Add these in wave 0, before the component work starts. Retrofitting them across 90+ components
is not fun.

| Gate                          | What it does                                                                                                                                                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Token coverage test**       | Every `var(--x)` referenced by `tailwind-preset.cjs` has a value in every brand × {light, dark}. Catches today's `--accent`/`--popover`/`--radius` hole and every future one.                                                                                                                      |
| **No-literal-color lint**     | ESLint rule rejecting hex / `rgb()` / `hsl()` literals in `className` strings and style objects under `src/components/`. Makes invariant #1 real instead of aspirational.                                                                                                                          |
| **Platform-parity typecheck** | For **S** components, both `.native.tsx` and `.web.tsx` must satisfy the shared `.types.ts`. Free — just don't skip the types file.                                                                                                                                                                |
| **Barrel completeness**       | Every `src/components/**/<name>.tsx` is exported from `src/index.ts`. Trivial test, catches the most common omission.                                                                                                                                                                              |
| **VR matrix — capped**        | 90+ components × ~4 variants × 2 themes × N brands × 2 platforms explodes. **Cap at {light, dark} × 2 representative brands × linux CI baselines**, with the per-platform local set only for components whose type rendering actually differs. Decide this before generating baselines, not after. |
| **RNTL per component**        | Already the standard; keep it non-negotiable for authored (**A**) components especially, since they have no upstream test heritage.                                                                                                                                                                |

---

## 8. Open spikes

Resolve these before their wave, not during it. Each is a genuine unknown — do not let a wave
block on discovering the answer mid-build.

**Streaming markdown (`response`) — the hardest item in the whole plan.** Web AI Elements uses
`streamdown` + `shiki` + `katex` + `mermaid`, none of which are RN-compatible. Options to
evaluate: `react-native-markdown-display` (maintenance is a question), `react-native-marked`,
or a custom renderer over `marked` tokens mapped to `Text`/`View`. Requirement that rules out
most candidates: it must handle **incremental/partial markdown** without reflow flicker as
tokens stream. Timebox this; it may be the one place worth writing something bespoke.

**Syntax highlighting (`code-block`).** `shiki`'s WASM engine won't run under Hermes, but its
JavaScript regex engine (`createJavaScriptRegexEngine`) might — worth 2 hours to find out,
since it would keep highlighting identical to web. Fallback: `react-native-code-highlighter`
over highlight.js, accepting a visual difference between platforms.

**assistant-ui runtime vs TanStack Query.** assistant-ui owns message state. That's a real
architectural decision against your existing query-client + generated-client setup, not just a
UI choice. Prototype one thread end-to-end against your FastAPI before committing the whole AI
wave to it.

**Math and diagrams.** KaTeX → `react-native-math-view`; Mermaid → realistically a WebView on
native. Decide whether the product needs either at all before building them.

---

## 9. Follow-ups to this doc

- Update `.claude/commands/add-component.md` to the §4 recipe (drop Code Connect, add the
  strategy declaration and mobile checklist).
- Point [CLAUDE.md](./CLAUDE.md) at this file for the duration of the build-out.
- [FIGMA.md](./FIGMA.md) is dormant until a Figma library exists — leave it in place; the
  `tokens/` structure in §1 is deliberately shaped to map onto Figma collections and modes when
  that day comes.
