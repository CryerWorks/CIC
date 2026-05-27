import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  { ignores: ["dist", "src-tauri/**", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Our <Message role="user|ai"> is a component prop, not an ARIA attribute. ignoreNonDOM
      // skips custom components while still validating role= on real DOM elements (e.g. Segmented).
      "jsx-a11y/aria-role": ["error", { ignoreNonDOM: true }],
      // Constitution II/IV: vendor AI SDKs may be imported ONLY inside src/ai/adapters/*.
      // Dormant today (no src/ai yet), wired now so the quality gate is real going forward.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "openai", message: "Vendor AI SDKs may only be imported inside src/ai/adapters/*." },
            { name: "@anthropic-ai/sdk", message: "Vendor AI SDKs may only be imported inside src/ai/adapters/*." },
          ],
        },
      ],
    },
  },
  // The adapters layer is the one place vendor SDKs are allowed.
  {
    files: ["src/ai/adapters/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
);
