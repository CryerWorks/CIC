# Implementation Plan: AI Retrieval Practice Quizzes (F5)

**Branch**: `019-retrieval-quizzes` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

## Summary

Build the retrieval quiz feature — on-demand quiz generation from Course material, single-question UI with answer-reveal, self-rating (got it / close / missed), and card-spawning from missed items. Surface-form variability via lightweight `quiz_sessions` records. A single AI call per quiz (not conversational like Feynman). Reuses router.chat() (016), RAG search (017), createCard (010), card_resources (010).

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) — no Rust changes, no new Tauri plugins.

**Primary Dependencies**: Existing AI router (016), RAG hook (017), card creation (010), existing UI component library.

**Storage**: Additive migration `m0011` adds `quiz_sessions` table (id, vault_id, course_id, topic, questions JSON, created_at). Minimal — just enough for surface-form variability.

**Testing**: Vitest. Unit tests for quiz prompt assembly, question parsing, self-rating state machine. Integration tests with fake chat router. UI tests for Quiz panel.

**Performance**: Single AI call per quiz (batch). Quiz generation under 15s (RAG retrieval + AI response).

**Constraints**: No new npm deps. No new Rust commands. Reuses existing card infrastructure.

## Constitution Check

### I. Vault is Canonical and Sacred — PASS
- Quiz results are NOT written to vault. Cards spawned from missed items use existing VaultWriter path (010). `quiz_sessions` is SQLite-only.

### II. AI Vendor-Agnostic, Not Oracle — PASS
- All quiz generation via `router.chat('reasoning', …)` with `containsVaultContent: true`. Lockdown gate enforced. AI generates questions — learner self-rates.

### III. Preserve Desirable Difficulty — PASS
- Answers withheld until learner submits. Self-rating (not auto-graded). Quiz is learner-triggered. No mastery tracking.

### IV. Interface-First, Deep Modules — PASS
- `QuizGenerator` interface (generate, parseQuestions, saveRecord). `useQuiz()` hook. Features consume the hook.

### V. Spec-Driven Development — PASS

### Gate Result: ALL PASS

## Project Structure

```text
src/
├── ai/
│   ├── prompts/
│   │   └── quiz.ts              # NEW — quiz generation system prompt
│   └── features/
│       └── quiz/                # NEW
│           ├── types.ts          # QuizSession, QuizQuestion, SelfRating
│           ├── generator.ts      # QuizGenerator interface + impl
│           ├── prompt.ts         # buildQuizPrompt()
│           └── hooks/
│               └── useQuiz.ts   # React hook
├── features/
│   └── quiz/                    # NEW
│       ├── QuizPanel.tsx         # Main quiz UI
│       ├── QuestionCard.tsx      # Single question view
│       ├── AnswerReveal.tsx      # AI answer + self-rating
│       └── QuizSummary.tsx       # Results + card-spawn
├── db/
│   ├── migrations/
│   │   └── m0011_quiz_sessions.ts
│   └── repositories/
│       └── quizSessions.ts
```

## Research

### R1: Quiz prompt design — single AI call with structured format
Format: `Q: <question>\nA: <answer>` patterns, parsed client-side after generation.

### R2: Surface-form variability — lightweight quiz_sessions records
Store previous question texts as JSON, include in prompt: "Here are questions from your last quiz on this course: [...]. Generate different questions — vary the framing, context, and examples while testing the same concepts."

### R3: Test strategy — fake chat router returning pre-formatted quiz output
Same pattern as 018. Mock router returns Q:/A: formatted text.

### R4: Migration m0011 — quiz_sessions table
Minimal: id, vault_id, course_id, topic, questions (JSON TEXT), created_at.
