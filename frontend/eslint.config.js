import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // CommonJS config files at the package root (e.g. release.config.cjs).
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  {
    // Build / tooling configs that run on Node.
    files: ["*.config.{ts,js,mjs}", "*.config.*.{ts,js,mjs}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Production application source — browser globals only.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}", "src/vitest.setup.ts"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
    settings: { react: { version: "19.0" } },
  },
  {
    // Tests and Vitest setup — need Node globals (process, __dirname in some
    // setups, node: imports) plus browser for RTL rendering.
    files: ["src/**/*.test.{ts,tsx}", "src/vitest.setup.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
    settings: { react: { version: "19.0" } },
  },
];
