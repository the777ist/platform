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
