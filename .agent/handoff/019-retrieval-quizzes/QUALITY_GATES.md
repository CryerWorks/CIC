# QUALITY GATES: 019-retrieval-quizzes

- [ ] All tests pass (`npm run test`)
- [ ] ESLint 0 errors (`npm run lint`)
- [ ] TypeScript strict 0 errors (`npx tsc --noEmit`)
- [ ] No new npm deps
- [ ] No Rust changes
- [ ] All AI calls via `router.chat()` with `containsVaultContent: true`
- [ ] Lockdown gate enforced
- [ ] Quiz prompt in `src/ai/prompts/quiz.ts` — centralized, versioned
- [ ] Features consume `useQuiz()` hook — never import generator directly
