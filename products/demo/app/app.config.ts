import type { ExpoConfig } from "expo/config";

const PROJECT_ID = "TODO-EAS-PROJECT-ID";

const config: ExpoConfig = {
  name: "demo",
  slug: "demo",
  scheme: "demo",
  // Brand assets are generated from assets/brand/source.svg by gen-brand.mjs
  // (`pnpm brand:gen`). Keep this set and the script's size matrix in sync.
  icon: "./assets/brand/icon.png",
  web: { output: "single", bundler: "metro", favicon: "./assets/brand/favicon.png" },
  ios: { bundleIdentifier: "com.the777incident.demo" },
  android: {
    package: "com.the777incident.demo",
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
    [
      // Build-time half of Sentry (runtime init lives in @the777incident/core sentry.ts):
      // source-map upload + native symbolication. SENTRY_AUTH_TOKEN is a BUILD env
      // var (EAS secret) — never committed.
      "@sentry/react-native/expo",
      {
        organization: "the777incident", // the org (Sentry org created on infra day)
        project: "the777incident-demo", // Sentry project slug (created on infra day)
      },
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
