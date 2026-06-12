# PLAN: 018-feynman-tutor — Remaining Implementation

**Input**: Phases 1-2 complete (migration, types, prompt, FeynmanTutor interface + impl + tests). 22 tests green.

## Phase 3: US1 Feynman Conversation (T011–T018)

### T011 [P] useFeynmanTutor hook
- **File**: `src/ai/features/feynman/hooks/useFeynmanTutor.ts`
- Creates `FeynmanTutorImpl` instance via `useMemo` with injected router (from `useAIRouter`), RAG search (from `useRAG`), vaultId (from `useActiveVaultId`), gapWriter, gapStore
- Manages React state: `messages`, `isActive`, `error`
- `sendMessage`: iterates `tutor.sendMessage()`, appends tokens to last message
- `summarizeGaps`: calls `tutor.summarizeGaps()`, returns gaps
- `saveGaps`: calls `tutor.saveGaps()`, returns count
- `reset`: calls `tutor.startConversation()`, clears state

### T012 [P] Hook tests
- **File**: `src/ai/features/feynman/hooks/useFeynmanTutor.test.ts`
- Uses `@testing-library/react` with fake providers (existing pattern from 017)
- Tests: message rendering, streaming update, error handling, reset

### T013 [P] FeynmanMessage component
- **File**: `src/features/feynman/FeynmanMessage.tsx`
- Learner messages: right-aligned, gray bubble
- Tutor messages: left-aligned, cyan bubble (AI output color per design doc)
- Streaming: shows blinking cursor while `isStreaming` is true
- Citations: renders `FeynmanCitation` chips inline (Phase 5)

### T014 FeynmanPanel component
- **File**: `src/features/feynman/FeynmanPanel.tsx`
- Props: `{ gapSaveTarget, onClose }`
- Layout: scrollable message list + text input at bottom + send button
- Typing indicator while AI generating
- "Summarize Gaps" button (appears after 2+ turns)
- Close button with confirmation dialog if `messages.length > 0` (FR-018)
- Intro message on first open

### T015 Wire into SelfTestStep
- **File**: `src/features/loop/SelfTestStep.tsx`
- Add "Feynman Tutor" button
- Opens FeynmanPanel as modal/overlay
- `gapSaveTarget.type: "session-writeup"`, `notePath` = session writeup path

### T016 Wire into Course detail
- **File**: Course detail route
- "Feynman Tutor" button with `scope: { courseId }`

### T017 Wire into Search Corpus
- **File**: `src/features/search/SearchCorpusRoute.tsx`
- "Feynman Tutor" button with no course scope

### T018 Panel UI tests
- **File**: `tests/features/feynman/FeynmanPanel.test.tsx`
- Mock `useFeynmanTutor()`, test render, send, streaming indicator, close warning

## Phase 4: US2 Gaps (T019–T025)

### T019 GapSummary component
- **File**: `src/features/feynman/GapSummary.tsx`
- Displays gap list with text
- "Save to Session" / "Save as Note" buttons (context-dependent)

### T020 feynmanGaps repository
- **File**: `src/db/repositories/feynmanGaps.ts`
- Exports functions taking `db: SqlExecutor`:
  - `insertGaps(db, input)` — batch INSERT
  - `listOpenGaps(db, vaultId)` — SELECT WHERE status='open' AND vault_id=?
  - `getOpenGapCountByCourse(db, vaultId)` — GROUP BY course_id with course title
  - `reconcileCompleted(db, vaultId)` — update completed status from vault scan
- Zod schema: `FeynmanGapRowSchema` already in types.ts

### T021 Gap vault writer
- **File**: `src/features/feynman/gapWriter.ts` (or `src/ai/features/feynman/gapWriter.ts`)
- `writeGapsToVault(gaps, target, vaultWriter)`
- For session-writeup: merge into existing note's `## Gaps from Feynman` section
- For standalone-note: create new note with `cic-type: feynman-gaps` frontmatter

### T023 Wire saveGaps
- Update `FeynmanTutorImpl.saveGaps()` in `tutorImpl.ts`
- Call `writeGapsToVault()` first, then `feynmanGaps.insertGaps()`

### T024 Dashboard tile
- **File**: `src/features/dashboard/DashboardView.tsx`
- Query `getOpenGapCountByCourse(vaultId)`
- Render "Gaps to Chase" tile with per-course counts
- Shown only if `count > 0`

## Phase 5: US3 Citations (T026–T030)

### T027 FeynmanCitation component
- **File**: `src/features/feynman/FeynmanCitation.tsx`
- Renders clickable chip: "[source name, locator]"
- onClick: opens source via existing opener (010/011)

### T028 Citation parsing
- Extend `FeynmanMessage` to parse `[source: Name, Locator]` from text
- Split content into text segments + Citation chips

### T029 Uncertainty flags
- Detect "⚠️ I'm reasoning from general knowledge"
- Render as warning badge next to message

## Phase 6: Polish (T031–T034)

### T031 Vault rescan reconciliation
- Extend `feynmanGaps.ts` `reconcileCompleted()`
- Scan vault files for `- [x]` items under `## Gaps from Feynman`
- Update `feynman_gaps.status → completed`

### T032 Refresh button
- "Refresh gaps" button on Dashboard tile
- Triggers `reconcileCompleted()`
