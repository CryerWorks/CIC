# Implementation Plan: AI Feynman / Socratic Tutor (F4)

**Branch**: `018-feynman-tutor` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/018-feynman-tutor/spec.md`

## Summary

Build the Feynman/Socratic tutor — the first AI consumer of both `router.chat('reasoning', …)` (016) and RAG retrieval (017). A chat panel where the learner explains a concept and the AI plays a probing beginner, asking one question at a time grounded in the learner's own vault notes and ingested Resources. Identified gaps are saved as `- [ ]` checkbox items in vault Markdown (canonical) + SQLite `feynman_gaps` table (read-optimized mirror for Dashboard).

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) — no Rust changes (no new Tauri plugins or custom commands)

**Primary Dependencies**: Existing AI router (016) for `router.chat('reasoning', …)`. Existing RAG hook (017) for `useRAG().search()`. Existing `VaultWriter` for gap writeback. Existing SSE streaming from 016 adapters. LaTeX renderer (KaTeX, lightweight — Markdown code blocks cover basic use).

**Storage**: Additive migration `m0010` adds `feynman_gaps` table. No new vector tables. No new plugins.

**Testing**: Vitest. Unit tests for prompt assembly, gap parsing, vault-write-back. Integration tests with fake chat router (mock AI responses). UI tests for Feynman panel rendering.

**Target Platform**: Tauri 2 desktop (Windows/macOS/Linux) + Node.js test environment

**Performance Goals**: First AI response streaming start within 10s (incl. RAG retrieval). Gap save within 5s (vault write + DB insert). Context window management keeps conversation under provider token limits.

**Constraints**: Fully local-first. All chat calls route through `router.chat()` → lockdown gate enforced. No new npm deps beyond KaTeX (if needed for in-app math rendering). No new Tauri plugins. No new Rust commands. Vault writes through `VaultWriter` only.

**Scale/Scope**: Single learner, single conversation at a time. Gaps scale to ~dozens per course (not thousands).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Vault is Canonical and Sacred — PASS

- Gap writeback goes through `VaultWriter` (single chokepoint, atomic temp→rename).
- `feynman_gaps` table is an additive mirror — vault is canonical (drift reconciliation corrects the DB, never the vault).
- Feynman conversations are ephemeral — no vault file written until learner explicitly saves gaps.
- No `fs.writeFile` on vault paths — all writes through `VaultWriter`.

### II. AI Vendor-Agnostic, Not Oracle — PASS

- All chat calls go through `router.chat('reasoning', …)` — existing Provider abstraction.
- `containsVaultContent: true` on every chat call (RAG chunks + learner explanation).
- Lockdown gate enforced (FR-010): if lockdown ON and reasoning provider remote → panel blocked.
- AI never auto-commits — learner explicitly saves gaps.
- Socratic prompt enforces "never assert correctness" + uncertainty flags in technical domains.
- Prompt lives in `src/ai/prompts/` (016 pattern) — version-controlled, no scattered prompts.

### III. Preserve Desirable Difficulty — PASS

- AI plays the probing beginner — it asks questions, never gives answers.
- No "learned" markers. Gaps are tasks to chase, not mastery claims.
- Learner must explicitly explain concepts (retrieval practice).
- Summarize Gaps is learner-triggered, not automatic.

### IV. Interface-First, Deep Modules — PASS

- `FeynmanTutor` interface (spine): `startConversation`, `sendMessage`, `summarizeGaps`, `saveGaps`.
- `useFeynmanTutor()` hook: features never touch the chat router or RAG directly.
- Prompt assembly separated from chat routing — `buildSocraticPrompt()` is a pure function.
- Gap persistence separated: `saveGaps()` orchestrates `VaultWriter` + `feynman_gaps` repo.

### V. Spec-Driven Development — PASS

- Following the full speckit workflow: constitution → specify → clarify → plan → tasks → implement.

### Gate Result: ALL PASS — proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/018-feynman-tutor/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── feynman-panel.md  # Chat panel + gap persistence contracts
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── ai/
│   ├── prompts/
│   │   └── socratic.ts      # NEW — versioned Socratic system prompt
│   ├── features/
│   │   └── feynman/         # NEW — Feynman tutor logic
│   │       ├── tutor.ts     # FeynmanTutor interface + implementation
│   │       ├── prompt.ts    # buildSocraticPrompt(), citation formatting
│   │       └── hooks/
│   │           └── useFeynmanTutor.ts  # React hook
├── features/
│   ├── feynman/             # NEW — Feynman panel UI
│   │   ├── FeynmanPanel.tsx      # Chat panel component
│   │   ├── FeynmanMessage.tsx    # Individual message bubble (learner/AI)
│   │   ├── FeynmanCitation.tsx   # Clickable source citation chip
│   │   └── GapSummary.tsx        # Gap list with save controls
│   └── loop/
│       └── SelfTestStep.tsx      # Extend: replace manual self-test with Feynman panel
├── db/
│   ├── migrations/
│   │   └── m0010_feynman_gaps.ts # NEW — feynman_gaps table
│   └── repositories/
│       └── feynmanGaps.ts        # CRUD for feynman_gaps
└── app/
    └── router.tsx                # No new route — panel is modal/overlay

tests/
├── ai/features/feynman/
│   ├── tutor.test.ts         # FeynmanTutor unit tests (mock chat router)
│   ├── prompt.test.ts        # Prompt assembly + citation formatting tests
│   └── useFeynmanTutor.test.ts # Hook tests with fake providers
├── features/feynman/
│   └── FeynmanPanel.test.tsx  # UI rendering + interaction tests
└── db/
    └── migrations/
        └── m0010.test.ts      # Migration tests
```

**Structure Decision**: Feynman tutor logic lives under `src/ai/features/feynman/` — a new AI feature module adjacent to `src/ai/rag/` (017). The UI lives under `src/features/feynman/`. This separates chat orchestration from panel rendering. Prompt lives in `src/ai/prompts/` following the 016 pattern of versioned, centralized prompts. No new Tauri plugin or Rust command needed.

## Complexity Tracking

> No Constitution violations detected — this section intentionally empty.
