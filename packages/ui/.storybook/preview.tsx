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
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    const overrides = BRAND_VARS[brand] ?? {};
    Object.entries(overrides).forEach(([k, v]) => root.style.setProperty(k, v));
    return () =>
      Object.keys(overrides).forEach((k) => root.style.removeProperty(k));
  }, [theme, brand]);

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
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
