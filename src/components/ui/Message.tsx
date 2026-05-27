import type { ReactNode } from "react";
import { cx, type MessageRole } from "./types";

interface MessageProps {
  role: MessageRole;
  author?: string;
  children: ReactNode;
  className?: string;
}

// role="ai" styles the message with the AI accent (cyan); role="user" stays neutral/brand.
// This is the live application of the brand-vs-AI rule (FR-002).
export function Message({ role, author, children, className }: MessageProps) {
  const isAi = role === "ai";
  return (
    <div className={cx("flex gap-2.5 text-sm leading-relaxed", className)}>
      <div
        className={cx(
          "grid size-7 shrink-0 place-items-center rounded-full text-2xs font-bold",
          isAi ? "bg-ai/15 text-ai" : "bg-brand-soft text-brand",
        )}
        aria-hidden="true"
      >
        {isAi ? "AI" : (author?.[0]?.toUpperCase() ?? "U")}
      </div>
      <div className="min-w-0">
        {author && <div className={cx("mb-0.5 text-2xs font-semibold", isAi ? "text-ai" : "text-text-dim")}>{author}</div>}
        <div className="text-text">{children}</div>
      </div>
    </div>
  );
}
