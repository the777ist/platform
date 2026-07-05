// WORKBENCH-ONLY tailwind config (Storybook's PostCSS step needs content globs to emit
// utilities). Product apps own their own tailwind.config.js with cross-package globs —
// this file is never consumed by an app build (see docs/phase-2 gotchas).
module.exports = {
  presets: [require("nativewind/preset"), require("@platform/config/tailwind-preset")],
  content: ["./src/**/*.{ts,tsx}", "./.storybook/**/*.{ts,tsx}"],
};
