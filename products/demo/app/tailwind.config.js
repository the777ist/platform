const path = require("node:path");

/** @type {import('tailwindcss').Config} */
module.exports = {
  // nativewind/preset is MANDATORY for NativeWind v4's metro step (withNativeWind errors
  // without it); the @platform/config preset layers the semantic-token mappings on top.
  presets: [require("nativewind/preset"), require("@platform/config/tailwind-preset")],
  content: [
    "./app/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    // Cross-package content glob via require.resolve — a hardcoded relative path breaks
    // under hoisting and from generated products (Phase 2 gotcha).
    path.dirname(require.resolve("@platform/ui/package.json")) + "/src/**/*.{ts,tsx}",
  ],
};
