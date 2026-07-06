/** @type {import('jest').Config} */
module.exports = {
  // Single Jest runner for ALL JS tests (PHILOSOPHY Quality): jest-expo preset,
  // resolved from the hoisted workspace root.
  preset: "jest-expo",
  // Playwright owns e2e/ (run via `pnpm exec playwright test`) — Jest's default
  // testMatch would otherwise try to execute the Playwright specs and fail.
  testPathIgnorePatterns: ["/node_modules/", "/e2e/", "/dist/", "/.maestro/"],
};
