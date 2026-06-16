/**
 * useQuiz hook (Feature 019). Wraps QuizGeneratorImpl and quiz state management
 * in a React-consumable interface. Features consume this hook — never import
 * QuizGeneratorImpl directly (Constitution IV).
 *
 * Quiz flow: generate -> answer -> AI evaluates -> reveal evaluation -> next question -> summary
 * Self-rating is replaced by AI evaluation (Constitution III: desirable difficulty).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useAIRouter } from "../../../../app/providers/AIProvider";
import { useVectorStore } from "../../../../app/providers/RAGProvider";
import { useActiveVaultId } from "../../../../app/providers/VaultProvider";
import { useDbState } from "../../../../app/providers/DbProvider";
import { createRetriever } from "../../../rag/retriever";
import { QuizGeneratorImpl } from "../generator";
import { createCard } from "../../../../db";
import { insertQuizSession, getLastQuizForCourse } from "../../../../db/repositories/quizSessions";
import type { QuizQuestion, AnswerEvaluation, QuizStatus, SpawnResult } from "../types";

export function useQuiz() {
  const router = useAIRouter();
  const vectorStore = useVectorStore();
  const vaultId = useActiveVaultId();
  const dbState = useDbState();
  const db = dbState.status === "ready" ? dbState.db : null;

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [evaluations, setEvaluations] = useState<Map<number, AnswerEvaluation>>(new Map());
  const [learnerAnswers, setLearnerAnswers] = useState<Map<number, string>>(new Map());
  const [status, setStatus] = useState<QuizStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [spawnResults, setSpawnResults] = useState<SpawnResult[] | null>(null);

  // Track courseId for persistence
  const courseIdRef = useRef<string | null>(null);
  const topicRef = useRef<string>("");

  // Retriever for RAG context
  const retriever = useMemo(() => createRetriever(router, vectorStore), [router, vectorStore]);

  // Stable generator instance
  const generator = useMemo(() => {
    return new QuizGeneratorImpl({ router });
  }, [router]);

  const generate = useCallback(
    async (topic: string, scope?: { courseId?: string; count?: number }) => {
      if (!vaultId) {
        setError("No vault connected. Connect a vault to use Quiz.");
        return;
      }
      if (!db) {
        setError("Database not ready.");
        return;
      }

      setError(null);
      setStatus("generating");
      setQuestions([]);
      setCurrentIndex(0);
      setEvaluations(new Map());
      setLearnerAnswers(new Map());
      setSpawnResults(null);

      topicRef.current = topic;
      courseIdRef.current = scope?.courseId ?? null;

      try {
        // 1. RAG context retrieval
        let contextChunks: string[] = [];
        try {
          const results = await retriever.search(topic, 5, vaultId);
          contextChunks = results.map((r) => {
            const locator = r.locator || r.chunk.heading_path || "";
            const sourceStr = locator
              ? `[source: ${r.chunk.source_title}, ${locator}] `
              : `[source: ${r.chunk.source_title}] `;
            return sourceStr + r.chunk.text_content;
          });
        } catch {
          // RAG failure is non-blocking
        }

        // 2. Fetch previous quiz questions for surface-form variability
        let previousQuestions: string[] | undefined;
        if (scope?.courseId) {
          try {
            const lastQuiz = await getLastQuizForCourse(db, vaultId, scope.courseId);
            if (lastQuiz) {
              const parsed = JSON.parse(lastQuiz.questions) as QuizQuestion[];
              previousQuestions = parsed.map((q) => q.question);
            }
          } catch {
            // Non-blocking
          }
        }

        // 3. Generate questions
        const count = scope?.count ?? 5;
        const result = await generator.generate(topic, contextChunks, previousQuestions, count);

        setQuestions(result);
        setStatus("answering");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to generate quiz";
        setError(msg);
        setStatus("error");
      }
    },
    [vaultId, db, retriever, generator],
  );

  const submitAnswer = useCallback(
    async (text: string) => {
      setLearnerAnswers((prev) => {
        const next = new Map(prev);
        next.set(currentIndex, text);
        return next;
      });
      setStatus("evaluating");

      // AI-evaluate the answer
      const q = questions[currentIndex];
      if (q && vaultId) {
        try {
          const evaluation = await generator.evaluateAnswer(q.question, text, q.answer);
          setEvaluations((prev) => {
            const next = new Map(prev);
            next.set(currentIndex, evaluation);
            return next;
          });
        } catch {
          // Fallback evaluation if AI fails
          setEvaluations((prev) => {
            const next = new Map(prev);
            next.set(currentIndex, {
              score: "missed",
              explanation: "AI evaluation unavailable. Please review the reference answer yourself.",
            });
            return next;
          });
        }
      }

      setStatus("revealing");
    },
    [currentIndex, questions, vaultId, generator],
  );

  const goToNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setStatus("answering");
    } else {
      setStatus("summary");

      // Persist quiz session to DB
      if (vaultId && db) {
        try {
          void insertQuizSession(db, {
            id: crypto.randomUUID(),
            vaultId,
            courseId: courseIdRef.current,
            topic: topicRef.current,
            questions: JSON.stringify(questions),
          });
        } catch {
          // Non-blocking
        }
      }
    }
  }, [currentIndex, questions.length, vaultId, db]);

  const spawnCards = useCallback(async (): Promise<SpawnResult[]> => {
    const results: SpawnResult[] = [];
    if (!db || !courseIdRef.current) return results;

    const missed: QuizQuestion[] = [];
    for (const [i, q] of questions.entries()) {
      const eval_ = evaluations.get(i);
      if (eval_?.score === "missed") {
        missed.push(q);
      }
    }

    for (const q of missed) {
      try {
        const card = await createCard(db, {
          courseId: courseIdRef.current,
          front: q.question,
          back: q.answer,
        });
        results.push({ question: q.question, success: true, cardId: card.id });
      } catch (e) {
        results.push({
          question: q.question,
          success: false,
          error: e instanceof Error ? e.message : "Failed to create card",
        });
      }
    }

    setSpawnResults(results);
    return results;
  }, [db, questions, evaluations]);

  const reset = useCallback(() => {
    setQuestions([]);
    setCurrentIndex(0);
    setEvaluations(new Map());
    setLearnerAnswers(new Map());
    setStatus("idle");
    setError(null);
    setSpawnResults(null);
    courseIdRef.current = null;
    topicRef.current = "";
  }, []);

  return {
    // State
    questions,
    currentIndex,
    evaluations,
    learnerAnswers,
    status,
    error,
    spawnResults,

    // Actions
    generate,
    submitAnswer,
    goToNext,
    spawnCards,
    reset,
  };
}
