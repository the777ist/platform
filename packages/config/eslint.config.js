// @platform/config — shared ESLint FLAT config (PHILOSOPHY "Quality": ESLint flat config + Prettier).
// Consumed by downstream workspaces: `export { default } from "@platform/config/eslint";`
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
      // Generated hey-api client is committed but never linted (PHILOSOPHY: never-edit-generated-client).
      "products/*/api-client/src/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Node-context files: repo scripts (bootstrap.mjs, new-product.mjs, …) and CJS/ESM config
  // files (tailwind-preset.cjs, eslint.config.mjs). Gives them node globals (console, module,
  // process, …) so js.configs.recommended's no-undef doesn't flag runtime built-ins.
  {
    files: ["**/*.{mjs,cjs}", "scripts/**"],
    languageOptions: { globals: { ...globals.node } },
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
