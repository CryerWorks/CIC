# QUALITY GATES: 018-feynman-tutor

## Pre-merge gates

- [ ] All 34 tasks complete (T001–T034 marked [x] in tasks.md)
- [ ] `npm run test` — all tests green (target: 22 existing + new tests for phases 3-6)
- [ ] `npm run lint` — ESLint 0 errors
- [ ] `npm run tsc` — TypeScript strict 0 errors
- [ ] No new npm dependencies introduced
- [ ] No Rust changes introduced
- [ ] All vault writes through `VaultWriter` (Constitution I)
- [ ] All AI calls through `router.chat()` with `containsVaultContent: true` (Constitution II)
- [ ] Lockdown gate enforced (FR-010)
- [ ] Socratic prompt in `src/ai/prompts/socratic.ts` — centralized, versioned
- [ ] Features consume `useFeynmanTutor()` hook — never import `FeynmanTutorImpl` directly

## Quickstart gates (manual `tauri dev`)

- [ ] Scenario A: Open Feynman Panel from Daily Loop
- [ ] Scenario B: Basic conversation (explain → AI questions)
- [ ] Scenario C: RAG-grounded question with citation
- [ ] Scenario D: Multi-turn Socratic behavior (never lectures)
- [ ] Scenario E: Summarize Gaps
- [ ] Scenario F: Save gaps to session writeup
- [ ] Scenario G: Save gaps as standalone note
- [ ] Scenario H: Citation click-through opens source
- [ ] Scenario I: Uncertainty flag without RAG context
- [ ] Scenario J: Lockdown mode block
- [ ] Scenario K: Provider offline error handling
- [ ] Scenario L: Dashboard gap reconciliation after vault edit
