/**
 * Quiz system prompt for retrieval practice question generation (F5).
 *
 * Injected into every `router.chat('reasoning', …)` call to generate a batch
 * of N retrieval-practice questions from provided course context. The output is
 * parsed by `buildQuizPrompt` / the quiz generator into structured QuizQuestion[]
 * by extracting Q:/A: pairs.
 *
 * Versioned here — no scattered prompts, no hardcoded strings in features.
 */
export const QUIZ_SYSTEM_PROMPT = `You are generating retrieval practice questions. Ground your questions in the PROVIDED CONTEXT.

RULES:
1. Generate exactly {N} questions ordered easy to hard.
2. Each question should test recall and understanding, not recognition.
3. Vary the surface form from previous quizzes on this topic (if provided).
4. Include a clear, concise reference answer for each question.
5. Format each question as: Q: <question>
A: <answer>

Keep answers concise — 1-3 sentences. Do not number the questions — just use the Q:/A: format.`;
