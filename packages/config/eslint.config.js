// @the777incident/config — shared ESLint FLAT config (PHILOSOPHY "Quality": ESLint flat config + Prettier).
// Consumed by downstream workspaces: `export { default } from "@the777incident/config/eslint";`
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // Ignore generated + build artifacts everywhere.
  {
    ignores: [
      "**/dist/**",
      "**/.expo/**",
      "**/node_modules/**",
      "**/storybook-static/**",
      // Desktop shell build artifacts: compiled main/preload, copied SPA, packed output.
      "**/build/**",
      "**/renderer/**",
      "**/release/**",
      // Generated hey-api client is committed but never linted (PHILOSOPHY: never-edit-generated-client).
      "products/*/api-client/src/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Node-context files: repo scripts (bootstrap.mjs, new-product.mjs, …), CJS/ESM config
  // files (tailwind-preset.cjs, eslint.config.mjs), and tool configs that the ecosystem
  // requires as CommonJS .js (tailwind.config.js, metro.config.js, babel.config.js,
  // postcss.config.js). Gives them node+commonjs globals (console, module, require, …) and
  // allows require() — these files run in Node, not the app bundle.
  {
    files: ["**/*.{mjs,cjs}", "**/*.config.js", "scripts/**"],
    languageOptions: { globals: { ...globals.node, ...globals.commonjs } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off", // react-jsx runtime
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Must be LAST: turns off rules that conflict with Prettier formatting.
  prettier,
);
