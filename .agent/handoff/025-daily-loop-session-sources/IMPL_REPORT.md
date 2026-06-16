# Implementation Report — 025 Daily Loop Session Sources

## Diff Summary

| Metric | Value |
|--------|-------|
| Files changed | 18 |
| Lines added | ~950 |
| Lines removed | ~40 |

### Files Created (6)
- `src/db/migrations/m0016_session_source_details.ts` — ALTER TABLE session_sources
- `src/db/models/sessionSource.ts` — SessionSourceSchema + type
- `src/db/repositories/sessionSources.ts` — getSourcesForSession, markSourceDone, areAllSourcesDone
- `src/features/loop/SessionSourceCard.tsx` — Rich media card with favicon/YouTube thumbnails
- `src/features/loop/SessionSourceCard.test.tsx` — 10 tests
- `src/features/loop/steps/PlanningStep.tsx` — Session ordering within milestone
- `src/features/loop/steps/PlanningStep.test.tsx` — 5 tests

### Files Modified (11)
- `src/db/migrations/index.ts` — Registered m0016
- `src/db/models/index.ts` — Exported SessionSourceSchema + type
- `src/db/index.ts` — Exported sessionSources repo
- `src/db/repositories/sessions.ts` — Added getNextUnlockedSession
- `src/db/repositories/settings.test.ts` — Version bump 15→16
- `src/db/migrations/m0009.test.ts` — Version bump 15→16
- `src/db/migrations/m0010.test.ts` — Version bump 15→16
- `src/db/migrate.test.ts` — Version bump 15→16
- `src/db/migrate.evolution.test.ts` — Version bump to 17 for probe migrations
- `src/db/migrate.lossless.test.ts` — Version bump to 17 for probe migrations
- `src/features/loop/steps/ActiveStudyStep.tsx` — Source card grid + progress + legacy fallback
- `src/features/loop/steps/ActiveStudyStep.test.tsx` — Added source card mode tests
- `src/features/loop/useDailyLoop.ts` — Load sessionSources, per-source completion, milestone sessions
- `src/features/loop/LoopRoute.tsx` — PlanningStep + sessionSources pass-through
- `src/features/loop/steps/SelfTestStep.tsx` — Feynman gated on allSourcesDone
- `src/ai/prompts/research.ts` — Added startPage/endPage/startSeconds/endSeconds
- `src/ai/features/blueprint/types.ts` — Extended SessionSource interface
- `src/ai/features/blueprint/materializer.ts` — Persists new fields to session_sources

## Gate Results

| Gate | Result |
|------|--------|
| All tests pass (vitest) | ✅ 138 files, 835 tests |
| TypeScript (`tsc --noEmit`) | ✅ Clean |
| Linter (`npm run lint`) | ✅ Clean |
| No debug artifacts | ✅ None found |
| No TODO/FIXME/HACK | ✅ None found |
| Public APIs have types | ✅ All exported functions/params typed |

## Design Decisions

1. **Migration strategy**: Used `ALTER TABLE ADD COLUMN` with the existing `PRAGMA table_info` guard + "duplicate column name" catch pattern (established by the codebase). This is safe for production's pooled adapter which can't wrap real transactions.

2. **Deep module — SessionSourceCard**: The card component encapsulates all thumbnail logic (YouTube ID parsing, favicon.ico URL construction, fallback emoji) behind a simple `{ source, onToggleDone }` interface. The HTML structure uses the app's existing Tailwind design language (charcoal panels, purple brand accents, border-line).

3. **Backward compatibility**: `ActiveStudyStep` has dual mode — when `sessionSources` exist (Feature 023 era), it renders the rich card grid; when they don't (pre-m0014 sessions), it falls back to the legacy assignment list. This is zero-migration for existing data.

4. **Feynman gating**: The gate has two layers:
   - **UI hint**: ActiveStudyStep shows "finish all to unlock Feynman"
   - **Button disable**: SelfTestStep disables the Feynman button when `allSourcesDone` is false
   - The gate is non-blocking (just a hint + disabled button) — the learner could theoretically still navigate, but the button won't fire

5. **Milestone sessions in PlanningStep**: Loaded from `listCourseSessions`, filtered by matching milestone_id. Sessions show as completed/active/locked based on their status relative to the current session. This is an in-memory view, not a sequential gate — the LoopRoute still lists all planned sessions independently.

6. **No new npm deps**: Thumbnails use static URLs (favicon.ico, img.youtube.com). No image processing, no dynamic generation.

## Known Issues / Limitations

- **Thumbnail reliability**: Favicon.ico URLs may return 404 or generic icons for sites that don't use standard paths. YouTube thumbnails are reliable. The fallback emoji always renders.
- **PlanningStep uses in-memory data**: The milestone session ordering is computed from `listCourseSessions` in `useDailyLoop`, meaning it filters by matching `milestone_id`. If a session has no milestone_id, all course sessions are shown.
- **areAllSourcesDone import removed**: The function exists in the repo but `useDailyLoop` uses `useMemo` instead of a separate DB query to compute completions (avoiding an extra async dependency).
