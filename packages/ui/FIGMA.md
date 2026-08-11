# FIGMA.md — design ↔ code handover conventions

**Audience:** the design team. **Purpose:** the conventions a Figma library must follow so it
plugs directly into the codebase — tokens flow into the apps automatically, and components map
1:1 to real, shippable UI. Follow these and a brand change in Figma re-themes a whole product
with **zero engineering edits**.

This is the single designer-facing contract. Keep it open while building the library.

---

## The big idea (read this first)

- **One global library, shared by every product.** We do **not** fork a new component library
  per app. Per-product differentiation is a **brand mode** (a set of token _values_) — never a
  copied or edited component.
- **Components own structure; tokens own looks.** A component (Button, Card, …) is built once.
  Its colors/spacing come entirely from **variables**. Swapping the brand mode restyles
  everything; the components themselves never change.
- **Names are an API.** Variable names and component-property values are consumed verbatim by
  code. Renaming a variable or a variant value is a breaking change — treat names as carefully
  as a developer treats a function signature.

---

## Two libraries to publish

Publish these as **team libraries** so engineering's tooling can read them:

1. **Foundations** — the **Variables** (tokens). The source of truth for all values.
2. **Components** — the **component sets** (Button, Input, Card, Text, …).

Both must be published (not just saved) for read-access and the code mapping to resolve.

---

## 1. Variables — two collections

Build the token system as **two collections**:

- **`primitives`** — the raw scale: full color ramps, the spacing scale, radii, etc.
  Primitives are **never** referenced directly by a component. They exist only to be pointed at
  by semantic tokens.
- **`semantic`** — the names components actually bind to. Every component fill/stroke/spacing
  references a semantic variable, which in turn points at a primitive.

> _Engineering note:_ this contract is mirrored in [BUILDOUT.md](./BUILDOUT.md) §1, which is the
> code-side view of the same list. **Change one, change both.**

**Core semantic colors — always required (exact names, these are the contract):**

```
--background            --foreground
--card                  --card-foreground
--popover               --popover-foreground
--primary               --primary-foreground
--secondary             --secondary-foreground
--muted                 --muted-foreground
--accent                --accent-foreground
--destructive           --destructive-foreground
--success               --success-foreground
--warning               --warning-foreground
--border
--input
--ring
--overlay
```

> A `*-foreground` token is the text/icon color that sits **on top of** its pair (e.g.
> `--primary-foreground` is the label color on a `--primary` button). Always define them as a
> legible pair — every pair must clear **WCAG AA** (4.5:1 for body text, 3:1 for large text and UI
> elements) in **both** light and dark. This is checked at reconcile.

`--overlay` is the scrim behind modals, dialogs and bottom sheets. It has no automatic default on
mobile, so it must be defined explicitly.

**Surface-specific colors — required only if the product uses that surface:**

```
--chart-1  --chart-2  --chart-3  --chart-4  --chart-5     (data visualisation)

--sidebar                   --sidebar-foreground           (desktop / web sidebar)
--sidebar-primary           --sidebar-primary-foreground
--sidebar-accent            --sidebar-accent-foreground
--sidebar-border            --sidebar-ring
```

Skip these and engineering ships neutral defaults. Supply them and they follow the same rule as
everything else: **a value in every mode, no blanks.**

**Non-color semantic tokens:**

| Token                        | You define               | Notes                                                                                                                                                                                                 |
| ---------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--radius`                   | one base corner radius   | Everything else (`sm`/`md`/`lg`/`xl`) is derived in code. After `--primary`, this is the single biggest lever on how the product _feels_.                                                             |
| `--font-sans`, `--font-mono` | family names             | Tell engineering the actual font files. A family that isn't bundled **fails silently** on iOS/Android — it just falls back, with no error.                                                            |
| `--elevation-1`, `-2`, `-3`  | three levels of _intent_ | Give us "resting / raised / floating", **not** iOS shadow values. Shadows are implemented per-platform (iOS shadow, Android elevation, web box-shadow) — one set of numbers cannot express all three. |

**Rule:** components bind to **`semantic` only**. If a component references a primitive or a raw
hex directly, the brand-swap mechanism breaks for that element.

### Adding tokens of your own

The list above is a **floor, not a ceiling** — please extend it where the design needs it.

- **Extra `primitives` are free.** Add as many ramp steps, spacing values or radii as you like.
  Nothing downstream cares, because components never reference primitives directly.
- **Extra `semantic` tokens are welcome, but need a heads-up.** Each new semantic name has to be
  registered on the code side before a component can bind to it, so flag additions to engineering
  rather than adding them silently the day before handover. It's a small change — the point is
  that it isn't automatic.

When you add a semantic token, four rules keep it compatible:

1. **Kebab-case, no brand or product name in it.** `--surface-raised`, never `--acme-blue` —
   product differences are expressed by _modes_, not by token names.
2. **Pair it if it carries text.** Anything used as a background needs a matching `*-foreground`.
3. **Give it a value in every mode.** A blank in one mode fails the automated coverage check.
4. **Don't invent one where an existing token fits.** Token sprawl is the main way a system rots —
   if `--muted` already means "recessed surface", use it.

Renaming or removing a semantic token later is a **breaking change** (§ _Names are the API_).
Adding one is not — so err toward proposing a new token rather than quietly overloading an
existing one with a second meaning.

---

## 2. Modes = theme × brand

The `semantic` collection's **modes** are the product of two axes:

```
            light            dark
template   (values)         (values)
demo       (values)         (values)
```

- **theme** = `light` / `dark`
- **brand** = `template` / `demo` (and one **new mode per future product**)

Each mode maps 1:1 onto a product's generated theme files. **A new product = a new brand mode**
in this collection — nothing else. Keep the mode matrix complete: every semantic token must have
a value in **every** mode.

---

## 3. Names are the API

Variable names and **component property values** must match what code expects, exactly:

- **Variant axis** values: `Variant = Default | Secondary | Destructive | Outline | Ghost`
- **Size axis** values: `Size = sm | default | lg`

Use these literal strings (case included) as the Figma component-property options. They map
straight onto the code's variant system; any divergence breaks the 1:1 mapping.

---

## 4. No raw hex — ever

Every fill, stroke, and effect color on a component **must be bound to a `semantic` variable**.
No hand-picked hex values on components. (Raw values live only inside the `primitives` collection,
which semantic tokens reference.) This is the rule that makes "change the brand, restyle the app"
work — a stray hex is a hole the brand mode can't reach.

---

## 5. Component anatomy matches code

The component sets mirror the components engineering owns. At handover, the first set is:

- **Text**, **Button**, **Input**, **Card**

For each:

- The **variant axes match the code variants exactly** (see §3) so the design→code map stays 1:1.
- Structure (layers, auto-layout, slots) should reflect how the component is actually composed,
  so a generated screen looks like real UI, not a flattened picture.
- All colors via semantic tokens (§4).

New components are added over time using the same rules — align variant axes with engineering
before publishing a new set.

---

## 6. How tokens leave Figma (export path)

Engineering pulls token **values** out of Figma in one of two ways — **you don't run these**, but
it determines how you deliver:

- **Default — Tokens Studio export (DTCG JSON).** Use the **Tokens Studio** plugin and export the
  token set in **DTCG format**. This is the standard handover artifact: it works on any Figma
  plan, is reviewable as a diff, and runs in CI. Hand over (or commit) this JSON.
- **Enterprise only — Variables REST API.** If the org is on a Figma **Enterprise** plan,
  engineering can pull Variables directly via the API (no manual export). This is **not** available
  on lower tiers — which is exactly why the Tokens Studio DTCG export is the default path.

Either way the flow is **one-directional**: Figma → code. Engineering never hand-edits the
generated theme files; they regenerate from your source, so your library stays the source of truth.

---

## 7. Components ↔ code (Code Connect)

Engineering maintains **Code Connect** mappings (`*.figma.tsx`) that tie each Figma component to
the real code component. You don't write these — but they only stay correct if **you keep names
and variant axes stable** (§3) and **anatomy aligned** (§5). If you must rename or restructure,
tell engineering in the same change so the map is updated together.

---

## Handover-day procedure (what happens, end to end)

Engineering runs a one-time bootstrap (then incremental). High level, **tokens first, components
second**:

1. **Reconcile** — engineering inventories your library against this doc and flags anything that
   breaks the contract: raw-hex fills not bound to variables, modes that don't map to
   light/dark × brand, non-code-friendly variant values. **These are resolved with you before
   anything is imported.** ← your library passing this is the goal of the checklist below.
2. **Tokens** — your `semantic` variables are mapped to the canonical names and generated into the
   product themes.
3. **Components** — each component set is built into the owned code component, with its Code
   Connect map.
4. **Verify** — the team confirms it on web, native, and desktop, and proves the live bind:
   **change one token in Figma → the apps re-theme.**

---

## Pre-handover checklist (definition of ready)

Before handing the library over, confirm:

- [ ] **Two published team libraries**: Foundations (Variables) + Components.
- [ ] **Two collections**: `primitives` (raw, never referenced by components) + `semantic`.
- [ ] **All core semantic color tokens present** with the exact names in §1.
- [ ] **Surface-specific tokens** (`--chart-*`, `--sidebar-*`) present _if_ the product uses charts
      or a desktop sidebar — otherwise deliberately omitted, not half-filled.
- [ ] **Non-color tokens defined**: `--radius`, `--font-sans` / `--font-mono` (with the actual font
      files handed over), `--elevation-1/2/3` as intent levels.
- [ ] Every `*-foreground` token is a **legible pair** with its base, clearing **WCAG AA in both
      light and dark**.
- [ ] **Any semantic tokens you added beyond §1** have been flagged to engineering, and follow the
      four rules in §1.
- [ ] **Modes = light/dark × brand**, and **every token has a value in every mode** (no blanks).
- [ ] **No raw hex on any component** — every component color bound to a `semantic` variable.
- [ ] **Variant/Size property values** use the exact strings in §3.
- [ ] **Text, Button, Input, Card** component sets exist with variant axes matching §3.
- [ ] Token export ready: **Tokens Studio DTCG JSON** (or confirm Enterprise Variables API access).
- [ ] Read access granted to engineering (Figma Dev Mode / an access token — see appendix).

---

## Appendix — for engineering (access tokens)

Two different Figma tokens are used; they are **not** interchangeable:

| Use                                           | Env var              | Header           | Scopes                                    | Availability        |
| --------------------------------------------- | -------------------- | ---------------- | ----------------------------------------- | ------------------- |
| **Code Connect** CLI (publish component maps) | `FIGMA_ACCESS_TOKEN` | — (CLI flag/env) | `code_connect:write`, `file_content:read` | any plan            |
| **Variables REST** pull (token values)        | `FIGMA_TOKEN`        | `X-Figma-Token`  | `file_variables:read` (+ file read)       | **Enterprise only** |

- Code Connect's CLI config file is **`figma.config.json` at the repo root** (next to
  `package.json`).
- The token pipeline's config is a **separate** root file, **`tokens.config.json`** (file key +
  the collection→product-mode map) — deliberately named differently to avoid colliding with Code
  Connect's `figma.config.json`.

---

> **Canonical location:** this file lives at `packages/ui/FIGMA.md` once the design-system package
> is scaffolded (Phase 2). It is the doc handed to the design team; the operational counterparts
> (`/bootstrap-design-system`, `/add-component`, `/sync-tokens`) and `packages/ui/CLAUDE.md` are
> the engineering-facing companions.
