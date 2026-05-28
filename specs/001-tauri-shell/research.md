# Research: Tauri Shell (React + Vite)

**Feature**: 001-tauri-shell · **Date**: 2026-05-27

All decisions below resolve the Technical Context. No `NEEDS CLARIFICATION` remain.

---

## R1 — Tauri major version

**Decision**: Tauri **2.x**.

**Rationale**: The PRD/Constitution lock `tauri-plugin-sql`, `tauri-plugin-fs`, and `tauri-plugin-notification` — these are the Tauri 2 plugin ecosystem (Tauri 1 used a different, built-in allowlist model). Tauri 2 also brings the capability-based permission system we'll need for the vault-access lockdown later. Starting on 2.x avoids a forced 1→2 migration mid-project.

**Alternatives considered**: Tauri 1.x — rejected: EOL trajectory, incompatible plugin model, would force migration before Phase 1.

---

## R2 — Windows 11 prerequisites (operator machine)

**Decision**: Require, on the dev machine:
1. **Microsoft C++ Build Tools** — install via the Visual Studio Installer, "Desktop development with C++" workload (provides the MSVC linker Rust needs).
2. **Rust** (stable) via `rustup`, with the **MSVC** toolchain as the default host triple (`x86_64-pc-windows-msvc`).
3. **Node.js** LTS (already installed — used by graphify/spec-kit).
4. **WebView2** — **no action needed**: pre-installed on Windows 11.

**Rationale**: Confirmed against the Tauri 2 prerequisites doc (v2.tauri.app/start/prerequisites). WebView2 ships with Windows 11, so the only net-new installs versus the current machine are the C++ Build Tools and the Rust MSVC toolchain. These are documented in [quickstart.md](quickstart.md) as one-time prerequisites, not work this feature performs.

**Alternatives considered**: GNU Rust toolchain — rejected: Tauri docs explicitly recommend MSVC on Windows; GNU is a support headache.

**Edge cases mapped to FR-007**: missing C++ tools → `cargo`/Tauri build fails with a linker error; missing Rust → `tauri` CLI can't build the shell. Quickstart documents the prereqs so these surface as "install X", not mystery failures.

---

## R3 — Scaffolding approach into a non-empty repo

**Decision**: Scaffold with `npm create tauri-app@latest` (template: **React + TypeScript**, manager: **npm**) into a **temporary sibling directory**, then move the generated app files (`src/`, `src-tauri/`, `index.html`, `package.json`, `vite.config.ts`, `tsconfig*.json`) into the repo root and reconcile. Delete the temp dir.

**Rationale**: `create-tauri-app` produces a known-good, version-matched config (correct `tauri.conf.json` ↔ Vite port wiring, capabilities, `Cargo.toml`, build scripts) — far less error-prone than hand-authoring. But it expects to own its target directory, and our repo already contains docs + `.specify/` + `.claude/`. Scaffolding into a temp dir then moving avoids any risk of `create-tauri-app` refusing or clobbering. Our root has **no** conflicting files (no existing `src/`, `package.json`, etc.), so the move is clean.

**Alternatives considered**:
- *Hand-author every file* — rejected: subtle misconfigurations (dev-server port mismatch, missing capabilities, wrong `beforeDevCommand`) cost more than the move-from-temp step.
- *`create-tauri-app` in-place with `.`* — riskier: behavior in a non-empty dir is version-dependent and could touch unexpected files. The temp-dir route is deterministic.

**Implementation note for /speckit-tasks**: the move must preserve our existing root docs untouched, and the resulting `package.json` should declare the project name `cic` (or similar) and the scripts in R5.

---

## R4 — Vite ↔ Tauri dev-server handshake

**Decision**: Use the port `create-tauri-app` configures for its React template (conventionally **1420**), with `tauri.conf.json`'s `build.devUrl` pointing at `http://localhost:1420` and `vite.config.ts` set to the same fixed `server.port` with `strictPort: true`.

**Rationale**: Tauri's webview loads `devUrl` in dev mode; if Vite and Tauri disagree on the port, the window opens on a dead address (the spec's "dev server port in use" edge case). `strictPort: true` makes Vite **fail loudly** rather than silently picking a different port and desyncing from `devUrl` — turning a confusing blank window into an explicit error (satisfies FR-007 + the edge case). `create-tauri-app` wires this correctly out of the box; we keep its values rather than inventing our own.

**Alternatives considered**: vanilla Vite default `5173` — fine, but no reason to deviate from what the scaffold sets; consistency with the generated `tauri.conf.json` matters more than the specific number.

---

## R5 — npm scripts (single discoverable entry point — FR-006)

**Decision**: `package.json` scripts:
- `"dev": "vite"` — frontend only (browser, no shell) — useful for pure-UI work later.
- `"build": "tsc && vite build"` — typecheck + frontend production build.
- `"tauri": "tauri"` — passthrough to the Tauri CLI, so `npm run tauri dev` and `npm run tauri build` work.
- `"test": "vitest"` — the smoke test.

`tauri.conf.json` sets `build.beforeDevCommand: "npm run dev"` and `build.beforeBuildCommand: "npm run build"` so `npm run tauri dev` starts Vite then opens the window.

**Rationale**: Matches the command in the feature description (`npm run tauri dev`) and the CLAUDE.md "Commands" section. One discoverable entry point per FR-006; `create-tauri-app` generates exactly this shape.

---

## R6 — TypeScript strict + Vitest

**Decision**: `tsconfig.json` with `"strict": true` (+ `noUnusedLocals`, `noUnusedParameters`). Add Vitest with a `jsdom` environment and `@testing-library/react` for one smoke test (`App.test.tsx`) asserting the placeholder text renders.

**Rationale**: Constitution §Technology Constraints mandates TypeScript strict. The smoke test is the minimum that makes "the window renders the app" mechanically verifiable in CI later, and exercises the Vitest setup the rest of the project will lean on (FSRS, vault, etc. per the constitution quality gates). Keeping it to **one** test honors the smallest-scope goal while proving the harness works.

**Alternatives considered**: no tests in 001 — rejected: even a trivial feature should leave a working test harness so Feature 002 doesn't have to set Vitest up under time pressure. One smoke test is the floor, not padding.

---

## Open questions

None. All Technical Context items resolved. Cross-platform (macOS/Linux), packaging/signing, and the Tailwind theme are explicitly out of scope (spec §Out of Scope) and deferred to later features.
