# Implementation Report: 019-retrieval-quizzes

## Diff Summary

### New Files (15)

| File | Purpose |
|------|---------|
| `src/db/migrations/m0011_quiz_sessions.ts` | Migration: `quiz_sessions` table with indexes |
| `src/ai/prompts/quiz.ts` | Centralized quiz system prompt (versioned) |
| `src/ai/features/quiz/types.ts` | QuizQuestion, SelfRating, QuizSession, QuizStatus, SpawnResult |
| `src/ai/features/quiz/prompt.ts` | `buildQuizPrompt()` + `parseQuizResponse()` |
| `src/ai/features/quiz/generator.ts` | `QuizGenerator` interface + `QuizGeneratorImpl` |
| `src/ai/features/quiz/generator.test.ts` | 13 tests: parsing, error handling, surface-form variability |
| `src/ai/features/quiz/hooks/useQuiz.ts` | `useQuiz()` hook — state machine, AI generation, persistence, card spawn |
| `src/ai/features/quiz/hooks/useQuiz.test.tsx` | 4 tests: initial state, vault error handling, reset |
| `src/features/quiz/QuizPanel.tsx` | Main quiz panel with all states (idle/generating/answering/revealing/summary/error) |
| `src/features/quiz/QuestionCard.tsx` | Single question display + answer textarea |
| `src/features/quiz/AnswerReveal.tsx` | Learner answer vs AI answer side-by-side + self-rating buttons |
| `src/features/quiz/QuizSummary.tsx` | Results stats, detail list, spawn cards button |
| `src/db/repositories/quizSessions.ts` | `insertQuizSession()`, `getLastQuizForCourse()` |
| `src/db/repositories/quizSessions.test.ts` | 6 tests: insert, getLatest, vault scoping |
| `tests/features/quiz/QuizPanel.test.tsx` | 14 tests: all UI states, interactions, close confirmation |

### Modified Files (10)

| File | Change |
|------|--------|
| `src/db/migrations/index.ts` | Registered m0011 migration |
| `src/db/migrate.test.ts` | Version 10→11, table count 24→25, added quiz_sessions to ALL_TABLES |
| `src/db/migrate.evolution.test.ts` | Version references 10→11, dummyV11→dummyV12 |
| `src/db/migrate.lossless.test.ts` | Version references 10→11, addColumnV11→addColumnV12 |
| `src/db/migrations/m0010.test.ts` | user_version expectation 10→11 |
| `src/db/migrations/m0009.test.ts` | user_version expectation 10→11 |
| `src/db/repositories/settings.test.ts` | migration.to expectation 10→11 |
| `src/features/loop/steps/SelfTestStep.tsx` | Added "Retrieval Quiz" button + QuizPanel |
| `src/features/courses/CourseDetailRoute.tsx` | Added "Quiz this course" button + QuizPanel |
| `src/features/feynman/FeynmanPanel.tsx` | Added "Quiz me on these gaps" button + QuizPanel |

## Quality Gate Results

| Gate | Result |
|------|--------|
| All tests pass (`npm run test`) | ✅ 128 files, 727 tests |
| ESLint 0 errors (`npm run lint`) | ✅ 0 errors, 0 warnings |
| TypeScript strict 0 errors (`npx tsc --noEmit`) | ✅ 0 errors |
| No new npm deps | ✅ |
| No Rust changes | ✅ |
| All AI calls via router.chat() with containsVaultContent:true | ✅ QuizGeneratorImpl uses `router.chat("reasoning", ..., {containsVaultContent: true})` |
| Lockdown gate enforced | ✅ Inherits from router |
| Quiz prompt in `src/ai/prompts/quiz.ts` | ✅ Centralized, versioned |
| Features consume `useQuiz()` hook — never import generator directly | ✅ QuizPanel imports useQuiz only |

## Design Decisions

1. **Deep module pattern (Ousterhout)**: The `QuizGeneratorImpl` hides all AI prompt construction, RAG context injection, and Q:/A: parsing behind a simple `generate(topic, contextChunks)` method.

2. **No generator imports in UI**: `QuizPanel` consumes `useQuiz()` only; the generator is an implementation detail of the hook (Constitution IV).

3. **Surface-form variability**: The hook fetches the last quiz session for the same course via `getLastQuizForCourse()` and passes previous questions to the prompt builder. This happens inside `generate()` before the AI call.

4. **Card spawning**: Handled in `useQuiz().spawnCards()` — iterates missed items, calls existing `createCard()` from the cards repository.

5. **Close confirmation**: QuizPanel shows a confirmation dialog when the user closes during an active quiz (matching FeynmanPanel pattern).

6. **Self-rating**: Uses emojis as specified in SPEC.md (✅ Got it, 🟡 Close, ❌ Missed).

## Limitations & Known Issues

- No `card_resources` linking from spawned cards to quiz grounding resources (the hook doesn't track which resources were used as context). Marked as T010 enhancement.
- Hook tests are minimal due to complex provider stack — the core logic is tested through generator tests (T004: 13 tests) and UI integration tests (T011: 14 tests).
- The "Quiz me on these gaps" button in FeynmanPanel concatenates gap texts into a topic string (truncated to 200 chars) — works for small gap sets.
