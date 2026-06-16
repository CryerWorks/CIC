import { QUIZ_SYSTEM_PROMPT } from "../../prompts/quiz";
import type { AnswerEvaluation } from "./types";

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

/** Input for buildEvaluationPrompt */
export interface EvaluationPromptInput {
  question: string;
  learnerAnswer: string;
  referenceAnswer: string;
}

/**
 * Build the message array for AI evaluation of a learner's answer.
 */
export function buildEvaluationPrompt(input: EvaluationPromptInput) {
  const { question, learnerAnswer, referenceAnswer } = input;

  const systemContent = `${QUIZ_SYSTEM_PROMPT}

You are now in EVALUATION MODE. You MUST evaluate the learner's answer against the reference answer.

Question: ${question}
Reference answer: ${referenceAnswer}
Learner's answer: ${learnerAnswer}

Score their answer as one of:
- "correct" — the learner captured the key points from the reference
- "partial" — the learner got some points but missed important ones
- "missed" — the learner was significantly wrong or omitted key information

Then provide a brief explanation of what was correct and what was missed.`;

  return [
    { role: "system" as const, content: systemContent },
    { role: "user" as const, content: `Evaluate my answer to: "${question}"

My answer: ${learnerAnswer}

Reference answer: ${referenceAnswer}` },
  ];
}

/**
 * Parse AI evaluation response into an AnswerEvaluation.
 */
export function parseEvaluation(text: string): AnswerEvaluation {
  // Default to "missed" if parsing fails
  const defaultEval: AnswerEvaluation = { score: "missed", explanation: "Could not parse AI evaluation." };

  const scoreMatch = text.match(/Score:\s*(correct|partial|missed)/i);
  const explanationMatch = text.match(/Explanation:\s*([\s\S]+)/i);

  if (!scoreMatch) return defaultEval;

  return {
    score: scoreMatch[1].toLowerCase() as "correct" | "partial" | "missed",
    explanation: explanationMatch?.[1]?.trim() ?? "No explanation provided.",
  };
}
