# Contracts: Tauri Shell (React + Vite)

**Feature**: 001-tauri-shell · **Date**: 2026-05-27

Feature 001 has **no application API / IPC contract** — the frontend renders static content and invokes no Tauri commands. The contracts that *do* exist for this feature are the **developer-facing command contract** and the **window lifecycle contract**. Both are verifiable.

> When the frontend first invokes a Tauri command (an IPC boundary), *that* feature will add an IPC contract here. Not yet.

## Command contract (npm scripts)

| Command | Precondition | Expected behavior | Maps to |
|---|---|---|---|
| `npm install` | Node + npm present | Installs frontend deps; exits 0 | quickstart step |
| `npm run tauri dev` | Prereqs installed (R2); deps installed | Starts Vite, compiles the Rust shell, opens **one** native window rendering the React app; HMR active | FR-001, FR-002, FR-003, US1 |
| `npm run tauri build` | Prereqs installed | Typechecks, builds the frontend, compiles a release shell binary; exits 0 | smoke-level only — packaging/signing is out of scope |
| `npm run dev` | Node present | Starts Vite alone (browser, no shell) | dev convenience |
| `npm run test` | Deps installed | Runs Vitest; the App smoke test passes | FR-002 verification |

**Contract assertions:**
- `npm run tauri dev` MUST open exactly one window (not zero, not multiple).
- The window MUST display the placeholder content (a known string the smoke test also asserts), confirming React rendered (FR-002).
- A save to `src/App.tsx` while `tauri dev` runs MUST update the window without a manual shell restart (FR-003).
- Missing prerequisites MUST produce a clear error naming what's missing, not a hang or opaque trace (FR-007).

## Window lifecycle contract

| Event | Expected behavior | Maps to |
|---|---|---|
| Launch | Single window, default size, app title set (e.g. "CIC") | FR-001 |
| Close (window X / OS close) | Window closes **and** every process started by `tauri dev` (Vite dev server, webview host, Rust shell) terminates; **zero orphaned processes** | FR-004, US2, SC-004 |

**Verification of clean exit (SC-004):** after closing the window, a process listing shows no surviving `node`/`vite`, `cic`/Tauri shell, or `WebView2` host process attributable to the app. (Manual check in the walkthrough; not automated in 001.)

## FR → acceptance-scenario coverage

| FR | Covered by acceptance scenario(s) | Success criterion |
|---|---|---|
| FR-001 (window opens) | US1 AS-1 | SC-001, SC-002 |
| FR-002 (renders frontend, visible proof) | US1 AS-1 + App smoke test | — |
| FR-003 (HMR) | US1 AS-2 | SC-003 |
| FR-004 (clean exit) | US2 AS-1 | SC-004 |
| FR-005 (src/ + src-tauri/ layout) | structural — verified by repo tree | — |
| FR-006 (single entry point) | command contract above | SC-005 |
| FR-007 (clear prereq errors) | edge cases | — |
