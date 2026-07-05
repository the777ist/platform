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
    // The Tailwind v3 pipeline on global.css runs via PostCSS — postcss.config.js
    // (tailwindcss + autoprefixer) is picked up automatically by Vite; global.css is
    // imported in preview.tsx so NativeWind utilities resolve.
    return cfg;
  },
};
export default config;
