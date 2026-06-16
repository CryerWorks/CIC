# Handoff: 024 — Cards + Feynman + Quiz Major Refactor

**Branch**: `024-card-feynman-quiz-refactor`

## Purpose

Fix three systemic design flaws where the AI assistants misunderstood CIC's core learning model:

1. **Cards are MEMORY GAME** — they test recall with Q+A pairs, not open-ended prompts. Every card MUST have a `back` (answer). Density: 3-5 cards per reading source per session, not 3 per course.
2. **Feynman is AI-DRIVEN** — the AI picks concepts from session readings and interrogates the learner. The learner does NOT volunteer concepts.
3. **Quiz is AI-EVALUATED** — the AI compares the learner's answer to the reference and scores/explains. Not self-rated.

## Tasks

### Phase 1: Constitution + Card Backs
- T001: Revise `.specify/memory/constitution.md` III — "Memory cards MUST have both fronts AND backs with correct answers."
- T002: Make `CardSeed.back` required in `src/ai/features/blueprint/types.ts`. Type: `string` with zod min(1).
- T003: Make `SessionCardSeed.back` required in `src/ai/features/research/types.ts`.
- T004: Update `src/ai/features/blueprint/validator.ts` — CardSeedSchema: `back: z.string().min(1)`. SessionCardSeedSchema: same.
- T005: Update `src/ai/prompts/research.ts` — remove "scaffold-only, no backs". Add "3-5 memory cards per reading source with specific recall questions AND correct answers." Add `back` field to JSON template.
- T006: Update `src/ai/features/blueprint/materializer.ts` — `createCard(db, {front, back, ...})` — include the back field in card creation.

### Phase 2: Inverted Feynman (AI-driven interrogation)
- T007: Update `src/ai/prompts/socratic.ts` — invert prompt: "From the session sources below, pick a key concept the learner should understand and ask them to explain it to you as if you're a beginner. Probe their understanding and identify gaps."
- T008: Add `startInterrogation(sources: SessionSource[])` to FeynmanTutor interface + impl in `src/ai/features/feynman/tutor.ts` and `tutorImpl.ts`. Sources are injected from session data — the AI picks concepts from them.
- T009: Add `FeynmanInterrogation` step to Active Study completion — in `src/features/loop/steps/SelfTestStep.tsx`, after readings are marked done, automatically launch Feynman with session sources.
- T010: Add session-scoped entry to `useFeynmanTutor` hook — accept session sources, start interrogation with them.
- T011: Update FeynmanPanel UI to show "AI is preparing questions from your reading…" with loading state. Show source name the AI is questioning from.

### Phase 3: AI-Evaluated Quizzes
- T012: Update `src/ai/prompts/quiz.ts` — prompt instructs AI to evaluate each answer against the reference, explain what was missed, score (correct/partial/missed).
- T013: Update `src/ai/features/quiz/generator.ts` — add `evaluateAnswer()` or extend generator to accept learner answers and return scores + explanations.
- T014: Update `src/ai/features/quiz/hooks/useQuiz.ts` — submit answer → AI evaluates → show score + gap explanation. Remove self-rating buttons.
- T015: Update `src/features/quiz/AnswerReveal.tsx` — show AI evaluation (score, gap explanation) instead of Got it/Close/Missed buttons.

### Phase 4: Integration + Gates
- T016: Update `src/features/quiz/QuestionCard.tsx` — remove self-rating, show AI eval result.
- T017: Update `src/features/quiz/QuizSummary.tsx` — counts from AI evaluation, not self-rating.
- T018: Migrate existing cards: any card without a `back` field gets `back: "[back not yet provided]"` so the schema doesn't break existing data.
- T019: Quality gates: `npm run test`, `npm run lint`, `npx tsc --noEmit` all green.

## Architecture rules
- No new npm deps. No Rust changes.
- All AI via `router.chat('reasoning', …)` with `containsVaultContent: true`
- VaultWriter for all vault writes
- Features consume hooks, never import adapters directly
- Tests colocated in src/ for domain logic, tests/ for UI

## Key: Cards are memory game. Feynman is AI-led. Quiz is AI-evaluated.
