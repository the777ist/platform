const path = require("node:path");

/** @type {import('tailwindcss').Config} */
module.exports = {
  // nativewind/preset is MANDATORY for NativeWind v4's metro step (withNativeWind errors
  // without it); the @the777incident/config preset layers the semantic-token mappings on top.
  presets: [require("nativewind/preset"), require("@the777incident/config/tailwind-preset")],
  content: [
    "./app/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    // Cross-package content glob via require.resolve — a hardcoded relative path breaks
    // under hoisting and from generated products (Phase 2 gotcha).
    path.dirname(require.resolve("@the777incident/ui/package.json")) + "/src/**/*.{ts,tsx}",
  ],
};
