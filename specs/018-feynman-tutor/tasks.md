# Tasks: AI Feynman / Socratic Tutor (F4)

**Input**: Design documents from `specs/018-feynman-tutor/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/feynman-panel.md, quickstart.md

**Tests**: Included — core logic (prompt assembly, gap parsing, vault writeback, tutoring orchestration) requires unit tests per Constitution IV.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Migration, Socratic prompt, shared types

- [ ] T001 Create migration `m0010_feynman_gaps.ts` in `src/db/migrations/` adding `feynman_gaps` table (id, vault_id, course_id nullable, note_path, text, status, created_at) + indexes per research.md R4
- [ ] T002 [P] Register m0010 in `src/db/migrations/index.ts`
- [ ] T003 [P] Create Socratic system prompt in `src/ai/prompts/socratic.ts` — versioned const `SOCRATIC_SYSTEM_PROMPT` with RULES, CONTEXT placeholder, behavior constraints per research.md R1
- [ ] T004 [P] Create Feynman types (`FeynmanMessage`, `Citation`, `FeynmanGap`, `GapSaveTarget`, `FeynmanGapRow` zod schema) in `src/ai/features/feynman/types.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: FeynmanTutor interface, implementation, prompt assembly, chat orchestration — everything US1–US3 depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Define `FeynmanTutor` interface (`startConversation`, `sendMessage`, `getMessages`, `summarizeGaps`, `saveGaps`, `isActive`) in `src/ai/features/feynman/tutor.ts` per contracts/feynman-panel.md
- [ ] T006 [P] Implement `buildSocraticPrompt(messages, contextChunks)` — pure function: system prompt + RAG context injection + conversation history formatting — in `src/ai/features/feynman/prompt.ts`
- [ ] T007 [P] Write prompt assembly tests (system prompt structure, context injection format, conversation history truncation, empty context, max window) in `tests/ai/features/feynman/prompt.test.ts`
- [ ] T008 Implement `FeynmanTutor` class — `startConversation` resets state, `sendMessage` calls RAG search → `router.chat('reasoning', …)` with `containsVaultContent: true` → streams response, `summarizeGaps` makes a summary call, `saveGaps` dual-writes vault + DB — in `src/ai/features/feynman/tutor.ts`
- [ ] T009 [P] Write FeynmanTutor unit tests (sendMessage orchestration, streaming, summarization, saveGaps dual-write, lockdown gate, provider error handling) with fake chat router + fake RAG + fake vault — in `tests/ai/features/feynman/tutor.test.ts`
- [ ] T010 [P] Write migration tests (m0010 additive, version bump, table schema, FK cascade, CHECK constraint, course-nullable) in `tests/db/migrations/m0010.test.ts`

**Checkpoint**: Foundation ready — prompt + tutor orchestration + migration all test green. User story implementation can now begin.

---

## Phase 3: User Story 1 - Feynman Conversation (Priority: P1) 🎯 MVP

**Goal**: Chat panel where learner explains a concept, AI responds with probing questions grounded in RAG

**Independent Test**: Open Feynman Panel, explain a concept, get a Socratic question grounded in RAG content, respond, get follow-up

### Implementation for User Story 1

- [ ] T011 [P] [US1] Implement `useFeynmanTutor()` hook — wraps `FeynmanTutor` instance, manages `messages`/`isActive`/`error` state, exposes `sendMessage`/`reset` — in `src/ai/features/feynman/hooks/useFeynmanTutor.ts`
- [ ] T012 [P] [US1] Write useFeynmanTutor hook tests (message state, streaming update, error handling, reset, scope change) in `tests/ai/features/feynman/useFeynmanTutor.test.ts`
- [ ] T013 [P] [US1] Create `FeynmanMessage` component — renders learner message (right-aligned, gray bubble) and tutor message (left-aligned, AI-cyan bubble per design language), handles streaming text (typing cursor while `isStreaming`) — in `src/features/feynman/FeynmanMessage.tsx`
- [ ] T014 [US1] Create `FeynmanPanel` component — chat container with scrollable message list, text input + send button, typing indicator, intro message, close button with confirmation dialog when unsaved gaps exist (FR-018 navigation warning) — in `src/features/feynman/FeynmanPanel.tsx`
- [ ] T015 [US1] Wire "Feynman Tutor" button into Daily Loop Self-Test step (`src/features/loop/SelfTestStep.tsx`) — opens FeynmanPanel as a modal/overlay with `gapSaveTarget` set to session writeup
- [ ] T016 [US1] Wire "Feynman Tutor" button into Course detail page — opens FeynmanPanel scoped to course (`courseId`)
- [ ] T017 [US1] Wire "Feynman Tutor" button into Search Corpus page — opens FeynmanPanel from global context (no course scope)
- [ ] T018 [US1] Write FeynmanPanel UI tests (render, send message, streaming indicator, multi-turn display, close, provider offline error) in `tests/features/feynman/FeynmanPanel.test.tsx`

**Checkpoint**: Feynman conversation works end-to-end — explain → AI probes → explain → AI probes again

---

## Phase 4: User Story 2 - Gap Tracking + Writeback (Priority: P2)

**Goal**: Summarize gaps from conversation, save as `- [ ]` to vault (canonical) + SQLite (mirror), Dashboard surfacing

**Independent Test**: Run conversation, click Summarize Gaps, save, verify vault checkbox items + Dashboard count

### Implementation for User Story 2

- [ ] T019 [P] [US2] Implement `GapSummary` component — displays gap list after summarization, "Save to Session" / "Save as Note" buttons depending on context — in `src/features/feynman/GapSummary.tsx`
- [ ] T020 [US2] Implement `feynmanGaps` repository — `insertGaps(input)`, `listOpenGaps(vaultId)`, `getOpenGapCountByCourse(vaultId)` (for Dashboard tile), `reconcileGaps(vaultId)` (vault rescan: scan `- [x]` items → update DB) — in `src/db/repositories/feynmanGaps.ts`
- [ ] T021 [US2] Implement vault gap writeback — `writeGapsToVault(gaps, target, vaultWriter)` — appends `## Gaps from Feynman` section with `- [ ]` items, merges new gaps into existing section, never clobbers user-owned content — in `src/features/feynman/gapWriter.ts`
- [ ] T022 [P] [US2] Write gap writer tests (session writeup target, standalone note target, existing gaps merge, user content preservation, empty gaps) in `tests/features/feynman/gapWriter.test.ts`
- [ ] T023 [US2] Wire `saveGaps` to call `writeGapsToVault` + `feynmanGaps.insertGaps` in one flow — vault first (canonical), then DB (mirror). Vault failure still persists DB row per FR-014 — in `src/ai/features/feynman/tutor.ts`
- [ ] T024 [US2] Add "Gaps to Chase" tile to Dashboard — queries `feynmanGaps.getOpenGapCountByCourse(vaultId)`, renders counts grouped by Course — in `src/features/dashboard/DashboardView.tsx`
- [ ] T025 [US2] Write feynmanGaps repository tests (insert, list open, count by course, vault scoping, cascade on vault/course delete, reconciliation) in `tests/db/repositories/feynmanGaps.test.ts`

**Checkpoint**: Gap tracking complete — save → vault + DB → Dashboard tile with counts

---

## Phase 5: User Story 3 - Source Citation (Priority: P3)

**Goal**: AI responses cite sources inline, citations are clickable, uncertainty flags in technical domains

**Independent Test**: Conversation with ingested Resource, verify citations appear, click to open source, verify uncertainty flags without RAG

### Implementation for User Story 3

- [ ] T026 [P] [US3] Implement citation formatting in `buildSocraticPrompt` — inject source name + locator into context so the AI can cite them — already handled in T006 prompt design, but verify citation format is explicit in the system prompt
- [ ] T027 [US3] Create `FeynmanCitation` component — renders clickable citation chip with source name + locator, opens source at locator via existing opener (010/011) — in `src/features/feynman/FeynmanCitation.tsx`
- [ ] T028 [US3] Parse citations from AI response text (regex: `[source: Chapter X, p.Y]` or markdown links to vault notes) and render as `FeynmanCitation` chips inline — extend `FeynmanMessage` to break content into text + citation segments
- [ ] T029 [US3] Add uncertainty flag detection: if AI response contains "⚠️ I'm reasoning from general knowledge", render it as a warning badge next to the message — extend `FeynmanMessage.tsx`
- [ ] T030 [US3] Write citation parsing + rendering tests (resource citation, note citation, multiple citations in one message, uncertainty flag, grayed-out deleted source) in `tests/features/feynman/FeynmanCitation.test.tsx` (extend or create)

**Checkpoint**: Citations working — clickable source links + uncertainty flags visible

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Drift reconciliation, edge cases, quickstart validation

- [ ] T031 [P] Implement vault rescan gap reconciliation — scan vault files for `- [x]` completed items under `## Gaps from Feynman`, update `feynman_gaps.status → completed` — wire into existing vault rescan or Dashboard refresh — in `src/db/repositories/feynmanGaps.ts` (extend T020)
- [ ] T032 [P] Add "Refresh gaps" button on Dashboard "Gaps to Chase" tile to trigger reconciliation manually
- [ ] T033 Run full quickstart.md validation (scenarios A–L) against live `tauri dev`
- [ ] T034 Run `npm run test`, `npm run lint`, `npm run tsc` — all green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — MVP
- **US2 (Phase 4)**: Depends on US1 (conversation produces gaps to save) + Foundational (tutor.saveGaps)
- **US3 (Phase 5)**: Depends on US1 (conversation with citations) + Foundational (prompt assembly)
- **Polish (Phase 6)**: Depends on US2 (gaps exist for reconciliation) + US3 (citations exist to test)

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no other story dependencies
- **US2 (P2)**: Depends on US1 — needs conversations to produce gaps
- **US3 (P3)**: Depends on US1 — needs conversations to show citations; can be done in parallel with US2

### Within Each User Story

- Tests → Components → Integration
- Core logic before UI wiring

### Parallel Opportunities

- T001/T003/T004 in Setup (migration is T001→T002 sequential)
- T006/T007/T010 in Foundational (prompt + tests + migration tests)
- T011/T012/T013 in US1 (hook + tests + message component)
- T019/T022 in US2 (gap UI + gap writer tests)
- T026/T027 in US3 (prompt update + citation component)
- T031/T032 in Polish (reconciliation + button)

---

## Implementation Strategy

### MVP (US1 only)

1. Phase 1 + 2 → Foundation green
2. Phase 3 (US1) → Feynman conversation working
3. **STOP**: Demonstrate explain → AI probes → respond → AI probes again
4. This is independently shippable — the core Socratic tutor works without gap persistence

### Full Delivery

1. Setup + Foundational → Foundation ready
2. US1 → Conversation working
3. US2 → Gap tracking working (parallel start with US3)
4. US3 → Citations working
5. Polish → Reconciliation + quickstart

---

## Task Summary

| Phase | Story | Tasks | Parallel |
|-------|-------|-------|----------|
| Setup (1) | — | T001–T004 (4) | T001→T002 sequential, T003/T004 parallel |
| Foundational (2) | — | T005–T010 (6) | T006/T007/T010 parallel |
| US1 (3) | P1 Conversation | T011–T018 (8) | T011/T012/T013 parallel |
| US2 (4) | P2 Gaps | T019–T025 (7) | T019/T022 parallel |
| US3 (5) | P3 Citations | T026–T030 (5) | T026/T027 parallel |
| Polish (6) | — | T031–T034 (4) | T031/T032 parallel |
| **Total** | | **34 tasks** | |

**Tests**: 8 test files. **No Rust changes**. **No new npm deps**. **Migration only**: m0010 additive.
