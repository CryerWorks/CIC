---
description: "Task list for Feature 001 — Tauri Shell (React + Vite)"
---

# Tasks: Tauri Shell (React + Vite)

**Input**: Design documents from `specs/001-tauri-shell/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md (empty by design) ✅, contracts/dev-commands.md ✅, quickstart.md ✅

**Tests**: One Vitest smoke test is in scope — mandated by research decision **R6** and asserted by the command contract (`npm run test` → App smoke test passes). No broader test suite (nothing of substance to test in a scaffold). No TDD framing: the App component is scaffolded, then the test pins its placeholder text.

**Organization**: Tasks are grouped by user story. This feature is a *scaffold-then-customize-then-verify* flow, so many tasks are "verify / adjust what `create-tauri-app` generated" rather than author-from-scratch — that is honest to how the work actually happens (research **R3**).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 (Setup, Foundational, Polish carry no story label)
- File paths are repo-root-relative (the frontend lives at the repo root per plan.md Structure Decision)

## ⚠️ Git note

The user owns all git operations. **No task in this list runs git.** Where the spec-kit workflow would commit (the optional `before_tasks` / `after_tasks` hooks), that is surfaced to the user, never executed here.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Get a known-good Tauri 2 + React + TS scaffold sitting at the repo root without disturbing existing docs.

- [X] T001 Verify Windows 11 prerequisites are present before scaffolding: `node -v` (LTS), `cargo --version` (Rust stable, MSVC host triple `x86_64-pc-windows-msvc`), and the MSVC C++ Build Tools / WebView2 (pre-installed on Win11). If any are missing, stop and point the operator at [quickstart.md](quickstart.md) — do not proceed to T002. (research R2; FR-007)
- [X] T002 Scaffold a Tauri 2 app with the **React + TypeScript** template and **npm** manager via `npm create tauri-app@latest` into a **temporary sibling directory** outside the repo (e.g. `../cic-scaffold-temp`). Do not run it inside the repo root. (research R3)
- [X] T003 Move the generated app files (`index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `src/`, `src-tauri/`) from the temp dir into the repo root, **preserving all existing root docs** (`PRD-CIC-Platform.md`, `CLAUDE.md`, `ai-provider-layer.md`, `CIC-Design-Language-Obsidian.html`, `docs/`, `.specify/`, `.claude/`, `specs/`). Confirm no existing file is overwritten (root has no `src/`/`package.json` today). Then delete the temp dir. (research R3; FR-005)
- [X] T004 Verify/create `.gitignore` at repo root covering `node_modules/`, `dist/`, and `src-tauri/target/` so build artifacts are not tracked.
- [X] T005 Run `npm install` at the repo root to install frontend dependencies; confirm it exits 0. (quickstart; command contract)

**Checkpoint**: A Tauri React-TS scaffold sits at the repo root, deps installed, docs untouched.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Lock the config wiring that *both* user stories depend on — entry-point scripts, strict TS, the Vite↔Tauri port handshake, window config, and the test harness. Nothing here is story-specific; everything below blocks US1 and US2.

**⚠️ CRITICAL**: Complete this phase before verifying either user story — a misconfigured port or missing script makes both stories untestable.

- [X] T006 In `package.json`: set the project `name` to `cic` and confirm the scripts exactly match research **R5** — `"dev": "vite"`, `"build": "tsc && vite build"`, `"tauri": "tauri"`, `"test": "vitest"`. Single discoverable entry point. (FR-006; SC-005)
- [X] T007 [P] In `tsconfig.json`: enforce TypeScript strict — `"strict": true` plus `"noUnusedLocals": true` and `"noUnusedParameters": true`. (Constitution Technology Constraints; research R6)
- [X] T008 In `src-tauri/tauri.conf.json`: confirm `build.beforeDevCommand` = `"npm run dev"`, `build.beforeBuildCommand` = `"npm run build"`, and `build.devUrl` points at the Vite dev server (conventionally `http://localhost:1420`). (research R4, R5)
- [X] T009 In `vite.config.ts`: set `server.port` to the **same** port as `tauri.conf.json` `build.devUrl` and set `server.strictPort: true` so a port collision fails loudly instead of silently desyncing from the shell. (research R4; FR-007; spec "dev server port in use" edge case)
- [X] T010 [P] In `src-tauri/tauri.conf.json`: set the window config — title `"CIC"`, a sensible default size, single window. (FR-001)
- [X] T011 [P] Configure Vitest with a `jsdom` environment and `@testing-library/react` (add as devDependencies; config in `vitest.config.ts` or merged into `vite.config.ts`). Harness only — the test itself is T013. (research R6)

**Checkpoint**: Config is coherent — scripts discoverable, TS strict, ports agree, window named, test harness ready. User-story verification can begin.

---

## Phase 3: User Story 1 — Launch the desktop app (Priority: P1) 🎯 MVP

**Goal**: `npm run tauri dev` opens a single native window that renders the React app with visible placeholder content, and HMR works.

**Independent Test**: On the configured machine, run `npm run tauri dev`. A native window titled "CIC" opens within ~10s showing the placeholder marker; editing `src/App.tsx` and saving updates the window without a shell restart.

### Implementation for User Story 1

- [X] T012 [US1] Author `src/App.tsx` as the placeholder rendering proof: render the app name (`CIC`) and a visible "hello"-style marker (a known string the smoke test will also assert). No styling, no theme, no chrome. (FR-002)
- [X] T013 [P] [US1] Verify `src/main.tsx` mounts `<App />` via React `createRoot` into the `#root` element in `index.html` (scaffold default — adjust only if needed). (FR-002)
- [X] T014 [P] [US1] Write `src/App.test.tsx`: a Vitest + Testing Library smoke test that renders `<App />` and asserts the placeholder marker string from T012 is in the document. (FR-002; command contract; research R6)
- [X] T015 [US1] Run `npm run test` and confirm the App smoke test passes. (FR-002 verification)
- [X] T016 [US1] Run `npm run tauri dev`; confirm **exactly one** native window opens and displays the placeholder marker (not zero, not multiple), within ~10s on a warm run. (FR-001; SC-002; command/window-lifecycle contract)
- [X] T017 [US1] With `tauri dev` running, edit the marker text in `src/App.tsx`, save, and confirm the window reflects the change within ~3s with no manual shell restart. Revert the edit. (FR-003; SC-003)

**Checkpoint**: The window opens, renders the placeholder, the smoke test is green, and HMR works — Feature 001's MVP is delivered.

---

## Phase 4: User Story 2 — Close the app cleanly (Priority: P2)

**Goal**: Closing the window terminates every process the dev command started — zero orphans.

**Independent Test**: With the app running, close the window, then inspect running processes; confirm no app-attributable `node`/Vite, Tauri shell, or WebView2 host process survives.

### Implementation for User Story 2

- [X] T018 [US2] With `npm run tauri dev` running, close the window (window X), then inspect processes (e.g. PowerShell `Get-Process node, cic, msedgewebview2 -ErrorAction SilentlyContinue`) and confirm **zero** orphaned processes attributable to the app remain. If orphans survive, capture the offending process and the Rust shell logs before treating the story as failed. (FR-004; SC-004; window-lifecycle contract)

**Checkpoint**: Open → close leaves a clean process table. US1 and US2 both verified independently.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Confirm the build path and the contributor experience hold up, and leave the tree green.

- [X] T019 [P] Run `npm run build` and confirm it typechecks (tsc) and produces a frontend build with no errors (smoke-level; packaging/signing is out of scope). (command contract)
- [X] T020 [P] Walk [quickstart.md](quickstart.md) top-to-bottom as if a fresh contributor: confirm the documented single command path (prereqs → `npm install` → `npm run tauri dev` → window) is accurate and the entry point is discoverable without asking. Fix any drift in quickstart.md. (SC-001, SC-005)
- [X] T021 Confirm the working tree is green: `npm run test` passes and `npm run lint` (if a lint script exists post-scaffold) reports clean. (Constitution quality gate)
- [X] T022 Prepare the end-of-feature walkthrough notes (what was scaffolded, the FR→verification results, the three flagged plan decisions as resolved) for the user-led review before merge. (SOP: mandatory end-of-feature walkthrough)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 gates everything (no prereqs → no build). T002 → T003 → T004/T005 are strictly sequential (can't move files that don't exist; can't install before files are in place).
- **Foundational (Phase 2)**: Depends on Setup (scaffold must exist to edit its config). **Blocks both user stories.**
- **User Stories (Phase 3–4)**: Depend on Foundational. US1 (P1) is the MVP; US2 (P2) is independent of US1 but in practice you launch (US1) before you can test closing (US2).
- **Polish (Phase 5)**: Depends on the user stories being verified.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2. No dependency on US2.
- **US2 (P2)**: Starts after Phase 2. Logically exercised after a launch (US1) but is a distinct, independently-stated property (clean teardown).

### Within Each Story

- US1: author App (T012) → verify mount (T013) → write test (T014) → test green (T015) → window opens (T016) → HMR (T017). T013/T014 are [P] (different files) but both precede the runtime checks.

### Parallel Opportunities

- Phase 2: T007 (`tsconfig.json`), T010 (`tauri.conf.json` window), and T011 (Vitest config) touch different files → parallelizable. T008 and T009 both concern the port handshake and should be done together/sequentially (T008 sets the source of truth, T009 matches it).
- US1: T013 (`main.tsx`) and T014 (`App.test.tsx`) are [P]; both depend on T012 defining the marker string.
- Phase 5: T019 (build) and T020 (quickstart walk) are [P].

---

## Parallel Example: Phase 2 Foundational

```text
# Different files, no interdependencies — can run together:
Task T007: Enforce TS strict in tsconfig.json
Task T010: Set window title/size in src-tauri/tauri.conf.json
Task T011: Configure Vitest (vitest.config.ts) + add devDependencies
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → scaffold at root, deps installed.
2. Phase 2 Foundational → config coherent (CRITICAL — blocks stories).
3. Phase 3 US1 → window opens, renders, HMR, smoke test green.
4. **STOP and VALIDATE**: this *is* the feature's value — a proven Tauri+React+Vite shell on Windows.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → window + render + HMR + test → **MVP demoable**.
3. US2 → clean teardown verified.
4. Polish → build smoke + quickstart accuracy + green tree + walkthrough.

### Notes

- This feature deliberately validates the *workflow* (Specify→Plan→Tasks→Implement) as much as the artifact — keep tasks small and verifiable.
- Many tasks are "verify the scaffold already does X"; if `create-tauri-app` already satisfies a task, confirm and check it off rather than rewriting generated config.
- Stop at the US1 checkpoint to confirm the MVP before touching US2/Polish.
