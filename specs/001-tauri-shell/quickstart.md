# Quickstart: Tauri Shell (React + Vite)

**Feature**: 001-tauri-shell · **Date**: 2026-05-27

Goal: from a fresh clone to a running CIC desktop window. Validates **SC-001** (clone → window in < 5 min) and **SC-005** (a new contributor can run it without asking).

## Prerequisites (one-time, Windows 11)

| Tool | Why | Install |
|---|---|---|
| **Node.js** (LTS) | Frontend tooling (Vite, npm) | https://nodejs.org — verify `node -v` |
| **Rust** (stable, MSVC) | Compiles the Tauri shell | https://rustup.rs — accept the default `x86_64-pc-windows-msvc` host triple; verify `cargo --version` |
| **Microsoft C++ Build Tools** | MSVC linker Rust needs | Visual Studio Installer → "Desktop development with C++" workload |
| **WebView2** | Renders the webview | ✅ Pre-installed on Windows 11 — nothing to do |

> If `npm run tauri dev` fails with a linker error, the C++ Build Tools are missing. If it fails before compiling the shell, Rust/cargo is missing. (FR-007 — the failures name what's absent.)

## Run it

```powershell
# from the repo root, on branch 001-tauri-shell
npm install            # installs frontend deps (first run only)
npm run tauri dev      # compiles the shell + starts Vite + opens the window
```

A native window titled **CIC** opens and displays the placeholder content (a "hello"-style marker confirming React rendered).

## Verify the feature

| Check | Expected | Criterion |
|---|---|---|
| Window opens | One native window, placeholder visible | FR-001/002, SC-002 |
| Hot reload | Edit `src/App.tsx`, save → window updates in a few seconds, no restart | FR-003, SC-003 |
| Clean exit | Close the window → no orphaned `node`/Vite/shell/WebView2 processes remain | FR-004, SC-004 |
| Tests | `npm run test` → the App smoke test passes | FR-002 |

## What you will NOT see yet (by design)

No theme/colors from the Obsidian design language, no sidebar/topbar, no routing, no data, no AI. Those are Features 002+. Feature 001 is the bare window that proves the stack runs.

## Troubleshooting

- **Blank window / "failed to connect"**: Vite and Tauri disagree on the dev-server port. `vite.config.ts` `server.port` must equal the port in `src-tauri/tauri.conf.json` `build.devUrl`; `strictPort: true` should make Vite fail loudly instead. (R4)
- **Window opens then immediately closes**: check the Rust shell logs in the terminal running `tauri dev`.
- **`tauri` command not found**: run `npm install` first — `@tauri-apps/cli` is a dev dependency exposed via the `"tauri"` npm script.
