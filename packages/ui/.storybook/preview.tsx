/// <reference types="vite/client" />
import * as React from "react";
import { View } from "react-native";
import { vars } from "nativewind";
import type { Preview, Decorator } from "@storybook/react-native-web-vite";
import "../src/global.css";
import { ThemeProvider } from "../src/theme-provider";

// The brand LIST is enumerated from the tree — every products/<name>/app is a brand, leading
// underscore stripped (`_template` ships as "template"). Stamping or removing a product updates
// the toolbar with no edit here; a hardcoded roster made every /remove-product a manual chore.
// import.meta.glob is resolved at BUILD time by vite, so this costs nothing at runtime.
const BRANDS = Object.keys(import.meta.glob("../../../products/*/app/global.css"))
  .map((p) => p.split("/products/")[1]!.split("/")[0]!.replace(/^_/, ""))
  .sort((a, b) => (a === "template" ? -1 : b === "template" ? 1 : a.localeCompare(b)));

// Brand override VALUES stay hand-authored — in steady state they mirror Figma brand modes
// (Key ruling #11); a brand with no entry here previews on the default token values, which is
// exactly what a freshly stamped product's global.css resolves to anyway.
const BRAND_VARS: Record<string, Record<string, string>> = {
  template: {},
  demo: {
    "--primary": "262 83% 58%",
    "--primary-foreground": "0 0% 100%",
    "--ring": "262 83% 58%",
  },
};

// Proper component (uppercase, hook-legal) — the decorator itself must not call hooks
// (react-hooks/rules-of-hooks).
function ThemeGlobals({
  theme,
  brand,
  children,
}: {
  theme: "light" | "dark";
  brand: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    // Keep the DOM in sync for any plain-CSS consumers (and devtools inspection)…
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    const effectOverrides = BRAND_VARS[brand] ?? {};
    Object.entries(effectOverrides).forEach(([k, v]) => root.style.setProperty(k, v));
    return () => Object.keys(effectOverrides).forEach((k) => root.style.removeProperty(k));
  }, [theme, brand]);

  const overrides = BRAND_VARS[brand] ?? {};

  // …but the override that actually re-themes components is the NativeWind vars()
  // OVERLAY: css-interop resolves semantic tokens through its own vars() context, NOT
  // the CSS cascade — root.style.setProperty alone never reaches component styles.
  // This mirrors exactly how a product overrides token VALUES (Key ruling #8/#11).
  return (
    <ThemeProvider theme={theme}>
      <View style={vars(overrides)} className="flex-1">
        {children}
      </View>
    </ThemeProvider>
  );
}

const withTheme: Decorator = (Story, ctx) => (
  <ThemeGlobals
    theme={(ctx.globals.theme as "light" | "dark") ?? "light"}
    brand={(ctx.globals.brand as string) ?? "template"}
  >
    <Story />
  </ThemeGlobals>
);

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
        items: BRANDS.map((b) => ({ value: b, title: b })),
        dynamicTitle: true,
      },
    },
  },
};
export default preview;
