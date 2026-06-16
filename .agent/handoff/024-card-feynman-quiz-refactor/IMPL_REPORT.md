# Implementation Report: 024 — Cards + Feynman + Quiz Major Refactor

## Summary

Fixed three systemic design flaws in CIC's core learning model:
1. **Cards are MEMORY GAME** with required Q+A backs
2. **Feynman is AI-DRIVEN** — AI picks concepts from session sources
3. **Quiz is AI-EVALUATED** — no self-rating

## Files Changed

| File | Change |
|------|--------|
| `.specify/memory/constitution.md` | T001: Added card Q+A pair and density rules to Principle III |
| `src/ai/features/blueprint/types.ts` | T002+T003: Made CardSeed.back + SessionCardSeed.back required |
| `src/ai/features/blueprint/validator.ts` | T004: Updated zod schemas (min(1) on back) |
| `src/ai/prompts/research.ts` | T005: Removed "scaffold-only, no backs"; added 3-5 cards per source with backs |
| `src/ai/features/blueprint/materializer.ts` | T006: createCard calls include back field |
| `src/ai/prompts/socratic.ts` | T007: Inverted to AI-driven interrogation from session sources |
| `src/ai/features/feynman/tutor.ts` | T008: Added SessionSource re-export, startInterrogation to interface |
| `src/ai/features/feynman/tutorImpl.ts` | T008: Implemented startInterrogation |
| `src/ai/features/feynman/prompt.ts` | T008: Added buildInterrogationPrompt |
| `src/features/loop/steps/SelfTestStep.tsx` | T009: Derives session sources from assignments, passes to FeynmanPanel |
| `src/ai/features/feynman/hooks/useFeynmanTutor.ts` | T010: Added startInterrogation, currentSourceName, isInterrogating |
| `src/features/feynman/FeynmanPanel.tsx` | T011: AI-driven auto-launch, loading state "Analyzing your reading…", source name |
| `src/ai/prompts/quiz.ts` | T012: AI evaluates answers against reference (correct/partial/missed) |
| `src/ai/features/quiz/types.ts` | T013: Added AnswerEvaluation type, "evaluating" status |
| `src/ai/features/quiz/generator.ts` | T013: Added evaluateAnswer() to QuizGenerator interface + impl |
| `src/ai/features/quiz/prompt.ts` | T013: Added buildEvaluationPrompt + parseEvaluation |
| `src/ai/features/quiz/hooks/useQuiz.ts` | T014: Replaced self-rating with AI evaluation flow |
| `src/features/quiz/AnswerReveal.tsx` | T015: Shows AI eval (score badge, explanation), "Next Question" button |
| `src/features/quiz/QuizPanel.tsx` | T016: Integrated AI eval, added "evaluating" state |
| `src/features/quiz/QuizSummary.tsx` | T017: Counts from AI evaluation scores |
| `src/db/repositories/cards.ts` | T018: Added ensureCardBack() helper |
| `src/db/migrations/m0015_card_backs.ts` | T018: Migration to backfill empty card backs |
| `src/db/migrations/index.ts` | T018: Registered m0015CardBacks |
| `src/ai/features/blueprint/generator.test.ts` | T019: Added `back` to mock CardSeed JSON |
| `src/ai/features/blueprint/materializer.test.ts` | T019: Updated assertion to expect real backs |
| `src/ai/features/blueprint/validator.test.ts` | T019: Added `back` to CardSeed test data |
| `src/ai/features/research/engine.test.ts` | T019: Added `back` to CardSeed test data |
| `tests/features/feynman/FeynmanPanel.test.tsx` | T019: Updated empty state text assertion |
| `tests/features/quiz/QuizPanel.test.tsx` | T019: Rewritten for AI evaluation flow |
| `src/db/migrate.test.ts` | T019: Updated version from 14→15 |
| `src/db/migrate.evolution.test.ts` | T019: Bumped probe migration to v16, version refs |
| `src/db/migrate.lossless.test.ts` | T019: Bumped probe to v16, version refs |
| `src/db/migrations/m0009.test.ts` | T019: Updated expected version 14→15 |
| `src/db/migrations/m0010.test.ts` | T019: Updated expected version 14→15 |
| `src/db/repositories/settings.test.ts` | T019: Updated expected version 14→15 |

## Quality Gate Results

| Gate | Result |
|------|--------|
| All tests pass (136 files, 816 tests) | ✅ PASS |
| ESLint clean | ✅ PASS |
| TypeScript strict (`tsc --noEmit`) | ✅ PASS |
| No debug artifacts | ✅ PASS |
| No TODO/FIXME/HACK | ✅ PASS |
| Public APIs have explicit type signatures | ✅ PASS |

## Design Decisions

1. **CardSeed.back is required, not optional**: Changed from `backHint?: string` to `back: string`. This is a breaking change for any code that constructs cards without backs. All callers updated.

2. **SessionSource re-exported from blueprint**: Rather than duplicating the type, Feynman re-exports `SessionSource` from blueprint types. Avoids type drift.

3. **AI evaluation replaces self-rating completely**: The `SelfRating` type is kept for backward compatibility but is no longer used by the quiz flow. `submitRating` removed from hook, replaced by `goToNext`.

4. **Original bug fix in sendMessage**: The `sendMessage` in `useFeynmanTutor` was calling `startConversation()` before every message (resetting the conversation). Removed; now calls it only on first message or when explicitly starting an interrogation.

5. **Migration v15 added**: Backfills empty/whitespace-only card backs with `"[back not yet provided]"`. No schema change — SQL already has `back TEXT`.

## Limitations / Known Issues

- `AnswerEvaluation` scores use string literals `"correct" | "partial" | "missed"` which match the old `SelfRating` pattern for card spawning compatibility.
- `evaluateAnswer` does not stream — it makes a separate `router.chat` call per answer. This could be slow on larger quizzes. Future optimization: batch evaluations or use streaming in the reveal UI.
- Quiz persistence still stores `questions: JSON.stringify(QuizQuestion[])` without evaluation data. AI evaluations are only in-memory via the `evaluations` Map.
