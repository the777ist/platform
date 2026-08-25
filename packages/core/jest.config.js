/** @type {import('jest').Config} */
module.exports = {
  // Single Jest runner for ALL JS tests (PHILOSOPHY Quality): jest-expo preset.
  preset: "jest-expo",
  // env.ts THROWS at module load when EXPO_PUBLIC_* are missing, and api.ts imports it
  // transitively — so the vars must exist BEFORE any module is evaluated. `setupFiles`
  // runs before the test file is imported; `setupFilesAfterEach` would be too late.
  setupFiles: ["<rootDir>/jest.setup.ts"],
  // Same hand-maintained ESM allowlist as packages/ui — re-verify when a new ESM dep
  // lands ("Cannot use import statement outside a module").
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@rn-primitives/.*|nativewind|react-native-css-interop|class-variance-authority|@platform/.*))",
  ],
};
