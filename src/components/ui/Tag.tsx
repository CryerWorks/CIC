import type { ReactNode } from "react";
import { cx, type TagTone } from "./types";

const tones: Record<TagTone, string> = {
  brand: "bg-brand-soft text-brand",
  neutral: "bg-panel-raised text-text-dim",
  success: "bg-panel-raised text-success",
  warn: "bg-panel-raised text-warn",
  danger: "bg-panel-raised text-danger",
};

interface TagProps {
  children: ReactNode;
  tone?: TagTone;
  className?: string;
}

export function Tag({ children, tone = "brand", className }: TagProps) {
  return (
    <span className={cx("inline-block rounded-full px-2.5 py-0.5 text-2xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}
