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
      // Feature 016 (AI Provider Layer) USES this directory for the three adapter classes
      // (Ollama / OpenAI-compatible / Anthropic) + the Tauri keychain SecretStore impl.
      // The `ai_keychain_*` Tauri commands (registered in src-tauri/src/lib.rs by 016) are
      // by convention invoked ONLY from src/ai/adapters/secrets/tauri.ts; ESLint can't
      // statically lint `invoke('command-name', …)` precisely, so the boundary is enforced
      // by a runtime test (T073a in src/ai/boundary.test.ts) + code review.
      // Feature 003: the SQLite native bridge (@tauri-apps/plugin-sql) is confined the same
      // way — it may be imported ONLY inside src/db/adapters/* (the production SqlExecutor
      // adapter), so the rest of the data layer depends on the seam, never the plugin.
      // Feature 005: the vault filesystem bridge (@tauri-apps/plugin-fs) is confined the same
      // way — ONLY inside src/vault/adapters/* (the production VaultFs adapter), so the rest
      // of the vault layer depends on the VaultFs seam, never the plugin (Constitution I/IV).
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "openai", message: "Vendor AI SDKs may only be imported inside src/ai/adapters/*." },
            { name: "@anthropic-ai/sdk", message: "Vendor AI SDKs may only be imported inside src/ai/adapters/*." },
            { name: "@tauri-apps/plugin-sql", message: "The SQL plugin may only be imported inside src/db/adapters/* — depend on the SqlExecutor seam instead." },
            { name: "@tauri-apps/plugin-fs", message: "The fs plugin may only be imported inside src/vault/adapters/* — depend on the VaultFs seam instead." },
            // Feature 016 (CORS fix): the native HTTP plugin is confined to the AI adapters layer —
            // ONLY src/ai/adapters/* (the tauriFetch seam) may import it; everything else depends on
            // the injected `fetchFn` seam (Constitution II/IV).
            { name: "@tauri-apps/plugin-http", message: "The HTTP plugin may only be imported inside src/ai/adapters/* (the tauriFetch seam) — depend on the injected fetchFn instead." },
            // Feature 014: the notification bridge is confined the same way — ONLY inside
            // src/notifications/adapters/* (the production Notifier adapter), so the scheduler +
            // settings UI depend on the Notifier seam, never the plugin (Constitution IV).
            { name: "@tauri-apps/plugin-notification", message: "The notification plugin may only be imported inside src/notifications/adapters/* — depend on the Notifier seam instead." },
            // Feature 010: the FSRS scheduling library is confined to the Scheduler seam — it
            // may be imported ONLY inside src/features/srs/fsrs/scheduler.ts, so the rest of the
            // app depends on the `Scheduler` interface, never `ts-fsrs` types (Constitution IV).
            { name: "ts-fsrs", message: "ts-fsrs may only be imported inside src/features/srs/fsrs/scheduler.ts — depend on the Scheduler seam instead." },
            // Feature 017: sqlite-vec is the vector database engine — it may only be imported
            // inside src/ai/adapters/rag/* (the Node.js test adapter); the rest of the app
            // depends on the VectorStore seam (Constitution IV / R1).
            { name: "sqlite-vec", message: "sqlite-vec may only be imported inside src/ai/adapters/rag/* — depend on the VectorStore seam instead." },
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
  {
    files: ["src/vault/adapters/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
  // The Notifier adapter is the one place @tauri-apps/plugin-notification may be imported (Feature 014).
  {
    files: ["src/notifications/adapters/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
  // The FSRS engine seam is the one place ts-fsrs may be imported (Feature 010, Constitution IV).
  {
    files: ["src/features/srs/fsrs/scheduler.ts"],
    rules: { "no-restricted-imports": "off" },
  },
);
