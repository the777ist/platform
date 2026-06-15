# Phase 2 — Design system, Storybook, Figma bridge & app shell

> Execution guide for **Phase 2** of the multi-product cross-platform monorepo scaffold.
> Authoritative spec: [`PLAN.md`](../PLAN.md). This guide expands the Phase 2 row into a
> literal, ordered build checklist. Where `PLAN.md` is silent, items are marked
> **⚠️ OPEN / TO CONFIRM** rather than invented.

## Goal

Stand up the **shared design system** end-to-end so one OWNED component set renders
identically on web/native/desktop, is brandable per product via semantic CSS-variable
tokens (light + dark from day 1), is previewable in a Storybook workbench with
light/dark + brand toolbars, is wired to Figma in three planes (tokens / Code Connect /
screens), and is exercised by a minimal `_template/app` shell + a first Jest + RNTL test.

This is the design-side keystone: per Key design ruling **#8** theming is CSS variables
(not tailwind values), and per **#11** Figma modes ARE the per-product brand modes — both
mechanisms are established here.

### Verify (restated from PLAN.md Phase 2 row)

- dev server → themed components at `localhost:8081`, dark toggle works;
- `pnpm --filter @platform/ui storybook` renders the gallery, light/dark + brand toolbar
  switches re-theme live;
- `node scripts/figma-tokens.mjs` regenerates `theme.ts` from Figma Variables (or a
  committed fixture if no Figma file yet);
- `/add-component` produces a primitive with story + Code Connect + baseline;
- Expo Go on device shows the same themed components;
- `turbo run export:web` + `npx serve dist` serves the SPA build;
- `turbo run test` runs the RNTL test.
- **Settles NativeWind v4 ↔ SDK 56 compat; safe-harbor fallback = SDK 54 (NOT 55).**

---

## Prerequisites

Phase 1 is **complete** and committed. The following already exist and must NOT be
recreated here (only consumed/extended):

- `mise.toml` (Node 24 LTS, pnpm 11, Python 3.13, uv); `mise install` run.
- `pnpm-workspace.yaml` carries `nodeLinker: hoisted` (pnpm 11 relocated this setting out of
  `.npmrc`; `.npmrc` is auth/registry-only) — Key ruling **#6**; never set
  `disableHierarchicalLookups`.
- `pnpm-workspace.yaml` with globs `packages/*` and
  `products/*/{app,desktop,api,api-client}`.
- `package.json` (root) with `turbo`, `prettier`, `lefthook` devDeps and a
  `packageManager` field; `turbo.json` (2.9 `tasks`); `tsconfig.base.json` (strict,
  `moduleResolution: bundler`, `noEmit`).
- `lefthook.yml` (pre-commit staged lint/format; pre-push `--affected`), installed via
  `pnpm prepare`.
- **`packages/config`** = `@platform/config`: ESLint flat config, `prettier.json`,
  **`tailwind-preset.js`** (the semantic-token → CSS-var preset), and
  `tsconfig/{base,expo,node}.json`.
- `.github/workflows/` skeletons exist (ci.yml, e2e-nightly.yml, …) — Phase 2 only adds
  the VR baseline data they consume; nightly wiring is finalized in Phase 8.

> Confirm before starting: `mise install && pnpm install && pnpm turbo run lint` is a clean
> no-op (Phase 1 verify). If `packages/config/tailwind-preset.js` does not yet map semantic
> color names to `hsl(var(--…))`, finish that in this phase's step (b) before wiring
> `packages/ui`.

---

## Definition of done

Concrete, testable:

1. `pnpm --filter @platform/ui exec tsc --noEmit` passes; `packages/ui` exports `Button`,
   `Text`, `Input`, `Card` (+ their variant prop types) from `src/index.ts`.
2. Each primitive consumes **semantic tokens only** (`bg-primary`, `text-foreground`, …) —
   `git grep -nE '#[0-9a-fA-F]{3,6}|rgb\(' packages/ui/src/components` returns nothing.
3. `packages/ui/src/lib/theme.ts` exports default light + dark token sets; `lib/utils.ts`
   exports `cn()`.
4. `@platform/config/tailwind-preset` maps every semantic color to `hsl(var(--…))`.
5. `pnpm --filter @platform/ui storybook` boots a Vite dev server; the gallery shows one
   story per cva variant for all four primitives; the **theme** (light|dark) and **brand**
   (template|demo) toolbars re-theme live.
6. `pnpm --filter @platform/ui build-storybook` produces `storybook-static/` with a
   readable `index.json` (used by VR).
7. Each primitive has a colocated `*.figma.tsx` Code Connect map (skeleton acceptable with
   a placeholder `figma.connect` URL until the real file key exists).
8. `node scripts/figma-tokens.mjs` regenerates **both** `packages/ui/src/lib/theme.ts`
   (native `vars()`) **and** `packages/ui/src/global.css` (`:root`/`.dark`) from the
   configured source (Tokens Studio DTCG fixture by default) via Style Dictionary v5, without
   error and idempotently (`git diff --exit-code` clean on a second run).
9. `figma.config.json`, `packages/ui/FIGMA.md`, and the three commands
   (`/add-component`, `/sync-tokens`, `/bootstrap-design-system`) exist under
   `packages/ui/.claude/commands/`.
10. `@platform/core` exports a configured TanStack Query client with cache persistence
    (AsyncStorage native / localStorage web) and an `env` accessor.
11. `products/_template/app` boots: `pnpm --filter @platform/template-app exec expo start`
    serves at **port 8081**; the (tabs) layout shows an index + settings screen; the
    settings theme toggle flips light/dark live on web AND native.
12. `turbo run export:web --filter=@platform/template-app` emits `dist/` (SPA,
    `web.output: "single"`); `npx serve dist` serves it.
13. `turbo run test --filter=@platform/ui` runs the first Button RNTL test green.

---

## Build steps

> Run all commands from the repo root unless noted. Pin pre-1.0 / fast-moving deps
> **exact** (no `^`): `nativewind`, `react-native-reusables` CLI output's `@rn-primitives/*`,
> `@hey-api/*` (Phase 4), Expo SDK packages via `expo install`.

### (a) `packages/ui` scaffolding + react-native-reusables adoption + `lib/`

**Files**

```
packages/ui/package.json
packages/ui/tsconfig.json
packages/ui/src/index.ts
packages/ui/src/lib/utils.ts
packages/ui/src/lib/theme.ts          # (filled in step (b); created here)
packages/ui/src/components/ui/text.tsx
packages/ui/src/components/ui/button.tsx
packages/ui/src/components/ui/input.tsx
packages/ui/src/components/ui/card.tsx
packages/ui/CLAUDE.md                 # design-system runbook
```

**Contents**

`packages/ui/package.json` — consumed AS SOURCE, **no build step** (per directory tree:
"consumed AS SOURCE, no build"):

```json
{
  "name": "@platform/ui",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./global.css": "./src/global.css"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  },
  "dependencies": {
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "tailwind-merge": "2.6.0",
    "@rn-primitives/slot": "1.4.0",
    "@rn-primitives/types": "1.4.0"
  },
  "peerDependencies": {
    "nativewind": "*",
    "react": "*",
    "react-native": "*"
  },
  "devDependencies": {
    "@platform/config": "workspace:*"
  }
}
```

> The `@rn-primitives/*` pins above are **1.4.x** (current `latest`, June 2026 — slot, types,
> portal all at 1.4.0); these packages are **past 1.0**, so the pin-exact rationale is
> **version-coupling to react-native-reusables** (rn-reusables components couple to specific
> primitive releases and minor bumps can shift behavior), NOT pre-1.0 instability. Pin to
> whatever the react-native-reusables CLI emits at adoption time, then freeze (exact, no
> caret). `class-variance-authority 0.7.1` and `clsx 2.1.1` are current; `tailwind-merge`
> stays on the **2.6.x** line — do NOT bump to 3.x, which assumes Tailwind v4 (this stack is
> Tailwind v3 / NativeWind v4).

`packages/ui/tsconfig.json`:

```json
{
  "extends": "@platform/config/tsconfig/expo.json",
  "include": ["src", ".storybook"]
}
```

`packages/ui/src/lib/utils.ts` — the `cn()` helper:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`packages/ui/src/components/ui/text.tsx` — base primitive (cva + `className` escape hatch,
semantic tokens only):

```tsx
import * as React from "react";
import { Text as RNText } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const textVariants = cva("text-base text-foreground", {
  variants: {
    variant: {
      default: "",
      muted: "text-muted-foreground",
      destructive: "text-destructive",
    },
    size: {
      sm: "text-sm",
      base: "text-base",
      lg: "text-lg",
      xl: "text-xl font-semibold",
    },
  },
  defaultVariants: { variant: "default", size: "base" },
});

export type TextProps = React.ComponentProps<typeof RNText> &
  VariantProps<typeof textVariants>;

export function Text({ className, variant, size, ...props }: TextProps) {
  return (
    <RNText className={cn(textVariants({ variant, size }), className)} {...props} />
  );
}

export { textVariants };
```

`packages/ui/src/components/ui/button.tsx` — primary primitive (Pressable + Slot, cva):

```tsx
import * as React from "react";
import { Pressable } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Text } from "@/components/ui/text";

const buttonVariants = cva(
  "flex-row items-center justify-center rounded-md",
  {
    variants: {
      variant: {
        default: "bg-primary",
        secondary: "bg-secondary",
        destructive: "bg-destructive",
        outline: "border border-input bg-background",
        ghost: "bg-transparent",
      },
      size: {
        sm: "h-9 px-3",
        default: "h-10 px-4",
        lg: "h-11 px-6",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

const buttonTextVariants = cva("text-sm font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-foreground",
      ghost: "text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export type ButtonProps = React.ComponentProps<typeof Pressable> &
  VariantProps<typeof buttonVariants> & { children?: React.ReactNode };

export function Button({
  className,
  variant,
  size,
  children,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      className={cn(buttonVariants({ variant, size }), className)}
      accessibilityRole="button"
      {...props}
    >
      {typeof children === "string" ? (
        <Text className={cn(buttonTextVariants({ variant }))}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export { buttonVariants, buttonTextVariants };
```

`packages/ui/src/components/ui/input.tsx`:

```tsx
import * as React from "react";
import { TextInput } from "react-native";
import { cn } from "@/lib/utils";

export type InputProps = React.ComponentProps<typeof TextInput>;

export const Input = React.forwardRef<TextInput, InputProps>(
  ({ className, ...props }, ref) => (
    <TextInput
      ref={ref}
      className={cn(
        "h-10 rounded-md border border-input bg-background px-3 text-base text-foreground",
        className,
      )}
      placeholderTextColor="hsl(var(--muted-foreground))"
      {...props}
    />
  ),
);
Input.displayName = "Input";
```

`packages/ui/src/components/ui/card.tsx`:

```tsx
import * as React from "react";
import { View } from "react-native";
import { cn } from "@/lib/utils";
import { Text } from "@/components/ui/text";

export function Card({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View
      className={cn("rounded-lg border border-border bg-card p-4", className)}
      {...props}
    />
  );
}
export function CardTitle({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text className={cn("text-lg font-semibold text-card-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("pt-2", className)} {...props} />;
}
```

`packages/ui/src/index.ts`:

```ts
export { Text, textVariants, type TextProps } from "./components/ui/text";
export {
  Button,
  buttonVariants,
  buttonTextVariants,
  type ButtonProps,
} from "./components/ui/button";
export { Input, type InputProps } from "./components/ui/input";
export { Card, CardTitle, CardContent } from "./components/ui/card";
export { cn } from "./lib/utils";
export { themes, type Theme } from "./lib/theme";
```

**Commands**

```bash
mkdir -p packages/ui/src/components/ui packages/ui/src/lib
# Adopt react-native-reusables primitives via its CLI (copies OWNED source).
# Project = founded-labs/react-native-reusables (moved from mrzachnugent); CLI is
# @react-native-reusables/cli (latest 0.7.1). Run from packages/ui so files land in
# src/components/ui:
pnpm --filter @platform/ui dlx @react-native-reusables/cli@latest add text button input card
# Reconcile the CLI output into the shadcn shape above; then:
pnpm --filter @platform/ui exec tsc --noEmit
```

> rn-reusables now supports **both NativeWind and Uniwind**. When the CLI/`init` prompts,
> select the **NativeWind (v4) path**, NOT Uniwind/CSS-first — otherwise the emitted config
> won't match this stack's `tailwind.config.js` preset. Since the source is reconciled by
> hand into owned components, engine selection mainly affects the CLI's generated config
> (which the app overrides anyway). If `cli add` errors under pnpm (it shells out to
> `shadcn@latest` — known issue), author the component by hand into the shadcn shape above.

> The `@/` import alias (`@/lib/utils`, `@/components/ui/text`) is the react-native-reusables
> convention; map it in `packages/ui/tsconfig.json` `compilerOptions.paths` (`"@/*": ["src/*"]`)
> and mirror it in the Storybook Vite + Jest configs (steps c, i).

**Why** — PLAN.md Design system bullet + Component-lifecycle bullet: primitives are
**Tier-1 OWNED** source (shadcn model), consume **semantic tokens ONLY**, expose cva
variants + a `className` escape hatch, and are consumed as source (no build) so one set
ships to all four targets.

---

### (b) tailwind preset wiring + theming (CSS vars web, NativeWind `vars()` native, light + dark)

**Files**

```
packages/config/tailwind-preset.js   # (exists from Phase 1 — verify/extend)
packages/ui/src/global.css           # default :root + .dark CSS-var blocks (web)
packages/ui/src/lib/theme.ts         # default light/dark vars() objects (native)
packages/ui/src/theme-provider.tsx   # provides NativeWind vars() + dark class plumbing
```

**Contents**

`packages/config/tailwind-preset.js` (Key ruling **#8** — semantic names → CSS vars):

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
    },
  },
};
```

`packages/ui/src/global.css` (web side — `:root` light, `.dark` dark; these are the
**default** values, overridable per product):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 4%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 4%;
    --primary: 240 6% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 5% 96%;
    --secondary-foreground: 240 6% 10%;
    --muted: 240 5% 96%;
    --muted-foreground: 240 4% 46%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 6% 90%;
    --input: 240 6% 90%;
    --ring: 240 5% 65%;
  }
  .dark:root {
    --background: 240 10% 4%;
    --foreground: 0 0% 98%;
    --card: 240 10% 4%;
    --card-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 6% 10%;
    --secondary: 240 4% 16%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 4% 16%;
    --muted-foreground: 240 5% 65%;
    --destructive: 0 63% 31%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 4% 16%;
    --input: 240 4% 16%;
    --ring: 240 5% 84%;
  }
}
```

`packages/ui/src/lib/theme.ts` (native side — **NativeWind `vars()` objects**; this is the
file the Figma pipeline regenerates, so keep it mechanically formatted):

```ts
import { vars } from "nativewind";

// NOTE: regenerated by scripts/figma-tokens.mjs — do NOT hand-edit.
export const themes = {
  light: vars({
    "--background": "0 0% 100%",
    "--foreground": "240 10% 4%",
    "--card": "0 0% 100%",
    "--card-foreground": "240 10% 4%",
    "--primary": "240 6% 10%",
    "--primary-foreground": "0 0% 98%",
    "--secondary": "240 5% 96%",
    "--secondary-foreground": "240 6% 10%",
    "--muted": "240 5% 96%",
    "--muted-foreground": "240 4% 46%",
    "--destructive": "0 84% 60%",
    "--destructive-foreground": "0 0% 98%",
    "--border": "240 6% 90%",
    "--input": "240 6% 90%",
    "--ring": "240 5% 65%",
  }),
  dark: vars({
    "--background": "240 10% 4%",
    "--foreground": "0 0% 98%",
    "--card": "240 10% 4%",
    "--card-foreground": "0 0% 98%",
    "--primary": "0 0% 98%",
    "--primary-foreground": "240 6% 10%",
    "--secondary": "240 4% 16%",
    "--secondary-foreground": "0 0% 98%",
    "--muted": "240 4% 16%",
    "--muted-foreground": "240 5% 65%",
    "--destructive": "0 63% 31%",
    "--destructive-foreground": "0 0% 98%",
    "--border": "240 4% 16%",
    "--input": "240 4% 16%",
    "--ring": "240 5% 84%",
  }),
} as const;

export type Theme = keyof typeof themes;
```

`packages/ui/src/theme-provider.tsx` (applies `vars()` on native; relies on the `.dark`
class on web — `colorScheme` from NativeWind):

```tsx
import * as React from "react";
import { View } from "react-native";
import { colorScheme } from "nativewind";
import { themes, type Theme } from "@/lib/theme";

export function ThemeProvider({
  theme,
  children,
}: {
  theme: Theme;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    colorScheme.set(theme); // toggles the `.dark` class on web
  }, [theme]);
  return (
    <View style={themes[theme]} className="flex-1 bg-background">
      {children}
    </View>
  );
}
```

**Commands**

```bash
pnpm --filter @platform/ui exec tsc --noEmit
git grep -nE '#[0-9a-fA-F]{3,6}' packages/ui/src/components   # expect: no matches
```

**Why** — Key ruling **#8** + the "Theming wiring" gotcha: the preset maps semantic names
to `hsl(var(--…))`; web reads them from `:root`/`.dark` in `global.css`, native reads the
same names from NativeWind `vars()` objects. Identical mechanism on all four targets;
products rebrand by overriding VALUES, never component code.

---

### (c) Storybook `react-native-web-vite` workbench + per-variant stories

**Files**

```
packages/ui/.storybook/main.ts
packages/ui/.storybook/preview.tsx
packages/ui/src/components/ui/button.stories.tsx
packages/ui/src/components/ui/text.stories.tsx
packages/ui/src/components/ui/input.stories.tsx
packages/ui/src/components/ui/card.stories.tsx
```

Target **Storybook 9 (9.1.x)** (PLAN.md locked call — chosen over ESM-only Storybook 10 for
broadest RN-web-vite + NativeWind compat). Add Storybook devDeps to
`packages/ui/package.json` (exact pins — freeze to the installed 9.1.x versions):
`storybook` (9.1.x), `@storybook/react-native-web-vite` (9.1.x), `vite`, `react`,
`react-dom`, `react-native-web` (via `expo install`), and the Tailwind toolchain for the
`global.css` step — for **Tailwind v3 / NativeWind v4** that is `postcss` + `tailwindcss@^3.4`
+ `autoprefixer` (NOT `@tailwindcss/vite`, which is the Tailwind v4 path).

> Do NOT separately install `@storybook/react-vite`, `@storybook/react`, or
> `@vitejs/plugin-react` — `@storybook/react-native-web-vite` depends on all three (plus
> `vite-plugin-rnw` and `vite-tsconfig-paths`) and pins its own sibling versions. Listing
> them explicitly only risks drifting out of lockstep with the framework.

**Contents**

`packages/ui/.storybook/main.ts` — NativeWind is wired through the **framework options**
(`pluginReactOptions.jsxImportSource: "nativewind"`), NOT a CSS import alone; the bundled
`vite-plugin-rnw` already aliases `react-native` → `react-native-web`, so **no manual
`react-native` alias** is needed (only the `@` → `src` alias for the component-import
convention):

```ts
import type { StorybookConfig } from "@storybook/react-native-web-vite";
import path from "node:path";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/react-native-web-vite",
    options: {
      pluginReactOptions: {
        jsxRuntime: "automatic",
        jsxImportSource: "nativewind",
      },
    },
  },
  stories: ["../src/**/*.stories.tsx"],
  addons: [],
  viteFinal: async (cfg) => {
    // react-native -> react-native-web is handled by the framework's bundled
    // vite-plugin-rnw — do NOT add a manual alias. Only the @ -> src alias is needed.
    cfg.resolve = cfg.resolve ?? {};
    cfg.resolve.alias = {
      ...(cfg.resolve.alias ?? {}),
      "@": path.resolve(__dirname, "../src"),
    };
    // Run the Tailwind v3 pipeline on global.css (PostCSS + tailwindcss@^3.4 + autoprefixer).
    // global.css is imported in preview.tsx; ensure a postcss.config.js with the
    // tailwindcss + autoprefixer plugins exists so NativeWind utilities resolve.
    return cfg;
  },
};
export default config;
```

> ⚠️ NativeWind-in-RNW-Vite-Storybook is a known finicky integration (Storybook issue
> **#32018**): it needs **all** of (1) `jsxImportSource: "nativewind"` in the framework
> options, (2) `global.css` imported (preview.tsx, below), and (3) an actual Tailwind CSS
> pipeline in Vite (PostCSS + `tailwindcss@^3.4` + `autoprefixer` for Tailwind v3). Missing
> any one and `className`/NativeWind utilities silently fail to render. The reference setup
> is `dannyhw/vite-rnw-example` (NativeWind v4 + Tailwind v3 + autoprefixer).

`packages/ui/.storybook/preview.tsx` — imports `global.css`, wraps every story in the
theme provider, declares `theme` + `brand` toolbar globals:

```tsx
import * as React from "react";
import type { Preview, Decorator } from "@storybook/react-native-web-vite";
import "../src/global.css";
import { ThemeProvider } from "../src/theme-provider";

// Brand override blocks — `template` uses defaults; `demo` overrides primary.
// In steady state these mirror Figma brand modes (Key ruling #11).
const BRAND_VARS: Record<string, Record<string, string>> = {
  template: {},
  demo: {
    "--primary": "262 83% 58%",
    "--primary-foreground": "0 0% 100%",
    "--ring": "262 83% 58%",
  },
};

const withTheme: Decorator = (Story, ctx) => {
  const theme = (ctx.globals.theme as "light" | "dark") ?? "light";
  const brand = (ctx.globals.brand as string) ?? "template";

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    const overrides = BRAND_VARS[brand] ?? {};
    Object.entries(overrides).forEach(([k, v]) => root.style.setProperty(k, v));
    return () => Object.keys(overrides).forEach((k) => root.style.removeProperty(k));
  }, [theme, brand]);

  return (
    <ThemeProvider theme={theme}>
      <Story />
    </ThemeProvider>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: "Light / dark token set",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
    brand: {
      description: "Brand mode (Figma mode mirror)",
      defaultValue: "template",
      toolbar: {
        title: "Brand",
        icon: "paintbrush",
        items: [
          { value: "template", title: "template" },
          { value: "demo", title: "demo" },
        ],
        dynamicTitle: true,
      },
    },
  },
};
export default preview;
```

`packages/ui/src/components/ui/button.stories.tsx` — **one story per cva variant**:

```tsx
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Button } from "./button";

const meta: Meta<typeof Button> = {
  title: "UI/Button",
  component: Button,
  args: { children: "Button" },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = { args: { variant: "default" } };
export const Secondary: Story = { args: { variant: "secondary" } };
export const Destructive: Story = { args: { variant: "destructive" } };
export const Outline: Story = { args: { variant: "outline" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Small: Story = { args: { size: "sm" } };
export const Large: Story = { args: { size: "lg" } };
```

(Author `text.stories.tsx`, `input.stories.tsx`, `card.stories.tsx` analogously — one story
per variant; `argTypes` may be derived from each component's cva config.)

**Commands**

```bash
pnpm --filter @platform/ui storybook        # dev server on :6006
pnpm --filter @platform/ui build-storybook  # -> storybook-static/ + index.json
```

> Storybook dev port: **6006** (Storybook's default) — confirmed not to clash with the app's
> fixed **8081** (Expo). Resolved; keep 6006.

**Why** — PLAN.md "Design system workbench" bullet + "Storybook" gotcha: a SINGLE shared
workbench in `packages/ui` renders the SAME RN components through react-native-web
(`@storybook/react-native-web-vite`, NOT on-device `@storybook/react-native`); the global
decorator imports `global.css` + the theme provider so `className`/NativeWind utilities
resolve identically to the app; `theme` + `brand` toolbars are the live preview surface for
the Figma token modes.

---

### (d) Code Connect `*.figma.tsx` skeletons (colocated)

**Files**

```
packages/ui/src/components/ui/button.figma.tsx
packages/ui/src/components/ui/text.figma.tsx
packages/ui/src/components/ui/input.figma.tsx
packages/ui/src/components/ui/card.figma.tsx
figma.config.json                     # Code Connect CLI config — MUST be at REPO ROOT
```

**Contents**

`packages/ui/src/components/ui/button.figma.tsx` — maps Figma component props → cva variants:

```tsx
import figma from "@figma/code-connect";
import { Button } from "./button";

// ⚠️ OPEN / TO CONFIRM: replace the placeholder node URL once the real Figma
// Components library file key exists (filled during /bootstrap-design-system).
figma.connect(
  Button,
  "https://www.figma.com/design/FILE_KEY/Design-System?node-id=BUTTON_NODE",
  {
    props: {
      label: figma.string("Label"),
      variant: figma.enum("Variant", {
        Default: "default",
        Secondary: "secondary",
        Destructive: "destructive",
        Outline: "outline",
        Ghost: "ghost",
      }),
      size: figma.enum("Size", { sm: "sm", default: "default", lg: "lg" }),
    },
    example: ({ label, variant, size }) => (
      <Button variant={variant} size={size}>
        {label}
      </Button>
    ),
  },
);
```

(Other three analogous; map each Figma variant/property to its cva variant prop.)

Add `@figma/code-connect` (exact pin — current `latest` 1.4.8) as a `packages/ui`
devDependency. The Code Connect CLI config file MUST be named **`figma.config.json`** and
live at the **repo ROOT** (next to `package.json`) — a `.figma/` subdirectory is **NOT
discovered** by the CLI, and `include`/`exclude` globs resolve relative to the config file's
location. The parser value for React Native is **`react`** (there is no `react-native`
parser; valid values are `react | html | swift | compose`):

```json
{
  "codeConnect": {
    "parser": "react",
    "include": ["packages/ui/src/**/*.figma.tsx"]
  }
}
```

> ⚠️ Filename collision: the **token-pipeline** config (step (e)) is named **`tokens.config.json`**
> (NOT `figma.config.json`) specifically to avoid colliding with Code Connect's own
> root `figma.config.json`. These are two different schemas — keep them as separate root
> files. (Code Connect tolerates extra top-level keys, so the two could alternatively be
> merged into one root `figma.config.json`, but this guide keeps them separate for clarity.)

**Commands**

```bash
# Validate / publish maps. The Code Connect CLI reads FIGMA_ACCESS_TOKEN (or --token) —
# NOT FIGMA_TOKEN. Token needs scopes code_connect:write + file_content:read:
FIGMA_ACCESS_TOKEN=… pnpm dlx @figma/code-connect parse
# publish (figma connect publish) is run during /bootstrap-design-system, not on every build.
```

> ⚠️ Env-var distinction: the Code Connect CLI uses **`FIGMA_ACCESS_TOKEN`**
> (scopes `code_connect:write` + `file_content:read`). This is DISTINCT from the REST
> Variables pull's `FIGMA_TOKEN`/`X-Figma-Token` (step (e)), which additionally needs
> `file_variables:read` and stays **Enterprise-only**. Using one env name for both silently
> fails the publish step.

**Why** — PLAN.md "Figma bridge" plane (2): colocated `*.figma.tsx` maps Figma component
props → cva variants so MCP `get_design_context` returns owned `@platform/ui` components,
not generic JSX. Key ruling **#11**: Code Connect maps are the only design artifacts that
live in-repo as source.

---

### (e) Figma token pipeline — `scripts/figma-tokens.mjs` (source-abstracted) + `figma.config.json` + Style Dictionary

**Files**

```
scripts/figma-tokens.mjs              # source-abstracted (Tokens Studio JSON default / REST), USES Style Dictionary v5
tokens.config.json                    # repo root: fileKey + collection -> product mode map (NOT figma.config.json — that's Code Connect's)
packages/ui/figma/tokens.json         # committed Tokens Studio export (DTCG format) — the default source/fixture
```

**Contents**

`tokens.config.json` (root) — per the "Figma bridge" gotcha
(`{ fileKey, modes: { "template": <modeId>, "demo": <modeId> } }`), extended with the
source selector. **This file is deliberately named `tokens.config.json`, NOT
`figma.config.json`** — the latter is reserved for the Code Connect CLI (step (d)) and the
two schemas would otherwise collide on one filename:

```json
{
  "fileKey": "TODO-FIGMA-FILE-KEY",
  "source": "tokens-studio",
  "tokensFile": "packages/ui/figma/tokens.json",
  "modes": {
    "template": "TODO-MODE-ID-TEMPLATE",
    "demo": "TODO-MODE-ID-DEMO"
  },
  "outputs": {
    "themeTs": "packages/ui/src/lib/theme.ts",
    "globalCss": "packages/ui/src/global.css"
  }
}
```

`scripts/figma-tokens.mjs` (ESM Node; **actually drives Style Dictionary v5** — a custom
HSL-channel transform + the stock `css/variables` format for web `global.css` + a JS format
for native `theme.ts`, both from one resolved token tree; **source abstracted behind one
interface** — Tokens Studio JSON default, REST on Enterprise):

```js
#!/usr/bin/env node
// Figma Variables -> Style Dictionary v5 -> co-generate web global.css (:root/.dark) AND
// native theme.ts (vars()) from ONE resolved token tree (one-way, committed).
// SD v5 is ESM-only + DTCG-default — this script is .mjs to match.
// Source abstracted: default = Tokens Studio JSON export, DTCG format (tier-independent,
// CI-runnable, reviewable diff); set source:"rest" + FIGMA_TOKEN for the Enterprise-only
// Variables REST API. NOTE: this script reads tokens.config.json (NOT figma.config.json —
// that file belongs to the Code Connect CLI, step (d)).
import fs from "node:fs";
import StyleDictionary from "style-dictionary";

const cfg = JSON.parse(fs.readFileSync("tokens.config.json", "utf8"));

async function loadSource() {
  if (cfg.source === "rest") {
    // Enterprise-only: GET /v1/files/:key/variables/local (needs FIGMA_TOKEN w/
    // file_variables:read + file_content:read). Dereference VARIABLE_ALIAS references and
    // emit a DTCG token tree keyed by mode (cfg.modes maps brand -> modeId).
    const res = await fetch(
      `https://api.figma.com/v1/files/${cfg.fileKey}/variables/local`,
      { headers: { "X-Figma-Token": process.env.FIGMA_TOKEN } },
    );
    if (!res.ok) throw new Error(`Figma REST ${res.status}`);
    return toDtcg(normalizeRest(await res.json()));
  }
  // default: Tokens Studio DTCG JSON (committed fixture); @tokens-studio/sd-transforms (or
  // SD's DTCG parser) resolves token-set layering + {alias} references.
  return toDtcg(JSON.parse(fs.readFileSync(cfg.tokensFile, "utf8")));
}

function normalizeRest(json) { /* resolve semantic collection modes via cfg.modes */ }
function toDtcg(json) { /* -> DTCG token tree: { semantic: { background: { $value, $type:"color" }, ... } } per mode */ }

// Custom transform: emit space-separated HSL CHANNELS ("240 6% 10%") so the Tailwind preset's
// hsl(var(--x)) wrapper resolves. SD's stock color transforms output hex/rgb — not channels —
// so this transform is REQUIRED for this stack.
StyleDictionary.registerTransform({
  name: "color/hsl-channels",
  type: "value",
  filter: (t) => t.$type === "color" || t.type === "color",
  transform: (t) => toHslChannels(t.$value ?? t.value), // "H S% L%"
});

// JS format: emit the native theme.ts (NativeWind vars() objects, light+dark).
StyleDictionary.registerFormat({
  name: "javascript/nativewind-theme",
  format: ({ dictionary }) => emitThemeTs(groupByMode(dictionary.allTokens)),
});

function emitThemeTs(modesByName) {
  const order = ["light", "dark"]; // resolved per product brand mode pair
  const block = (name) =>
    `  ${name}: vars(${JSON.stringify(modesByName[name], null, 4)}),`;
  return `import { vars } from "nativewind";\n\n` +
    `// NOTE: regenerated by scripts/figma-tokens.mjs — do NOT hand-edit.\n` +
    `export const themes = {\n${order.map(block).join("\n")}\n} as const;\n\n` +
    `export type Theme = keyof typeof themes;\n`;
}

const tokens = await loadSource();
const sd = new StyleDictionary({
  tokens,
  platforms: {
    // WEB: stock css/variables format -> :root (light) + .dark (dark) blocks in global.css.
    web: {
      transforms: ["color/hsl-channels"],
      buildPath: "packages/ui/src/",
      files: [{ destination: "global.css", format: "css/variables", options: { selector: ":root" } }],
    },
    // NATIVE: custom JS format -> theme.ts vars() objects.
    native: {
      transforms: ["color/hsl-channels"],
      buildPath: "packages/ui/src/lib/",
      files: [{ destination: "theme.ts", format: "javascript/nativewind-theme" }],
    },
  },
});
await sd.buildAllPlatforms(); // writes cfg.outputs.globalCss + cfg.outputs.themeTs
console.log("regenerated global.css (web) + theme.ts (native)");
```

> **Style Dictionary v5 is actually used** (not just referenced in a comment) — the script
> registers a **custom value transform** (`color/hsl-channels`) because SD's stock color
> transforms emit hex/rgb, but this stack needs space-separated HSL channels to feed the
> `hsl(var(--x))` Tailwind preset; then it co-generates BOTH targets from one resolved token
> tree: the stock **`css/variables`** format writes the web `:root`/`.dark` blocks in
> `global.css`, and a small **JS format** writes the native `theme.ts` `vars()` objects. This
> resolves the prior "does it also rewrite global.css?" TODO — **yes, both web and native are
> co-generated**, matching the PLAN's "both derive from the same modes". SD v5 is **ESM-only
> + DTCG-default**, which is why the script is `.mjs` and the fixture is DTCG.

`packages/ui/figma/tokens.json` — the committed Tokens Studio fixture **in DTCG format** (the
default source so the pipeline runs in CI with **no** Figma file): `light`/`dark` token sets
holding the same semantic names as `theme.ts`, with `$value`/`$type` per the DTCG spec.
Tokens Studio's native JSON is NOT plain Style-Dictionary format — export in **DTCG** and let
`@tokens-studio/sd-transforms` (or SD's DTCG parser) resolve `{alias}` references + set
layering.

Add `style-dictionary` (exact pin, **v5 / 5.4.x**) — and, if consuming Tokens Studio exports,
`@tokens-studio/sd-transforms` — as root devDependencies.

**Commands**

```bash
node scripts/figma-tokens.mjs                          # regenerate theme.ts
git diff --exit-code packages/ui/src/lib/theme.ts      # second run must be clean (idempotent)
```

**Why** — PLAN.md "Figma bridge" plane (1) + Key ruling **#11** + the explicit Phase 2
note "source-abstracted: Tokens Studio JSON default / REST on Enterprise". One-directional
(Figma → code, committed) keeps generated theme files reviewable. The REST Variables API is
**Enterprise-only**, which is exactly why Tokens Studio JSON is the default (see Gotchas).

---

### (f) `FIGMA.md` + `/bootstrap-design-system`, `/add-component`, `/sync-tokens` commands

**Files**

```
packages/ui/FIGMA.md
packages/ui/.claude/commands/bootstrap-design-system.md
packages/ui/.claude/commands/add-component.md
packages/ui/.claude/commands/sync-tokens.md
```

**Contents**

`packages/ui/FIGMA.md` (the single designer-facing doc — Variables structure, modes,
names-as-API, component anatomy, publish as team library):

```md
# Figma conventions — @platform/ui design system

This is the contract between Figma and code. The repo's theming mechanism (semantic CSS
variables, per-product = override VALUES) has an exact Figma mirror.

## Variables (two collections)
- **primitives** — raw scale (color ramps, spacing). Never referenced directly by components.
- **semantic** — `--background`, `--foreground`, `--primary`, `--primary-foreground`,
  `--secondary`, `--muted`, `--muted-foreground`, `--destructive`, `--border`, `--input`,
  `--ring`. Components bind ONLY to semantic variables.

## Modes = theme × brand
The `semantic` collection's modes are **light/dark × brand (template/demo)**. Each maps
1:1 onto a product's `theme.ts` / `global.css`. A new product = a new brand mode.

## Names are the API
Variable + component-property names must be code-friendly (match the cva variant values:
`Variant=Default|Secondary|Destructive|Outline|Ghost`, `Size=sm|default|lg`). No raw hex
fills — every fill bound to a semantic variable.

## Component anatomy matches code
Component sets mirror the owned components (Text, Button, Input, Card). Variant axes match
the cva variants exactly so Code Connect maps stay 1:1.

## Publish as a team library
Two libraries: **Foundations** (Variables) + **Components** (component sets). Publish so MCP
read access + Code Connect resolve them.
```

`packages/ui/.claude/commands/bootstrap-design-system.md` (handover-day procedure —
reconcile → tokens → components → verify; runs against the real library OR the committed
token fixture):

```md
Handover-day, one-time then incremental. Tokens FIRST, components SECOND.

Step 0 — connect + inventory + reconcile: get read access (Figma MCP Dev Mode or
FIGMA_TOKEN). Pull the token manifest (get_variable_defs / REST dump → collections, modes,
names, types) and the component manifest (get_metadata over the Components page → component
sets + variant schemas). Reconcile against FIGMA.md: flag raw-hex fills not bound to
variables, modes not mapping to light/dark/brand, non-code-friendly variant values. Resolve
with design BEFORE importing.

Step 1 — establish tokens (keystone): fix the canonical CSS-var contract; map Figma
semantic variables → those names in figma.config.json; run scripts/figma-tokens.mjs →
packages/ui default theme.ts + global.css. (If no Figma file yet, run against the committed
Tokens Studio fixture.)

Step 2 — establish components: walk the component manifest in dependency order
(Text → Button/Input/Card → composites); per component run the add-a-component recipe
(rn-reusables cli-add aligned to Figma variants, or author bespoke), accelerated by
get_design_context + get_code_connect_suggestions; publish Code Connect maps.

Step 3 — verify on all four targets: Storybook full gallery + brand/theme toolbar;
_template app themed on web/native/desktop; commit VR baselines; prove the live bind —
change one Figma token → /sync-tokens → everything re-themes.
```

`packages/ui/.claude/commands/add-component.md` (the fixed recipe):

```md
Add a Tier-1 owned primitive to @platform/ui. Argument: $ARGUMENTS (component name).

1. cli-add (or author): `pnpm --filter @platform/ui dlx @react-native-reusables/cli add <name>`
   then reconcile into the owned shadcn shape (cva variants, semantic tokens ONLY, cn()).
2. Pin any new @rn-primitives/* deps EXACT (no caret).
3. Write src/components/ui/<name>.stories.tsx — one story per cva variant.
4. Write src/components/ui/<name>.figma.tsx — Code Connect map (Figma props → cva variants).
5. Export from src/index.ts.
6. Commit a VR baseline (light + dark) by running the Storybook build + Playwright snapshot.
```

`packages/ui/.claude/commands/sync-tokens.md`:

```md
Regenerate theme files from the Figma token source. Never hand-edit generated theme.ts.

1. `node scripts/figma-tokens.mjs`
2. Review the diff in packages/ui/src/lib/theme.ts (+ global.css).
3. Commit. (CI re-runs and `git diff --exit-code` guards drift, like typegen.)
```

**Commands** — none (docs/commands; exercised via the slash commands).

**Why** — PLAN.md "Docs & agent surface" + "Bootstrap the design system from Figma" +
Component-lifecycle bullets. Commands live at the **`packages/ui` level** (operate on the
shared design system), distinct from root product-arg commands.

---

### (g) `packages/core` — query client + persistence + env

**Files**

```
packages/core/package.json
packages/core/tsconfig.json
packages/core/src/index.ts
packages/core/src/env.ts
packages/core/src/query.ts          # query client + cache persistence
packages/core/src/persist.web.ts    # localStorage persister
packages/core/src/persist.native.ts # AsyncStorage persister
```

> Scope note: PLAN.md Phase 2 only requires `packages/core` **(query+persist, env)**. The
> other `core` files in the directory tree (`supabase.ts`, `auth.ts`, `realtime.ts`,
> `notifications.ts`, `storage.ts`, `api.ts`, `sentry.ts`) are built in later phases (6, 8)
> — do NOT build them here.

**Contents**

`packages/core/package.json`:

```json
{
  "name": "@platform/core",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "lint": "eslint .", "typecheck": "tsc --noEmit", "test": "jest" },
  "dependencies": {
    "@tanstack/react-query": "5.101.0",
    "@tanstack/react-query-persist-client": "5.101.0",
    "@tanstack/query-async-storage-persister": "5.101.0",
    "@tanstack/query-sync-storage-persister": "5.101.0"
  },
  "peerDependencies": {
    "@react-native-async-storage/async-storage": "*",
    "react": "*"
  }
}
```

> Pins refreshed to the current TanStack Query **v5 (5.101.x)** line (June 2026) — keep all
> four `@tanstack/*` packages in lockstep on the same 5.10x version (they version together).
> There is no React TanStack Query v6; v5 is current. `@tanstack/query-sync-storage-persister`
> (web persister, used by `persist.web.ts` below) belongs here too. Install
> `@react-native-async-storage/async-storage` via `expo install` so it matches SDK 56 (current
> line 3.1.x). Zustand (used by the app shell's theme store in step (h)) is **v5 (5.0.x)** —
> `import { create } from "zustand"`.

`packages/core/src/env.ts` (publishable-only `EXPO_PUBLIC_*`):

```ts
export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
};
```

`packages/core/src/query.ts` (client + cache persistence; platform-resolved persister via
`.web/.native` extensions):

```ts
import { QueryClient } from "@tanstack/react-query";
import { persister } from "./persist";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 1000 * 60 * 60 * 24 },
    },
  });
}

export { persister };
```

`packages/core/src/persist.web.ts`:

```ts
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
export const persister = createSyncStoragePersister({ storage: window.localStorage });
```

`packages/core/src/persist.native.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
export const persister = createAsyncStoragePersister({ storage: AsyncStorage });
```

`packages/core/src/index.ts`:

```ts
export { makeQueryClient, persister } from "./query";
export { env } from "./env";
```

**Commands**

```bash
pnpm --filter @platform/core exec tsc --noEmit
```

**Why** — Code-sharing bullet: `packages/core` = plumbing only; the query client **with
cache persistence** (AsyncStorage native / localStorage web) and `env` are explicitly the
Phase 2 slice. Platform split uses the locked `.web/.native` extension mechanism.

---

### (h) `_template/app` shell — config + global.css + theme.ts + expo-router tabs + settings toggle

**Files**

```
products/_template/app/package.json
products/_template/app/app.config.ts
products/_template/app/metro.config.js
products/_template/app/babel.config.js
products/_template/app/tailwind.config.js
products/_template/app/global.css
products/_template/app/theme.ts
products/_template/app/tsconfig.json
products/_template/app/.env.development
products/_template/app/features/settings/use-theme.ts
products/_template/app/app/_layout.tsx
products/_template/app/app/(tabs)/_layout.tsx
products/_template/app/app/(tabs)/index.tsx
products/_template/app/app/(tabs)/settings.tsx
```

**Contents**

`products/_template/app/package.json` (name token = literal `template`, Key ruling **#7**):

```json
{
  "name": "@platform/template-app",
  "version": "0.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start --port 8081",
    "export:web": "expo export --platform web",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  },
  "dependencies": {
    "@platform/ui": "workspace:*",
    "@platform/core": "workspace:*",
    "expo": "*",
    "expo-router": "*",
    "nativewind": "*",
    "react": "*",
    "react-native": "*",
    "react-native-web": "*",
    "@react-native-async-storage/async-storage": "*"
  },
  "devDependencies": {
    "@platform/config": "workspace:*",
    "tailwindcss": "*"
  }
}
```

> Install Expo SDK deps with `expo install` so versions match the SDK (do not hand-pin
> Expo packages — this includes `react-native-web`, which `expo install` resolves to the
> version SDK 56 bundles; drop any `"*"`). Target **SDK 56 / RN 0.85**; safe-harbor fallback
> **SDK 54** (NOT 55 — see Gotchas).

`products/_template/app/app.config.ts` (Key ruling **#1/#2** — `web.output: "single"` SPA;
EAS Update needs `updates.url` + a `runtimeVersion` policy, not just `projectId`):

```ts
import type { ExpoConfig } from "expo/config";

const PROJECT_ID = "TODO-EAS-PROJECT-ID";

const config: ExpoConfig = {
  name: "template",
  slug: "template",
  scheme: "template",
  web: { output: "single", bundler: "metro" },
  ios: { bundleIdentifier: "com.example.template" },
  android: { package: "com.example.template" },
  // EAS Update OTA: projectId ALONE will NOT deliver OTA — `updates.url` +
  // `runtimeVersion` are the contract between a published JS bundle and the installed
  // native binary. `eas update:configure` writes/maintains both.
  updates: { url: `https://u.expo.dev/${PROJECT_ID}` },
  runtimeVersion: { policy: "appVersion" },
  extra: { eas: { projectId: PROJECT_ID } },
};
export default config;
```

> **SDK 56 OTA wiring (Key ruling, EAS Update bullet):** `extra.eas.projectId` alone is
> insufficient — `eas update --channel …` (Phase 8) only reaches installed builds when the
> app config carries `updates.url` (`https://u.expo.dev/<projectId>`) and a `runtimeVersion`
> policy (`appVersion` or `fingerprint`). `eas init` writes the projectId; `eas
> update:configure` adds/maintains `updates.url` + `runtimeVersion`. Phase 8's OTA flow
> depends on these being present here.
>
> **SDK 56 fetch / Expo Router gotchas (apply across this app):** (1) SDK 56 routes
> `globalThis.fetch` through **`expo/fetch`** (WinterCG) by default — invisible here, but it
> affects the generated client transport + Sentry network breadcrumbs in later phases; escape
> hatch is `EXPO_PUBLIC_USE_RN_FETCH=1`. (2) Expo Router v56 **forked React Navigation** —
> never import `@react-navigation/*` directly; use `expo-router` / `expo-router/*` entry
> points only (the route files below already do). (3) SDK 56 defaults to **Hermes v1**.

`products/_template/app/metro.config.js` (the hoisted-linker watchFolders/nodeModulesPaths
gotcha, Key ruling **#6**):

```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = withNativeWind(config, { input: "./global.css" });
```

`products/_template/app/babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

`products/_template/app/tailwind.config.js` (cross-package content glob via
`require.resolve` — the gotcha; `packages/ui` has NO tailwind config of its own):

```js
const path = require("node:path");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("@platform/config/tailwind-preset")],
  content: [
    "./app/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    path.dirname(require.resolve("@platform/ui/package.json")) + "/src/**/*.{ts,tsx}",
  ],
};
```

`products/_template/app/global.css` — product's CSS-var VALUES (defaults from the preset;
products override here). For the template, import the package defaults or inline the same
`:root`/`.dark` blocks as step (b).

`products/_template/app/theme.ts` — re-exports the `@platform/ui` `themes` (per Key ruling
**#11**, this file is "the export of one Figma brand mode"; for `template` it is the default
mode):

```ts
export { themes, type Theme } from "@platform/ui";
```

`products/_template/app/features/settings/use-theme.ts` (Zustand color-scheme store):

```ts
import { create } from "zustand";
import type { Theme } from "@platform/ui";

type ThemeState = { theme: Theme; toggle: () => void };
export const useThemeStore = create<ThemeState>((set) => ({
  theme: "light",
  toggle: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
}));
```

`products/_template/app/app/_layout.tsx` (THIN — theme + query providers; Key ruling **#9**):

```tsx
import "../global.css";
import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { makeQueryClient, persister } from "@platform/core";
import { ThemeProvider } from "@platform/ui/theme-provider";
import { useThemeStore } from "../features/settings/use-theme";

const queryClient = makeQueryClient();

export default function RootLayout() {
  const theme = useThemeStore((s) => s.theme);
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <ThemeProvider theme={theme}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
```

> Note: export `theme-provider` from `@platform/ui` (add `"./theme-provider"` to its
> `exports`) or re-export it from `src/index.ts`.

`products/_template/app/app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from "expo-router";
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
```

`products/_template/app/app/(tabs)/index.tsx` (a gallery of primitives to prove theming):

```tsx
import { View } from "react-native";
import { Card, CardTitle, CardContent, Button, Text, Input } from "@platform/ui";

export default function Home() {
  return (
    <View className="flex-1 gap-4 bg-background p-4">
      <Text size="xl">Template</Text>
      <Card>
        <CardTitle>Components</CardTitle>
        <CardContent>
          <Input placeholder="Type here" />
          <Button>Primary</Button>
        </CardContent>
      </Card>
    </View>
  );
}
```

`products/_template/app/app/(tabs)/settings.tsx` (the working theme toggle):

```tsx
import { View } from "react-native";
import { Button, Text } from "@platform/ui";
import { useThemeStore } from "../../features/settings/use-theme";

export default function Settings() {
  const { theme, toggle } = useThemeStore();
  return (
    <View className="flex-1 gap-4 bg-background p-4">
      <Text>Theme: {theme}</Text>
      <Button onPress={toggle}>Toggle dark mode</Button>
    </View>
  );
}
```

**Commands**

```bash
pnpm install
pnpm --filter @platform/template-app exec expo start --port 8081   # press w for web
turbo run export:web --filter=@platform/template-app && npx serve products/_template/app/dist
```

**Why** — Phase 2 row: "`_template/app` shell: tabs, settings screen with working theme
toggle". Key rulings **#1** (one Expo app), **#2** (`web.output: single`), **#6** (metro
watchFolders/nodeModulesPaths), **#9** (thin route files, product-local features). This is
the minimal rich-starter slice; auth/home-list screens come in Phases 4/6.

---

### (i) Jest `jest-expo` preset + RNTL config + first Button test

**Files**

```
packages/ui/jest.config.js
packages/ui/jest.setup.ts
packages/ui/src/components/ui/__tests__/button.test.tsx
```

**Contents**

`packages/ui/jest.config.js` (single runner, **jest-expo preset** + RNTL):

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@rn-primitives/.*|nativewind|react-native-css-interop|class-variance-authority|@platform/.*))",
  ],
};
```

`packages/ui/jest.setup.ts` (optional — matchers auto-register; kept for explicitness):

```ts
import "@testing-library/react-native/extend-expect";
```

> The `transformIgnorePatterns` allowlist above is a hand-maintained literal regex — a common
> source of "Cannot use import statement outside a module" when a new ESM dep lands. Prefer
> **extending** jest-expo's preset array (spread the preset's `transformIgnorePatterns` and
> append the extra modules) rather than replacing it, and re-verify the exact module list
> (especially `react-native-css-interop` internals) when the NativeWind v4 ↔ SDK 56 decision
> is settled — treat it as part of that empirical spike.

`packages/ui/src/components/ui/__tests__/button.test.tsx` (first RNTL test — **async**:
RNTL v14 made `render`/`fireEvent`/`renderHook` return Promises, so each test is `async`
and `await`s them):

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Button } from "../button";

describe("Button", () => {
  it("renders its label", async () => {
    await render(<Button>Press me</Button>);
    expect(screen.getByText("Press me")).toBeOnTheScreen();
  });

  it("fires onPress", async () => {
    const onPress = jest.fn();
    await render(<Button onPress={onPress}>Tap</Button>);
    await fireEvent.press(screen.getByText("Tap"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

> **RNTL v14 made the core API async (June 2026).** `render()` returns
> `Promise<RenderResult>`, `fireEvent()`/`fireEvent.press()` return `Promise<void>`, and
> `renderHook()` returns a Promise — all MUST be `await`ed (the test fn becomes `async`). A
> synchronous example runs `screen` queries before the render Promise resolves and never
> awaits the press. v14 requires React 19.0+ / RN 0.78+ — compatible with SDK 56's React 19.2
> / RN 0.85. Pin `@testing-library/react-native@14.x` exact.

Add devDeps to `packages/ui/package.json`: `jest`, **`jest-expo` (56.0.4 — the SDK-56-aligned
release; install via `expo install jest-expo jest` so it matches the SDK)**, and
`@testing-library/react-native` (14.x). **Do NOT add `@testing-library/jest-native`** — it is
deprecated and unmaintained; its matchers (including `toBeOnTheScreen`) are **built into RNTL
≥ 12.4 and auto-register on any RNTL import**, so the `jest.setup.ts` `extend-expect` line is
optional (kept below for explicitness / TS types). Do **not** blindly pin `react-test-renderer`:
React 19 deprecated it and RNTL v14 dropped it as a peer in favor of React 19's built-in test
renderer — only add it if RNTL v14's installed peer deps explicitly require it (verify at
install time), otherwise it just creates version-conflict noise.

**Commands**

```bash
pnpm --filter @platform/ui test
turbo run test --filter=@platform/ui
```

**Why** — Testing strategy table row 1: **single Jest runner (jest-expo preset) + RNTL**
for ALL JS tests, one templated config, `__tests__/` beside source, runs under
`turbo run test --affected`. Frontend tests mock at the generated-client boundary (not
relevant for this pure-UI test).

---

## Gotchas & pitfalls

- **NativeWind v4 ↔ Expo SDK 56 compat (the phase's headline risk).** Phase 2 must
  *settle* this. Use **NativeWind v4** (v5 is pre-release — forbidden; v5 moves to Tailwind
  v4.1+ CSS-first config and deprecates the `vars()`/`cssInterop` surface this stack relies
  on). NativeWind v4 is **actively maintained** (4.2.x patch line shipped through June 2026)
  and has long supported the New Architecture, so there is no *version-level* blocker — but
  there is **no official source confirming v4 runs cleanly on SDK 56 / RN 0.85 + New Arch +
  Hermes v1**; the only on-record official NativeWind↔Expo pairing is **SDK 54**, and the
  maintainer has stated releases are no longer pegged to specific SDKs. NativeWind's metro
  transform + `react-native-css-interop` are exactly the layer most exposed to a New-Arch /
  RN-0.85 break. Decide empirically: scaffold the app, run `expo start` web + native, confirm
  `className` utilities resolve and the dark toggle works under New Arch / Hermes v1. **If
  blocked on a known SDK-56 incompat, the safe-harbor fallback is Expo SDK 54, NOT 55** — SDK
  55 is *also* New-Architecture-only (no legacy-arch escape hatch) and is *not* the
  officially-NativeWind-validated SDK, so dropping to 55 may not fix a New-Arch/interop break;
  SDK 54 is the last officially NativeWind-validated SDK and the last with a legacy-arch
  option. Pin `nativewind` AND `react-native-css-interop` exact. Record the outcome in the
  commit + Open questions.
- **Hoisted linker + metro paths (Key ruling #6).** `pnpm-workspace.yaml` must keep
  `nodeLinker: hoisted` (pnpm 11's home for it; the old `.npmrc` `node-linker` key is
  silently ignored on pnpm 11); metro config MUST set `watchFolders=[workspaceRoot]` and
  `nodeModulesPaths=[project, workspace]`. **Never** set `disableHierarchicalLookups`.
  Symptom if wrong: metro can't resolve `@platform/ui` / hoisted deps.
- **Cross-package tailwind content globs.** Use
  `path.dirname(require.resolve("@platform/ui/package.json")) + "/src/**/*.{ts,tsx}"` — a
  hardcoded `../../../packages/ui/...` relative path breaks under hoisting and from the
  generated `demo` product. `packages/ui` has **no tailwind config of its own**; the app's
  config owns the content globs.
- **Pin `@rn-primitives/*` exact.** Pre-1.0; a caret bump can break owned components. Same
  discipline as `@hey-api/*` (Phase 4) and `nativewind`.
- **`react-native` → `react-native-web` alias is AUTO-HANDLED in Storybook Vite — do NOT
  add it manually.** `@storybook/react-native-web-vite` bundles `vite-plugin-rnw`, which
  performs the `react-native` → `react-native-web` aliasing automatically; the reference setup
  (`dannyhw/vite-rnw-example`) has no manual `react-native` alias. The *real* requirement for
  NativeWind utilities to render is the trio in `main.ts`/Vite (Storybook issue #32018):
  (1) `pluginReactOptions.jsxImportSource: "nativewind"` in the framework options,
  (2) `global.css` imported in `preview.tsx`, and (3) an actual Tailwind v3 PostCSS pipeline
  (`postcss` + `tailwindcss@^3.4` + `autoprefixer`). Only the `@` → `src` alias is added by
  hand (or rely on the framework's bundled `vite-tsconfig-paths`).
- **Figma REST Variables API is Enterprise-only.** `GET /v1/files/:key/variables/local`
  requires an Enterprise plan, so the pipeline **defaults to Tokens Studio JSON** (committed,
  tier-independent, CI-runnable, reviewable diff) and only uses REST when `source:"rest"`
  on Enterprise. This is why DoD #8 can pass with a committed fixture and no Figma file.
- **Generated `theme.ts` is not hand-editable.** `scripts/figma-tokens.mjs` owns it; edits
  go in Figma/the token source then `/sync-tokens`. A CI `git diff --exit-code` guard
  (like typegen) catches drift.
- **`web.output: "single"` is mandatory** (Key ruling #2) — desktop (Phase 5) depends on a
  SPA `dist/`; setting `static`/`server` here breaks the `app://` shell later.
- **Storybook port vs app port.** App is fixed at 8081; keep Storybook off 8081 (6006
  default) to allow both running at once.

---

## Verification

Run each; expected result maps to the DoD item in brackets.

```bash
# [1][3][4] types + tokens-only
pnpm --filter @platform/ui exec tsc --noEmit                 # no errors
git grep -nE '#[0-9a-fA-F]{3,6}|rgb\(' packages/ui/src/components   # NO output
git grep -n 'hsl(var(' packages/config/tailwind-preset.js    # mappings present

# [5][6] Storybook gallery + toolbars + build
pnpm --filter @platform/ui storybook
#   -> open :6006; UI/Button shows Default/Secondary/Destructive/Outline/Ghost/Small/Large;
#      Theme toolbar flips light<->dark live; Brand toolbar flips template<->demo (primary
#      color changes) live.
pnpm --filter @platform/ui build-storybook
test -f packages/ui/storybook-static/index.json && echo "VR index OK"

# [7] Code Connect maps present + parse
ls packages/ui/src/components/ui/*.figma.tsx                 # 4 files
pnpm dlx @figma/code-connect parse                           # parses (placeholder URLs OK)

# [8] token pipeline idempotent (co-generates theme.ts + global.css via Style Dictionary v5)
node scripts/figma-tokens.mjs
node scripts/figma-tokens.mjs && git diff --exit-code packages/ui/src/lib/theme.ts packages/ui/src/global.css

# [9] docs/commands present
ls packages/ui/FIGMA.md packages/ui/.claude/commands/        # FIGMA.md + 3 command files
test -f figma.config.json && echo "figma.config (Code Connect) OK"   # root, Code Connect CLI
test -f tokens.config.json && echo "tokens.config (token pipeline) OK"   # root, distinct schema

# [10] core exports
pnpm --filter @platform/core exec tsc --noEmit
node -e "require('@platform/core')" 2>/dev/null || echo "(TS source — checked via tsc)"

# [11] app shell on web at 8081 + dark toggle
pnpm --filter @platform/template-app exec expo start --port 8081
#   -> press w; localhost:8081 shows themed Card/Button/Input/Text; Settings tab "Toggle
#      dark mode" flips the whole UI light<->dark. Repeat on device via Expo Go (same look).

# [12] export web SPA + serve
turbo run export:web --filter=@platform/template-app
npx serve products/_template/app/dist                        # SPA loads, routing works

# [13] RNTL test
turbo run test --filter=@platform/ui                         # Button test green

# /add-component end-to-end (run the command):
#   /add-component badge  -> produces badge.tsx + badge.stories.tsx + badge.figma.tsx,
#   export in index.ts, and a committed VR baseline (light+dark).
```

**Phase-2 Verify (from PLAN.md) restated as a final gate:** dev server themed at
`localhost:8081` with working dark toggle; Storybook gallery with live light/dark + brand
switching; `node scripts/figma-tokens.mjs` regenerates `theme.ts`; `/add-component` yields
primitive + story + Code Connect + baseline; Expo Go on device matches; `turbo run
export:web` + `npx serve dist` works; `turbo run test` runs the RNTL test. NativeWind
v4↔SDK56 compat decision recorded (fallback target = SDK 54).

---

## Commits

Phase 2 = one feature branch, a few logical commits (PLAN.md: "Each phase = one commit (or
a few logical commits) on a feature branch"). Suggested grouping:

1. `feat(ui): scaffold @platform/ui + adopt react-native-reusables primitives (button/text/input/card) + cn()/theme` — steps (a)(b).
2. `feat(ui): Storybook react-native-web-vite workbench with theme/brand toolbars + per-variant stories` — step (c).
3. `feat(figma): Code Connect skeletons + figma-tokens.mjs pipeline + figma.config.json + FIGMA.md + design-system commands` — steps (d)(e)(f).
4. `feat(core): query client + cache persistence (AsyncStorage/localStorage) + env` — step (g).
5. `feat(template-app): app shell (tabs + settings theme toggle) + metro/babel/tailwind/global.css wiring` — step (h).
6. `test(ui): jest-expo + RNTL harness + first Button test` — step (i).

Do not `git add/commit/push` as part of generating this guide; commit during execution per
the repo's git conventions (branch off the default branch first).

---

## Open questions / deferred

- **⚠️ NativeWind v4 ↔ SDK 56 outcome — STRATEGY CONFIRMED (user decision 2026-06-15):
  target SDK 56, fall back to SDK 54 only if NativeWind v4 proves unworkable.** Still settled
  empirically during execution (this is the one item that can only be proven by building): if
  SDK 56 is unworkable with NativeWind v4, fall back to **SDK 54** (NOT 55 — 55 is also
  New-Arch-only and not the NativeWind-validated SDK; 54 is the last officially-validated SDK
  with a legacy-arch escape hatch) and record the pin. Do NOT downgrade preemptively — start
  on 56.
- **⚠️ Exact version pins** — freeze to what the CLI/`expo install` emit at execution time;
  PLAN.md names the packages, not the numbers. Current (June 2026) reference values resolved
  by the accuracy review: `nativewind 4.2.5` (+ pin `react-native-css-interop` exact),
  `@rn-primitives/* 1.4.0` (slot/types/portal), `class-variance-authority 0.7.1`, `clsx 2.1.1`,
  `tailwind-merge 2.6.x` (Tailwind-v3 line — do NOT use 3.x, which assumes Tailwind v4),
  `tailwindcss@^3.4` (NOT v4), Storybook + `@storybook/react-native-web-vite` `9.1.x`,
  `@tanstack/* 5.101.x`, `zustand 5.0.x`, `@react-native-async-storage/async-storage 3.1.x`,
  `style-dictionary 5.4.x`, `@figma/code-connect 1.4.8`, `@react-native-reusables/cli 0.7.1`,
  `jest-expo 56.0.4`, `@testing-library/react-native 14.x`.
- **✅ RESOLVED — Storybook dev port** — `6006` is Storybook's default and does not clash
  with Expo's fixed `8081`. Keep 6006. (Storybook docs.)
- **⚠️ Real Figma file key + mode IDs** — `figma.config.json` ships `TODO-*` placeholders;
  filled during `/bootstrap-design-system` against the real handed-over library. Until then
  the committed Tokens Studio fixture is the source (DoD #8).
- **✅ RESOLVED — `theme.ts` + global.css co-generation.** `figma-tokens.mjs` now
  co-generates **both** via Style Dictionary v5: the stock `css/variables` format writes the
  web `:root`/`.dark` blocks in `global.css` and a JS format writes the native `theme.ts`
  `vars()` objects, both from one resolved token tree (a custom `color/hsl-channels` transform
  emits the space-separated HSL channels the `hsl(var(--x))` preset needs). Matches PLAN.md's
  "both web and native derive from the same modes". (Style Dictionary docs / SD v5 migration.)
- **VR baseline tooling wiring** (`/add-component` step 6 + nightly `e2e-nightly.yml`) — the
  Playwright-over-`storybook-static/index.json` runner is defined in Testing strategy but
  fully wired into nightly CI in **Phase 8**; Phase 2 only needs the static build + local
  baseline capability. The VR sweep visits `iframe.html?id=<story>&globals=theme:<t>` (the
  `globals=key:value` URL form — a bare `theme=dark` query does NOT work). Since the locked
  workbench feature is the **brand switcher**, the matrix should sweep `brand` too
  (`globals=theme:dark,brand:demo`), not just `{light,dark}` — recommend baselining the `demo`
  brand mode as well (a product decision finalized with the Phase 8 wiring).
- **`packages/core` later modules** (`supabase.ts`, `auth.ts`, `realtime.ts`,
  `notifications.ts`, `storage.ts`, `api.ts`, `sentry.ts`) — deferred to Phases 6/8 per the
  phase table; intentionally NOT built here.
