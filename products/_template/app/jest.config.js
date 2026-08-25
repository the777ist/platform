/** @type {import('jest').Config} */
module.exports = {
  // Single Jest runner for ALL JS tests (PHILOSOPHY Quality): jest-expo preset,
  // resolved from the hoisted workspace root.
  preset: "jest-expo",
  // Playwright owns e2e/ (run via `pnpm exec playwright test`) — Jest's default
  // testMatch would otherwise try to execute the Playwright specs and fail.
  testPathIgnorePatterns: ["/node_modules/", "/e2e/", "/dist/", "/.maestro/"],
  // RNTL v14 registers its matchers on import (toBeOnTheScreen and friends).
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Hand-maintained ESM allowlist, mirroring packages/ui. Without it the FIRST test that
  // imports @platform/ui dies on "Cannot use import statement outside a module" -- the app
  // template shipped a jest config that could not actually run an app test.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@rn-primitives/.*|nativewind|react-native-css-interop|class-variance-authority|@platform/.*))",
  ],
};
