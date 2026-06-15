# TESTS: 019-retrieval-quizzes

## To write

### T004: QuizGenerator tests
- File: `src/ai/features/quiz/generator.test.ts`
- Mock router returning `Q: What is X?\nA: X is Y.\n\nQ: Explain Z.\nA: Z is...`
- Tests: parsing Q/A pairs, correct count, empty output, error propagation, lockdown gate

### T011: QuizPanel UI tests
- File: `tests/features/quiz/QuizPanel.test.tsx`
- Mock useQuiz returning controlled state
- Tests: generate button, question display, answer input, submit reveals answer, self-rating buttons, summary with counts, spawn cards button

## Integration test (manual/quickstart)
- Generate quiz from Course, answer all 5 questions, self-rate, spawn cards, verify cards in Course's card list
