/**
 * FeynmanPanel — The Feynman/Socratic Tutor conversation panel.
 *
 * Renders a full-height conversation view with:
 * - Scrollable message list (FeynmanMessage components)
 * - Text input + send button
 * - Typing indicator while AI generates
 * - Summarize Gaps button after 2+ turns
 * - Close with confirmation dialog when unsaved gaps exist (FR-018)
 * - AI-driven interrogation mode: auto-launches with session sources
 */
import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { FeynmanMessage } from "./FeynmanMessage";
import { QuizPanel } from "../quiz/QuizPanel";
import { useFeynmanTutor } from "../../ai/features/feynman/hooks/useFeynmanTutor";
import type { GapSaveTarget } from "../../ai/features/feynman/types";
import type { SessionSource } from "../../ai/features/feynman/tutor";

interface FeynmanPanelProps {
  gapSaveTarget: GapSaveTarget;
  /** Session sources for AI-driven interrogation (auto-starts if provided). */
  sessionSources?: SessionSource[];
  onClose: () => void;
}

export function FeynmanPanel({ gapSaveTarget, sessionSources, onClose }: FeynmanPanelProps) {
  const {
    messages,
    isActive,
    isInterrogating,
    currentSourceName,
    error,
    sendMessage,
    startInterrogation,
    summarizeGaps,
    saveGaps,
    reset,
  } = useFeynmanTutor(
    gapSaveTarget.courseId ? { courseId: gapSaveTarget.courseId } : undefined,
  );

  const [input, setInput] = useState("");
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [gaps, setGaps] = useState<Array<{ text: string }> | null>(null);
  const [gapSaving, setGapSaving] = useState(false);
  const [gapSaved, setGapSaved] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-start interrogation when session sources are provided
  useEffect(() => {
    if (sessionSources && sessionSources.length > 0 && !startedRef.current && messages.length === 0) {
      startedRef.current = true;
      void startInterrogation(sessionSources);
    }
  }, [sessionSources, startInterrogation, messages.length]);

  const handleSend = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isActive) return;
      setInput("");
      setGaps(null);
      setGapSaved(false);
      await sendMessage(trimmed);
    },
    [input, isActive, sendMessage],
  );

  const handleClose = useCallback(() => {
    if (messages.length > 0 && !gapSaved) {
      setShowCloseConfirm(true);
    } else {
      reset();
      onClose();
    }
  }, [messages.length, gapSaved, reset, onClose]);

  const confirmClose = useCallback(() => {
    setShowCloseConfirm(false);
    reset();
    onClose();
  }, [reset, onClose]);

  const cancelClose = useCallback(() => {
    setShowCloseConfirm(false);
  }, []);

  const handleSummarizeGaps = useCallback(async () => {
    const result = await summarizeGaps();
    setGaps(result);
  }, [summarizeGaps]);

  const handleSaveGaps = useCallback(async () => {
    if (!gaps || gaps.length === 0) return;
    setGapSaving(true);
    try {
      await saveGaps(gaps, gapSaveTarget);
      setGapSaved(true);
    } finally {
      setGapSaving(false);
    }
  }, [gaps, gapSaveTarget, saveGaps]);

  const hasMultipleTurns = messages.filter((m) => m.role === "learner").length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex h-[600px] w-[480px] flex-col rounded-lg border border-line bg-panel shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-text">Feynman Tutor</h2>
          {currentSourceName && (
            <span className="max-w-[200px] truncate text-xs text-ai" title={currentSourceName}>
              Source: {currentSourceName}
            </span>
          )}
          <button
            onClick={handleClose}
            className="rounded-sm px-2 py-1 text-xs text-text-dim hover:bg-panel-raised hover:text-text transition-colors"
            aria-label="Close Feynman Tutor"
          >
            Close
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Loading state: AI preparing interrogation */}
          {isInterrogating && messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <div className="inline-block size-6 animate-spin rounded-full border-2 border-ai border-t-transparent" />
              <p className="text-center text-sm text-ai">
                AI is preparing questions from your reading…
              </p>
              {currentSourceName && (
                <p className="max-w-[300px] truncate text-xs text-text-dim">
                  Analyzing: {currentSourceName}
                </p>
              )}
            </div>
          )}

          {/* Empty state (no interrogation, no messages) */}
          {!isInterrogating && messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <p className="text-center text-sm text-text-dim">
                The Feynman Tutor will ask Socratic questions based on your session readings
                to deepen your understanding. Type your question below to start.
              </p>
            </div>
          )}

          {/* Messages */}
          {messages.length > 0 && (
            <div className="flex flex-col gap-3">
              {messages.map((msg, i) => (
                <FeynmanMessage key={i} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-sm bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
        </div>

        {/* Gap summary area */}
        {gaps && gaps.length > 0 && (
          <div className="border-t border-line px-4 py-3">
            <h3 className="mb-2 text-xs font-semibold text-text-dim">Identified Gaps</h3>
            <ul className="mb-2 flex flex-col gap-1">
              {gaps.map((g, i) => (
                <li key={i} className="text-xs text-text">
                  • {g.text}
                </li>
              ))}
            </ul>
            {gapSaved ? (
              <p className="text-xs text-success">Gaps saved successfully.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={gapSaving}
                    onClick={handleSaveGaps}
                  >
                    {gapSaving ? "Saving…" : "Save Gaps"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowQuiz(true)}
                  >
                    Quiz me on these gaps
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {showQuiz && gaps && (
          <QuizPanel
            topic={gaps.map((g) => g.text).join("; ").slice(0, 200)}
            courseId={gapSaveTarget.courseId}
            onClose={() => setShowQuiz(false)}
          />
        )}

        {/* Summarize + Input area */}
        <div className="border-t border-line">
          {hasMultipleTurns && !gaps && (
            <div className="px-4 py-2">
              <Button size="sm" variant="secondary" disabled={isActive} onClick={handleSummarizeGaps}>
                Summarize Gaps
              </Button>
            </div>
          )}

          {isActive && (
            <div className="px-4 py-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs text-ai">
                <span className="inline-block size-2 rounded-full bg-ai animate-pulse" />
                Feynman is thinking…
              </span>
            </div>
          )}

          <form onSubmit={handleSend} className="flex items-center gap-2 px-4 py-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isActive ? "Waiting for response…" : isInterrogating ? "AI is analyzing your readings…" : "Explain a concept…"}
              disabled={isActive || isInterrogating}
              className="flex-1 rounded-sm border border-line bg-surface-sunken px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
              aria-label="Message input"
            />
            <Button type="submit" disabled={!input.trim() || isActive || isInterrogating} size="md">
              Send
            </Button>
          </form>
        </div>
      </div>

      {/* Close confirmation dialog */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40">
          <div
            className="rounded-lg border border-line bg-panel p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Close confirmation"
          >
            <h3 className="mb-2 text-sm font-semibold text-text">Close Feynman Tutor?</h3>
            <p className="mb-4 text-sm text-text-dim">
              You have unsaved gaps. Closing now will lose the current conversation.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={cancelClose}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmClose}>
                Close anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
