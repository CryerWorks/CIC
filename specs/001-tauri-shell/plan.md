# Implementation Plan: Tauri Shell (React + Vite)

**Branch**: `001-tauri-shell` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-tauri-shell/spec.md`

## Summary

Stand up the smallest viable CIC desktop shell: a Tauri 2 application whose webview renders a React + TypeScript app served by Vite. `npm run tauri dev` opens a native window showing placeholder content, supports hot reload, and exits cleanly. No theme, persistence, chrome, routing, or AI — those are later features. This feature validates (a) the locked tech stack runs on the operator's Windows 11 machine and (b) the spec-kit Specify→Plan→Tasks→Implement loop on low-risk work.

## Technical Context

**Language/Version**: TypeScript 5.x (frontend) · Rust stable, MSVC toolchain (Tauri shell — generated, not hand-written in this feature)

**Primary Dependencies**: Tauri 2.x (`@tauri-apps/cli`, `@tauri-apps/api`) · React 18+ · Vite 5+ · `@vitejs/plugin-react`

**Storage**: N/A — no persistence in this feature (SQLite arrives in Feature 003)

**Testing**: Vitest — one smoke test asserting the placeholder App component renders. (The deeper data-integrity test surfaces in the constitution's quality gates don't apply yet — nothing of that nature exists in 001.)

**Target Platform**: Windows 11 desktop (WebView2 runtime, pre-installed). macOS/Linux explicitly deferred (PRD §13 risk 8).

**Project Type**: Desktop application (Tauri shell + web frontend).

**Performance Goals**: Native window appears within 10 s on a warm run (SC-002); frontend edit reflected via HMR within 3 s (SC-003).

**Constraints**: Fully local, offline-capable (no network calls in this feature — consistent with Constitution Principle I/II, though neither is exercised yet). Clean process lifecycle: zero orphaned processes on window close (SC-004).

**Scale/Scope**: One window, one placeholder screen. Foundation only — ~10 generated config/source files, no business logic.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies to 001? | Status | Notes |
|---|---|---|---|
| **I. Vault is Canonical and Sacred** | No vault access in 001 | ✅ PASS (vacuous) | No `.md` writes, no `VaultWriter` yet. Feature must not introduce any ad-hoc filesystem writes to a vault path (there is no vault path yet). |
| **II. AI is Vendor-Agnostic Tutor** | No AI in 001 | ✅ PASS (vacuous) | No `Provider`, no adapters, no network. Must not add any vendor SDK dependency. |
| **III. Preserve Desirable Difficulty** | No learning features in 001 | ✅ PASS (vacuous) | Nothing that could smooth away a learning mechanism exists yet. |
| **IV. Interface-First, Deep Modules (Pocock)** | Sets the skeleton the spine will live in | ✅ PASS | The `src/` vs `src-tauri/` split is established now. Deeper spine dirs (`src/ai/`, `src/vault/`, `src/types/`) are **not** created until a feature needs them — creating empty placeholder dirs would be organizational-only structure, which the pattern discourages. Documented in Structure Decision. |
| **V. Spec-Driven Development** | Yes | ✅ PASS | This feature is being built through the spec-kit loop; full Phase 1 doc set authored; git owned by the user; end-of-feature walkthrough committed to. |

**Technology constraints** (Constitution §Technology Constraints): Tauri ✅, React + TS + Vite ✅, Vitest ✅, TypeScript strict ✅ (to be enforced in `tsconfig`). No deviations.

**Gate result: PASS.** No violations; Complexity Tracking section omitted (nothing to justify).

## Project Structure

### Documentation (this feature)

```text
specs/001-tauri-shell/
├── spec.md              # Feature spec (/speckit-specify output)
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — scaffolding + Windows prereq decisions
├── data-model.md        # Phase 1 — N/A for this feature (documented, not padded)
├── quickstart.md        # Phase 1 — clone → prereqs → run → window
├── contracts/
│   └── dev-commands.md  # Phase 1 — the npm-script + lifecycle contract; FR→acceptance map
└── checklists/
    └── requirements.md  # Spec quality checklist (already green)
```

### Source Code (repository root)

The repo currently holds only docs (`PRD-CIC-Platform.md`, `CLAUDE.md`, `ai-provider-layer.md`, `CIC-Design-Language-Obsidian.html`, `docs/`) plus tooling (`.specify/`, `.claude/`, `graphify-out/`). This feature adds the app scaffold at the repo root:

```text
/                          # repo root
├── index.html             # Vite HTML entry
├── package.json           # deps + scripts: "tauri", "dev", "build", "test"
├── vite.config.ts         # React plugin; dev server port aligned with tauri.conf.json
├── tsconfig.json          # TypeScript strict
├── tsconfig.node.json
├── src/                   # React + TS frontend (Vite root)
│   ├── main.tsx           # React entry (createRoot)
│   ├── App.tsx            # placeholder "hello" component — the rendering proof
│   └── App.test.tsx       # Vitest smoke test (App renders placeholder text)
├── src-tauri/             # Tauri 2 Rust shell (generated)
│   ├── src/
│   │   ├── main.rs        # binary entry → calls lib run()
│   │   └── lib.rs         # tauri::Builder setup
│   ├── Cargo.toml
│   ├── tauri.conf.json    # window config + build.devUrl → Vite dev server
│   ├── build.rs
│   └── capabilities/      # Tauri 2 capability allowlist (default-minimal)
└── vitest.config.ts       # (or merged into vite.config.ts) — jsdom env for the smoke test
```

**Structure Decision**: Single-project desktop app — frontend at the repo root `src/` (Vite convention), native shell isolated in `src-tauri/`. This matches the CLAUDE.md target structure (`src/` for the React app, `src-tauri/` for the Rust shell). Deeper feature/spine subdirectories (`src/app/`, `src/components/`, `src/features/`, `src/vault/`, `src/db/`, `src/ai/`, `src/lib/`, `src/types/`) are **deliberately not created in this feature** — per Pocock Principle IV, we don't scaffold organizational-only empty directories; each arrives when its first real module does. Feature 001 creates only what a rendering window requires.

## Phase 0 — Research

See [research.md](research.md). Resolved: Tauri 2 scaffolding approach into a non-empty repo, Windows 11 prerequisites, Vite↔Tauri dev-server port handshake, npm script wiring, TypeScript-strict + Vitest setup. No unresolved `NEEDS CLARIFICATION`.

## Phase 1 — Design & Contracts

- [data-model.md](data-model.md) — no persistent data in this feature (documented honestly, not padded).
- [contracts/dev-commands.md](contracts/dev-commands.md) — the developer-facing command contract (`npm run tauri dev` / `build` / `test`), the window lifecycle contract, and the FR→acceptance-scenario mapping. No Tauri IPC commands exist yet (the frontend renders static content), so there is no IPC contract to define.
- [quickstart.md](quickstart.md) — the clone → install prerequisites → `npm install` → `npm run tauri dev` → window path (validates SC-001 and SC-005).

## Complexity Tracking

No constitution violations — section intentionally empty.
