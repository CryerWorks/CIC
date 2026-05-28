# Feature Specification: Tauri Shell (React + Vite)

**Feature Branch**: `001-tauri-shell`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "Feature 001 — Tauri shell with React + Vite. Smallest viable scaffold: `npm run tauri dev` opens a native desktop window that renders a React + Vite app, says 'hello' (placeholder content), exits cleanly. No Tailwind theme, no SQLite, no app chrome, no routing, no design tokens yet — those are features 002+. Goal is to validate that Tauri runs on Windows + the spec-kit Specify→Plan→Tasks→Implement workflow on something tiny."

## User Scenarios & Testing *(mandatory)*

> **Note on "user" for this feature.** CIC's end user is the learner ("the operator"). Feature 001 is pure foundation — no learning functionality yet — so the immediate beneficiary is the **developer/operator standing up and running the app**. Every later feature builds on the window this feature opens. The scenarios below are framed accordingly.

### User Story 1 - Launch the desktop app (Priority: P1)

The operator runs a single documented command and a native desktop window opens, rendering the CIC application. This is the foundation every other feature depends on — without a window that renders the app, nothing else can be built or demonstrated.

**Why this priority**: This is the entire MVP of Feature 001. If the window opens and renders, the feature has delivered its value: a proven, runnable Tauri + React + Vite shell on the target platform. Everything else is secondary.

**Independent Test**: Run the documented dev command on a clean checkout (with toolchain prerequisites installed). A native OS window appears and displays the placeholder application content. Fully testable on its own; delivers a runnable desktop app.

**Acceptance Scenarios**:

1. **Given** a clean checkout with the documented prerequisites installed, **When** the operator runs the dev command, **Then** a native desktop window opens within a few seconds and displays placeholder application content confirming the React app is rendering.
2. **Given** the app is running in dev mode, **When** the operator edits the placeholder frontend content and saves, **Then** the running window reflects the change without a manual restart of the shell.

---

### User Story 2 - Close the app cleanly (Priority: P2)

The operator closes the desktop window and the application terminates fully — no orphaned background processes (dev server, webview host) left running.

**Why this priority**: A shell that doesn't exit cleanly accrues orphaned processes across dev iterations, degrading the machine and masking real bugs later. Clean lifecycle is a foundational correctness property, but it's secondary to the window opening at all.

**Independent Test**: Open the app, then close the window. Inspect running processes; confirm no CIC-related dev server or webview process survives.

**Acceptance Scenarios**:

1. **Given** the app is running, **When** the operator closes the window, **Then** all processes started by the dev command terminate within a few seconds, leaving none orphaned.

---

### Edge Cases

- **Missing native toolchain**: If the platform's native build toolchain (required by the desktop shell) is not installed, the dev command MUST fail with a clear, actionable error naming the missing prerequisite — not a silent hang or an opaque stack trace.
- **Missing platform webview runtime**: If the OS webview runtime the shell renders into is absent, the failure MUST be surfaced clearly with guidance, rather than opening a blank or broken window.
- **Dev server port in use**: If the frontend dev server's default port is already occupied, the shell MUST still connect to the correct frontend (the shell and frontend must agree on the port), rather than opening a window pointed at the wrong or a dead address.
- **Frontend build error**: If the frontend has a compile/render error in dev, the window SHOULD surface the error (overlay or console) rather than showing a blank window with no explanation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Running the documented dev command MUST open a single native desktop window.
- **FR-002**: The window MUST render a frontend application; the application content MUST confirm rendering succeeded (visible placeholder text, e.g. the app name and a "hello"-style marker).
- **FR-003**: Editing frontend source while the dev command is running MUST update the rendered window without requiring a manual restart of the desktop shell (live reload).
- **FR-004**: Closing the window MUST terminate every process started by the dev command, leaving no orphaned processes.
- **FR-005**: The project MUST establish the baseline two-part directory layout the rest of the build assumes: a frontend application directory and a native-shell directory, consistent with the target repo structure (frontend at the repo's `src/`-level app, native shell isolated in its own directory).
- **FR-006**: The documented dev command MUST be runnable from a single, discoverable entry point (a script defined in the project manifest), not a multi-step manual sequence.
- **FR-007**: When a prerequisite is missing (native toolchain, webview runtime), the failure MUST be reported with a clear message identifying what is missing.

### Out of Scope (Feature 001 — deferred to later features)

- Tailwind theme / design tokens from the Obsidian design language (Feature 002).
- SQLite / `tauri-plugin-sql` and any data persistence (Feature 003).
- `tauri-plugin-fs` / vault access.
- Application chrome (left rail, topbar) and routing (Feature 004+).
- Porting any war-room components (Feature 005+).
- Production packaging / signing / auto-update (later phase).
- macOS and Linux validation — this feature targets the operator's Windows machine only (cross-platform is a later concern, PRD §13 risk 8).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with prerequisites installed can go from a fresh checkout to a visible app window with a **single documented command** in **under 5 minutes** (first run, including dependency install).
- **SC-002**: On a subsequent run (dependencies already installed), the native window appears within **10 seconds** of issuing the dev command.
- **SC-003**: A saved change to placeholder frontend content is reflected in the running window within **3 seconds**, with no manual shell restart.
- **SC-004**: Closing the window leaves **zero** orphaned processes attributable to the app (verified by process inspection).
- **SC-005**: A new contributor can identify and run the correct dev command from the project's documentation **without asking** — the entry point is discoverable in the project manifest and quickstart.

## Assumptions

- **Shell, frontend, and language are pre-decided by the Constitution / PRD** (not open questions for this spec): Tauri desktop shell, React + TypeScript frontend, Vite bundler, npm scripts. This spec describes the *outcome*; the locked tech choices come from the constitution.
- **Target platform for Feature 001 is Windows** — the operator's development machine. The stated goal is validating Tauri-on-Windows; other platforms are explicitly deferred.
- **The dev machine has the required toolchains installed** (Node.js for the frontend, the native build toolchain the shell requires). Installing those toolchains is a prerequisite documented in the quickstart, not work performed by this feature.
- **No persisted data, no network calls, no vault access** — the window renders static placeholder content only. This keeps Feature 001 the smallest validatable slice.
- **This feature deliberately validates the workflow as much as the artifact** — it is intentionally tiny so the spec-kit Specify→Plan→Tasks→Implement loop is exercised end-to-end on low-risk work before larger features.
