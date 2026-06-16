import type { QuizQuestion, AnswerEvaluation } from "./types";
import type { ChatMessage, ChatOptions } from "../../provider";
import type { AIRole } from "../../config";
import { buildQuizPrompt, buildEvaluationPrompt, parseQuizResponse, parseEvaluation } from "./prompt";

/** Shape of the chat chunk yielded by the router. */
interface ChatChunkLike {
  delta: string;
}

/**
 * Seam interface for quiz generation.
 *
 * Features consume the `useQuiz()` hook, which wraps an instance
 * of this interface. The concrete implementation orchestrates RAG retrieval
 * and router.chat('reasoning', …).
 */
export interface QuizGenerator {
  /** Generate a batch of quiz questions for the given topic and context. */
  generate(
    topic: string,
    contextChunks: string[],
    previousQuestions?: string[],
    count?: number,
  ): Promise<QuizQuestion[]>;

  /**
   * Evaluate a learner's answer against the reference answer using AI.
   * Returns score (correct/partial/missed) and an explanation of gaps.
   */
  evaluateAnswer(question: string, learnerAnswer: string, referenceAnswer: string): Promise<AnswerEvaluation>;
}

/** Options for constructing QuizGeneratorImpl. */
export interface QuizGeneratorOpts {
  router: {
    chat: (role: AIRole, messages: ChatMessage[], opts: ChatOptions) => AsyncIterable<ChatChunkLike>;
  };
}

/**
 * Concrete QuizGenerator implementation.
 *
 * Uses the AI router with the 'reasoning' role to generate retrieval practice
 * questions from provided course content chunks. Parses Q:/A: formatted output.
 */
export class QuizGeneratorImpl implements QuizGenerator {
  constructor(private opts: QuizGeneratorOpts) {}

  async generate(
    topic: string,
    contextChunks: string[],
    previousQuestions?: string[],
    count?: number,
  ): Promise<QuizQuestion[]> {
    const messages = buildQuizPrompt({
      topic,
      contextChunks,
      previousQuestions,
      count,
    });

    let fullText = "";
    try {
      for await (const chunk of this.opts.router.chat("reasoning", messages, {
        containsVaultContent: true,
      })) {
        fullText += chunk.delta ?? "";
      }
    } catch (e) {
      throw new Error(
        `Quiz generation failed: ${e instanceof Error ? e.message : "AI provider unavailable"}`,
      );
    }

    const parsed = parseQuizResponse(fullText);

    if (parsed.length === 0) {
      throw new Error("Quiz generation returned no parseable questions");
    }

    return parsed;
  }

  async evaluateAnswer(
    question: string,
    learnerAnswer: string,
    referenceAnswer: string,
  ): Promise<AnswerEvaluation> {
    const messages = buildEvaluationPrompt({
      question,
      learnerAnswer,
      referenceAnswer,
    });

    let fullText = "";
    try {
      for await (const chunk of this.opts.router.chat("reasoning", messages, {
        containsVaultContent: true,
      })) {
        fullText += chunk.delta ?? "";
      }
    } catch (e) {
      throw new Error(
        `Answer evaluation failed: ${e instanceof Error ? e.message : "AI provider unavailable"}`,
      );
    }

    return parseEvaluation(fullText);
  }
}
