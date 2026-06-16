# Handoff: 025 — Daily Loop with Session Sources

**Branch**: `025-daily-loop-session-sources`

## Goal

Rebuild the Daily Loop to display session sources as rich media cards with per-source checkmarks, sequential milestone gating, and favicon thumbnails. Sessions unlock in order within each milestone.

## Tasks (~10)

### T001: Migration m0016
`src/db/migrations/m0016_session_source_details.ts` — ALTER TABLE session_sources ADD: thumbnail_url TEXT DEFAULT '', start_page INTEGER, end_page INTEGER, start_seconds INTEGER, end_seconds INTEGER, description TEXT DEFAULT '', completed INTEGER DEFAULT 0. Register in index.ts.

### T002: Session Sources Repository
`src/db/repositories/sessionSources.ts` (NEW):
- `getSourcesForSession(db, sessionId)` → SessionSource[]
- `markSourceDone(db, sourceId)` → void
- `areAllSourcesDone(db, sessionId)` → boolean

### T003: SessionSourceCard Component
`src/features/loop/SessionSourceCard.tsx` (NEW):
- Props: `{ source: SessionSource; onToggleDone: () => void }`
- Renders: favicon thumbnail (img src=`{url}/favicon.ico` with fallback icon), title, type badge (📄 Reading / 🎬 Watching), page/timestamp info, "Open" link, [✓ Mark done] toggle
- Thumbnail: for YouTube URLs, use `https://img.youtube.com/vi/{id}/default.jpg` if parseable. Otherwise favicon.ico from URL host. Fallback: 📄/🎬 emoji.

### T004: Redesign ActiveStudyStep
`src/features/loop/steps/ActiveStudyStep.tsx` (MAJOR):
- Replace generic text input with SessionSourceCard grid
- Show progress: "X of Y sources completed — finish all to unlock Feynman"
- Per-source mark-done toggles

### T005: Redesign PlanningStep
`src/features/loop/steps/PlanningStep.tsx` (MODIFY):
- Show session ordering within milestone: ✅ completed, ▶ active, 🔒 locked
- `getNextUnlockedSession(courseId, milestoneId, db)` — returns first session not completed

### T006: Update useLoop
`src/features/loop/useLoop.ts` (MODIFY):
- Load sessionSources for active session
- Track per-source completion
- Defer Feynman step until all sources done for the session
- Sequential session gating within milestone

### T007: Update LoopRoute
`src/features/loop/LoopRoute.tsx` (MODIFY):
- Pass sessionSources data into ActiveStudyStep

### T008: Feynman Gate Check
`src/features/loop/steps/SelfTestStep.tsx` (MODIFY):
- Gate Feynman auto-launch on `areAllSourcesDone(activeSessionId)`

### T009: Extend Research Prompt
`src/ai/prompts/research.ts` (MODIFY):
- Add `startPage`, `endPage`, `startSeconds`, `endSeconds` to SessionSource JSON template

### T010: Quality Gates
`npm run test`, `npm run lint`, `npx tsc --noEmit` all green

## Architecture rules
- No new npm deps. No Rust changes.
- Thumbnails: static favicon.ico URLs + YouTube thumbnail URLs. No dynamic generation.
- Session gating: within milestone only (not across course)
- All state tracked in SQLite (session_sources.completed)
