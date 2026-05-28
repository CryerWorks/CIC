// Self-hosted fonts — fully-local guardrail (Constitution II / FR-003).
// Fontsource variable packages ship the .woff2 files inside node_modules; Vite
// bundles them into dist/assets, so the app fetches fonts from disk, never a CDN.
// Families: "Inter Variable" / "JetBrains Mono Variable" (match --font-ui / --font-mono).
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
