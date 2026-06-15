# PLAN: 019-retrieval-quizzes — File-by-file

## Phase 1: Setup

### T001: Migration m0011
- File: `src/db/migrations/m0011_quiz_sessions.ts`
- Table: quiz_sessions(id, vault_id, course_id, topic, questions TEXT, created_at)
- Index: idx_quiz_sessions_course on (course_id)
- Register in `src/db/migrations/index.ts`

### T002: Types + quiz prompt
- `src/ai/prompts/quiz.ts` — quiz system prompt with Q:/A: format instructions
- `src/ai/features/quiz/types.ts` — QuizQuestion, QuizSession, SelfRating enum, QuizRecord zod schema

## Phase 2: Core

### T003: QuizGenerator
- `src/ai/features/quiz/generator.ts` — QuizGenerator interface (generate method)
- `src/ai/features/quiz/prompt.ts` — buildQuizPrompt(topic, contextChunks, previousQuestions?, count?)
- Implementation: calls router.chat('reasoning', …), parses Q:/A: pairs from output

### T004: Generator tests
- `src/ai/features/quiz/generator.test.ts` — mock router returning Q:/A: formatted text
- Tests: question count, parsing, empty context, error handling

### T005: Quiz UI components
- `src/features/quiz/QuizPanel.tsx` — modal/overlay, progress bar, navigation
- `src/features/quiz/QuestionCard.tsx` — single question, text input, submit button
- `src/features/quiz/AnswerReveal.tsx` — AI answer + learner answer side-by-side, self-rating buttons (Got it / Close / Missed)
- `src/features/quiz/QuizSummary.tsx` — results table, "Spawn cards for missed" button

### T006: useQuiz hook
- `src/ai/features/quiz/hooks/useQuiz.ts`
- State: questions[], currentIndex, ratings, learnerAnswers, status (generating/answering/revealing/summary/error)
- generate(topic, scope?): fetches RAG context → calls QuizGenerator → sets questions
- submitAnswer(text): hides answer, moves to reveal
- submitRating(rating): moves to next question or summary
- spawnCards(): calls createCard for each missed item

## Phase 3: Wiring + Variability

### T007: Wire into entry points
- `SelfTestStep.tsx` — "Retrieval Quiz" button alongside Feynman button
- `CourseDetailRoute.tsx` — "Quiz this course" button
- `FeynmanPanel.tsx` — "Quiz me on these gaps" button (after gap summary)

### T008: quizSessions repo
- `src/db/repositories/quizSessions.ts`
- insertQuizSession(db, input): INSERT
- getLastQuizForCourse(db, vaultId, courseId): SELECT latest ORDER BY created_at DESC LIMIT 1

### T009: Surface-form variability
- In `buildQuizPrompt()`, if `previousQuestions` provided, add "Here are the questions from your last quiz. Generate DIFFERENT questions..."
- Hook fetches last quiz via getLastQuizForCourse, passes to generator

### T010: Card spawning
- In `useQuiz().spawnCards()`: for each missed item, call `createCard(db, {courseId, front: item.question, back: item.answer})` (existing repo from 010)
- Link `card_resources` to the quiz's grounding Resources
- Report per-card success/failure

## Phase 4: Polish

### T011: UI tests
- `tests/features/quiz/QuizPanel.test.tsx` — mock useQuiz, test flow

### T012: Quality gates
- `npm run test`, `npm run lint`, `npx tsc --noEmit` — all green

## Pattern references
- Migration: follow m0010 pattern (CREATE TABLE IF NOT EXISTS, indexes, register in index.ts)
- Hook: follow useFeynmanTutor pattern (DI-injected generator, React state)
- Panel: follow FeynmanPanel pattern (modal, close warning)
- Tests: colocated for domain logic, tests/ for UI
