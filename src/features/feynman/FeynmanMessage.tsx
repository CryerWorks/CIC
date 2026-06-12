/**
 * FeynmanMessage — Renders a single message in the Feynman conversation.
 *
 * Learner messages: right-aligned, neutral bubble.
 * Tutor messages:   left-aligned, cyan AI accent per design doc.
 * Streaming:        blinking cursor when isStreaming is true.
 * Citations:        inline FeynmanCitation chips parsed from [source: Name, locator] markers (Phase 5).
 * Uncertainty:      warning badge when AI is reasoning from general knowledge (Phase 5).
 */
import { cx } from "../../components/ui/types";
import type { FeynmanMessage as FeynmanMessageType } from "../../ai/features/feynman/types";
import { FeynmanCitation } from "./FeynmanCitation";
import { parseCitations } from "./parseCitations";

/** The exact prefix string the Socratic prompt instructs the AI to use when reasoning without RAG context. */
const UNCERTAINTY_PREFIX = "⚠️ I'm reasoning from general knowledge";

interface FeynmanMessageProps {
  message: FeynmanMessageType;
}

export function FeynmanMessage({ message }: FeynmanMessageProps) {
  const isTutor = message.role === "tutor";
  const isUncertain = isTutor && message.content.includes(UNCERTAINTY_PREFIX);
  const segments = parseCitations(message.content);

  return (
    <div
      className={cx(
        "flex w-full flex-col",
        isTutor ? "items-start" : "items-end",
      )}
    >
      {/* Uncertainty badge — rendered above the bubble when the AI is guessing */}
      {isUncertain && (
        <div className="mb-1 flex items-center gap-1.5 rounded-sm bg-warn/15 px-2.5 py-1 text-2xs text-warn">
          <svg
            className="size-3 shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="7" />
            <path d="M8 5v3" />
            <circle cx="8" cy="11" r="0.5" fill="currentColor" stroke="none" />
          </svg>
          <span>Uncertain — verify against your sources</span>
        </div>
      )}

      <div
        className={cx(
          "max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed",
          isTutor
            ? "bg-ai/10 text-ai"
            : "bg-surface-sunken text-text",
        )}
      >
        <div className="whitespace-pre-wrap break-words">
          {segments.map((seg, i) =>
            seg.type === "citation" ? (
              <FeynmanCitation
                key={i}
                sourceName={seg.sourceName}
                locator={seg.locator}
              />
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
          {message.isStreaming && (
            <span className="inline-block w-[2px] h-[1em] ml-0.5 bg-ai animate-pulse" aria-label="typing" />
          )}
        </div>

        {/* Structured citations rendered below the message text as a compact list */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.citations.map((c, i) => (
              <FeynmanCitation
                key={i}
                sourceName={c.sourceName}
                locator={c.locator}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
