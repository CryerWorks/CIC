import type { FeynmanGap, FeynmanMessage, GapSaveTarget } from "./types";

/**
 * Seam interface for the Feynman/Socratic tutor.
 *
 * Features consume the `useFeynmanTutor()` hook, which wraps an instance
 * of this interface. The concrete implementation orchestrates RAG retrieval,
 * router.chat('reasoning', …), and dual gap persistence.
 */
export interface FeynmanTutor {
  /** Start a new conversation. Resets message history. */
  startConversation(scope?: { courseId?: string }): void;

  /**
   * Send the learner's message and stream the AI response.
   * Each yielded string is a token to append to the in-progress message.
   */
  sendMessage(text: string): AsyncIterable<string>;

  /** Get the current conversation messages (for rendering). */
  getMessages(): FeynmanMessage[];

  /** Summarize identified gaps from the conversation. Makes an AI call. */
  summarizeGaps(): Promise<FeynmanGap[]>;

  /**
   * Save identified gaps to vault (canonical) + SQLite (mirror).
   * Vault write happens first; DB write follows. Returns count saved.
   */
  saveGaps(gaps: FeynmanGap[], target: GapSaveTarget): Promise<number>;

  /** Whether the tutor is currently generating a response. */
  isActive: boolean;
}
