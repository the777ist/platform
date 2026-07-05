import type { StorybookConfig } from "@storybook/react-native-web-vite";

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
  // react-native -> react-native-web aliasing is handled by the framework's bundled
  // vite-plugin-rnw — do NOT add a manual alias. Package-internal imports are RELATIVE
  // (a source-consumed package cannot use an @/ alias — downstream app tsc/metro would
  // not resolve it), so no path alias is needed here either.
  // The Tailwind v3 pipeline on global.css runs via PostCSS — postcss.config.js
  // (tailwindcss + autoprefixer) is picked up automatically by Vite; global.css is
  // imported in preview.tsx so NativeWind utilities resolve.
};
export default config;
