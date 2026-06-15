import { QUIZ_SYSTEM_PROMPT } from "../../prompts/quiz";

/** Input for buildQuizPrompt */
export interface QuizPromptInput {
  topic: string;
  contextChunks: string[];
  previousQuestions?: string[];
  count?: number;
}

/**
 * Build the full message array for router.chat('reasoning', …) to generate quiz questions.
 *
 * Injects the quiz system prompt + RAG context + optional previous questions
 * for surface-form variability + topic specification.
 * Pure function — no side effects, no I/O.
 */
export function buildQuizPrompt(input: QuizPromptInput) {
  const { topic, contextChunks, previousQuestions, count = 5 } = input;

  // Build the system message with count substituted
  let systemContent = QUIZ_SYSTEM_PROMPT.replace("{N}", String(count));

  if (contextChunks.length > 0) {
    systemContent += `\n\nPROVIDED CONTEXT:\n`;
    systemContent += `--- BEGIN CONTEXT ---\n`;
    for (let i = 0; i < contextChunks.length; i++) {
      systemContent += `[${i + 1}] ${contextChunks[i]}\n`;
    }
    systemContent += `--- END CONTEXT ---\n`;
  } else {
    systemContent += `\n\n(No grounding context available — rely on general knowledge.)\n`;
  }

  if (previousQuestions && previousQuestions.length > 0) {
    systemContent += `\n\nPREVIOUS QUIZ QUESTIONS (for surface-form variability — generate DIFFERENT questions):\n`;
    for (const q of previousQuestions) {
      systemContent += `- ${q}\n`;
    }
  }

  const userContent = `Generate ${count} retrieval questions on the topic: "${topic}"`;

  return [
    { role: "system" as const, content: systemContent },
    { role: "user" as const, content: userContent },
  ];
}

/**
 * Parse AI response text into QuizQuestion[] by extracting Q:/A: pairs.
 * Handles varying whitespace, extra text before/after the Q/A block, and
 * partial formatting gracefully.
 */
export function parseQuizResponse(text: string): Array<{ question: string; answer: string }> {
  const questions: Array<{ question: string; answer: string }> = [];

  // Split by lines starting with Q: (possibly after whitespace) and parse each block
  const blocks = text.split(/(?=^[ \t]*Q:\s)/m);

  for (const block of blocks) {
    const qMatch = block.match(/^[ \t]*Q:\s*(.*?)[ \t]*\n[ \t]*A:\s*([\s\S]*)$/);
    if (qMatch) {
      const question = qMatch[1].trim();
      const answer = qMatch[2].trim();
      if (question && answer) {
        questions.push({ question, answer });
      }
    }
  }

  return questions;
}
