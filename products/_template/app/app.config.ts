import type { ExpoConfig } from "expo/config";

const PROJECT_ID = "TODO-EAS-PROJECT-ID";

const config: ExpoConfig = {
  name: "template",
  slug: "template",
  scheme: "template",
  // Brand assets are generated from assets/brand/source.svg by gen-brand.mjs
  // (`pnpm brand:gen`). Keep this set and the script's size matrix in sync.
  icon: "./assets/brand/icon.png",
  web: { output: "single", bundler: "metro", favicon: "./assets/brand/favicon.png" },
  ios: { bundleIdentifier: "com.example.template" },
  android: {
    package: "com.example.template",
    adaptiveIcon: {
      foregroundImage: "./assets/brand/adaptive-icon.png",
      backgroundColor: "#6366F1",
    },
  },
  plugins: [
    [
      "expo-splash-screen",
      { image: "./assets/brand/splash.png", imageWidth: 200, backgroundColor: "#ffffff" },
    ],
  ],
  // EAS Update OTA: projectId ALONE will NOT deliver OTA — `updates.url` +
  // `runtimeVersion` are the contract between a published JS bundle and the installed
  // native binary. `eas update:configure` writes/maintains both.
  updates: { url: `https://u.expo.dev/${PROJECT_ID}` },
  runtimeVersion: { policy: "appVersion" },
  extra: { eas: { projectId: PROJECT_ID } },
};
export default config;
