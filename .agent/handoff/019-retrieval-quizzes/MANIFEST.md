# Handoff: 019-retrieval-quizzes — AI Retrieval Practice Quizzes (F5)

**Feature**: 019-retrieval-quizzes | **Branch**: `019-retrieval-quizzes` | **Handoff**: 2026-06-15

## Scope

Build the retrieval quiz feature: on-demand AI quiz generation from Course material, single-question answer-reveal UI, self-rating, card-spawning from missed items, and surface-form variability.

## Dependencies

| Dependency | Feature | Available |
|-----------|---------|-----------|
| `router.chat('reasoning', …)` | 016 | ✅ |
| `useRAG().search()` | 017 | ✅ |
| `createCard()` + `card_resources` | 010 | ✅ |
| `VaultWriter` | 005/006 | ✅ |
| UI component library | Design doc | ✅ |

## What to build

### Phase 1: Setup (2 tasks)
- T001: Migration `m0011_quiz_sessions.ts` — quiz_sessions(id, vault_id, course_id, topic, questions TEXT, created_at). Register in index.ts.
- T002: Quiz types + prompt in `src/ai/prompts/quiz.ts` and `src/ai/features/quiz/types.ts`

### Phase 2: Core (4 tasks)
- T003: `QuizGenerator` interface + `buildQuizPrompt()` — generates Q:/A: formatted quiz via router.chat
- T004: Quiz generator tests with fake router
- T005: Quiz panel UI — `QuizPanel.tsx`, `QuestionCard.tsx`, `AnswerReveal.tsx`, `QuizSummary.tsx` in `src/features/quiz/`
- T006: `useQuiz()` hook in `src/ai/features/quiz/hooks/useQuiz.ts`

### Phase 3: Wire + Surface Form + Card Spawn (4 tasks)
- T007: Wire Quiz button into Daily Loop, Course detail, Feynman panel
- T008: `quizSessions` repo — insert, getByCourse
- T009: Surface-form variability — include previous questions in prompt
- T010: Card spawning from missed items via existing createCard

### Phase 4: Polish (2 tasks)
- T011: Quiz panel UI tests
- T012: Quality gates: `npm run test`, `npm run lint`, `npx tsc --noEmit`

## Key Interfaces

```ts
interface QuizQuestion {
  question: string;
  answer: string; // AI reference answer, withheld until learner submits
}

interface QuizSession {
  questions: QuizQuestion[];
  currentIndex: number;
  ratings: Map<number, 'got-it' | 'close' | 'missed'>;
  learnerAnswers: Map<number, string>;
}

interface QuizGenerator {
  generate(topic: string, contextChunks: string[], courseId?: string): Promise<QuizQuestion[]>;
}
```

## Files to create

```
src/ai/prompts/quiz.ts
src/ai/features/quiz/types.ts
src/ai/features/quiz/generator.ts
src/ai/features/quiz/prompt.ts
src/ai/features/quiz/hooks/useQuiz.ts
src/features/quiz/QuizPanel.tsx
src/features/quiz/QuestionCard.tsx
src/features/quiz/AnswerReveal.tsx
src/features/quiz/QuizSummary.tsx
src/db/migrations/m0011_quiz_sessions.ts
src/db/repositories/quizSessions.ts
```

## Architecture rules (same as 018)
- All AI via `router.chat()` with `containsVaultContent: true`
- UI consumes `useQuiz()` hook — never imports generator directly
- Tests colocated in `src/` (domain) or `tests/` (UI)
- No new npm deps, no Rust changes
