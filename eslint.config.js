// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  {
    // Nothing in these paths is hand-written; don't waste lint time on it.
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/*.tsbuildinfo",
      "**/node_modules/**",
      "**/.generated/**",
      "**/src/generated/**", // orval output — lib/api-zod, lib/api-client-react
      "pnpm-lock.yaml",
      "artifacts/mockup-sandbox/**", // design sandbox, not production code
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Workspace-wide TypeScript rules
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // React-specific rules for the frontend
  {
    files: ["artifacts/govcore/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  // Tests: relax a couple of rules that fight test-authoring style
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
);
