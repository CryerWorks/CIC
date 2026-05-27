import type { ReactNode } from "react";
import { cx, type CalloutVariant } from "./types";

const styles: Record<CalloutVariant, { bar: string; tint: string; title: string }> = {
  note: { bar: "border-l-info", tint: "bg-info/5", title: "text-info" },
  tip: { bar: "border-l-success", tint: "bg-success/5", title: "text-success" },
  warn: { bar: "border-l-warn", tint: "bg-warn/5", title: "text-warn" },
  danger: { bar: "border-l-danger", tint: "bg-danger/5", title: "text-danger" },
  info: { bar: "border-l-info", tint: "bg-info/5", title: "text-info" },
  // The one legitimate use of the AI accent in this kit.
  ai: { bar: "border-l-ai", tint: "bg-ai/5", title: "text-ai" },
};

interface CalloutProps {
  variant?: CalloutVariant;
  title?: string;
  children?: ReactNode;
  className?: string;
}

export function Callout({ variant = "note", title, children, className }: CalloutProps) {
  const s = styles[variant];
  return (
    <div className={cx("rounded-md border border-l-4 border-line p-3 text-sm", s.bar, s.tint, className)}>
      {title && <div className={cx("mb-1 font-semibold", s.title)}>{title}</div>}
      <div className="text-text">{children}</div>
    </div>
  );
}
