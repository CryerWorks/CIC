# TESTS: 018-feynman-tutor

## Already green (22 tests)
- `src/ai/features/feynman/prompt.test.ts` — 7 tests (system prompt, context injection, truncation, role mapping)
- `src/ai/features/feynman/tutor.test.ts` — 11 tests (sendMessage, streaming, RAG search, multi-turn, summarize, save, error handling)
- `src/db/migrations/m0010.test.ts` — 4 tests (version bump, schema, indexes, CHECK constraint)

## To write

### T012: useFeynmanTutor hook tests
**File**: `src/ai/features/feynman/hooks/useFeynmanTutor.test.ts`
- Renders hook with fake provider tree
- Tests: initial state empty, sendMessage adds messages, streaming updates in-place, error state, reset clears

### T018: FeynmanPanel UI tests
**File**: `tests/features/feynman/FeynmanPanel.test.tsx`
- Mock `useFeynmanTutor` returning controlled state
- Tests: render, send button triggers, streaming indicator visible, close with unsaved gaps shows dialog, close without gaps closes immediately

### T022: Gap writer tests
**File**: `src/features/feynman/gapWriter.test.ts`
- Tests: session writeup target appends to existing note, standalone creates new note with frontmatter, merging into existing gaps section, empty gaps list is no-op

### T025: feynmanGaps repository tests
**File**: `src/db/repositories/feynmanGaps.test.ts`
- Tests: insert, list open, count by course, vault scoping, cascade on vault/course delete, reconciliation marks completed

### T030: Citation tests
**File**: `src/features/feynman/FeynmanCitation.test.tsx`
- Tests: renders citation chip, click opens source, uncertainty flag badge, grayed-out deleted source, multiple citations in one message
