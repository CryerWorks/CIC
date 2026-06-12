# Handoff: 018-feynman-tutor — AI Feynman / Socratic Tutor (F4)

**Feature**: 018-feynman-tutor | **Branch**: `018-feynman-tutor` | **Handoff**: 2026-06-12

## Status

| Phase | Tasks | Done |
|-------|-------|------|
| Phase 1: Setup | T001–T004 | ✅ 4/4 |
| Phase 2: Foundational | T005–T010 | ✅ 6/6 |
| **Phase 3: US1 Conversation** | **T011–T018** | **⏳ 0/8** |
| **Phase 4: US2 Gaps** | **T019–T025** | **⏳ 0/7** |
| **Phase 5: US3 Citations** | **T026–T030** | **⏳ 0/5** |
| **Phase 6: Polish** | **T031–T034** | **⏳ 0/4** |
| **Total** | **34** | **10 done, 24 remaining** |

## What exists (Phase 1+2 output)

| File | Purpose |
|------|---------|
| `src/db/migrations/m0010_feynman_gaps.ts` | Migration — `feynman_gaps` table (vault_id, course_id, note_path, text, status, created_at) |
| `src/db/migrations/index.ts` | Registered m0010 |
| `src/ai/prompts/socratic.ts` | `SOCRATIC_SYSTEM_PROMPT` — versioned Socratic prompt with RULES |
| `src/ai/features/feynman/types.ts` | Types — FeynmanMessage, Citation, FeynmanGap, GapSaveTarget, FeynmanGapRowSchema |
| `src/ai/features/feynman/tutor.ts` | `FeynmanTutor` interface (startConversation, sendMessage, getMessages, summarizeGaps, saveGaps, isActive) |
| `src/ai/features/feynman/prompt.ts` | `buildSocraticPrompt()` — system prompt + RAG context injection + truncation |
| `src/ai/features/feynman/tutorImpl.ts` | `FeynmanTutorImpl` class — orchestration: RAG search → router.chat('reasoning') → stream → gap summary → dual write |
| `src/ai/features/feynman/prompt.test.ts` | 7 prompt tests ✅ |
| `src/ai/features/feynman/tutor.test.ts` | 11 tutor tests ✅ |
| `src/db/migrations/m0010.test.ts` | 4 migration tests ✅ |

## Remaining tasks

### Phase 3: US1 — Feynman Conversation (T011–T018)
- T011 [P] Implement `useFeynmanTutor()` hook in `src/ai/features/feynman/hooks/useFeynmanTutor.ts`
- T012 [P] Hook tests in `src/ai/features/feynman/hooks/useFeynmanTutor.test.ts`
- T013 [P] `FeynmanMessage` component in `src/features/feynman/FeynmanMessage.tsx`
- T014 `FeynmanPanel` component in `src/features/feynman/FeynmanPanel.tsx` (with nav-warning dialog)
- T015 Wire "Feynman Tutor" button into Daily Loop Self-Test step `src/features/loop/SelfTestStep.tsx`
- T016 Wire into Course detail page
- T017 Wire into Search Corpus page
- T018 FeynmanPanel UI tests in `tests/features/feynman/FeynmanPanel.test.tsx`

### Phase 4: US2 — Gaps (T019–T025)
- T019 [P] `GapSummary` component in `src/features/feynman/GapSummary.tsx`
- T020 `feynmanGaps` repository in `src/db/repositories/feynmanGaps.ts`
- T021 `writeGapsToVault` in `src/features/feynman/gapWriter.ts`
- T022 [P] Gap writer tests in `src/features/feynman/gapWriter.test.ts` (colocated)
- T023 Wire saveGaps dual-write in `src/ai/features/feynman/tutorImpl.ts` (enhance)
- T024 "Gaps to Chase" tile in `src/features/dashboard/DashboardView.tsx`
- T025 feynmanGaps repo tests in `src/db/repositories/feynmanGaps.test.ts` (colocated)

### Phase 5: US3 — Citations (T026–T030)
- T026 [P] Verify citation format in prompt (already handled in existing prompt)
- T027 `FeynmanCitation` component in `src/features/feynman/FeynmanCitation.tsx`
- T028 Parse citations from AI response text in `FeynmanMessage`
- T029 Uncertainty flag detection in `FeynmanMessage`
- T030 Citation tests in `src/features/feynman/FeynmanCitation.test.tsx`

### Phase 6: Polish (T031–T034)
- T031 [P] Vault rescan gap reconciliation in `src/db/repositories/feynmanGaps.ts` (extend)
- T032 [P] "Refresh gaps" button on Dashboard
- T033 Quickstart validation (user's `tauri dev`)
- T034 Run test/lint/tsc — all green

## Key interfaces already defined

```ts
// FeynmanTutor (src/ai/features/feynman/tutor.ts)
interface FeynmanTutor {
  startConversation(scope?: { courseId?: string }): void;
  sendMessage(text: string): AsyncIterable<string>;
  getMessages(): FeynmanMessage[];
  summarizeGaps(): Promise<FeynmanGap[]>;
  saveGaps(gaps: FeynmanGap[], target: GapSaveTarget): Promise<number>;
  isActive: boolean;
}
```

## Architecture rules

- All vault writes through `VaultWriter` only (Constitution I)
- All chat through `router.chat('reasoning', …)` with `containsVaultContent: true` (Constitution II)
- UI consumes `useFeynmanTutor()` hook — never imports `FeynmanTutorImpl` directly
- Tests colocated in `src/` next to source (not in `tests/`) for domain logic
- UI/integration tests go in `tests/`
- No new npm deps, no Rust changes
