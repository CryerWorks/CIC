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
      // Feature 003: the SQLite native bridge (@tauri-apps/plugin-sql) is confined the same
      // way — it may be imported ONLY inside src/db/adapters/* (the production SqlExecutor
      // adapter), so the rest of the data layer depends on the seam, never the plugin.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "openai", message: "Vendor AI SDKs may only be imported inside src/ai/adapters/*." },
            { name: "@anthropic-ai/sdk", message: "Vendor AI SDKs may only be imported inside src/ai/adapters/*." },
            { name: "@tauri-apps/plugin-sql", message: "The SQL plugin may only be imported inside src/db/adapters/* — depend on the SqlExecutor seam instead." },
          ],
        },
      ],
    },
  },
  // The adapters layers are the one place their respective bridges may be imported.
  {
    files: ["src/ai/adapters/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["src/db/adapters/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
);
