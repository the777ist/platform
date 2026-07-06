/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Playwright owns the VR spec in .storybook/ (run via `pnpm exec playwright test`) —
  // Jest's default testMatch would otherwise try to execute it and fail.
  testPathIgnorePatterns: ["/node_modules/", "/.storybook/", "/storybook-static/"],
  // Hand-maintained ESM allowlist (see phase-2 guide gotcha): jest-expo's own pattern plus
  // the packages this stack adds (@rn-primitives, nativewind, css-interop, cva, @platform).
  // Re-verify when a new ESM dep lands ("Cannot use import statement outside a module").
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@rn-primitives/.*|nativewind|react-native-css-interop|class-variance-authority|@platform/.*))",
  ],
};
