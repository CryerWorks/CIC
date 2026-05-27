import type { ReactNode } from "react";
import { cx } from "./types";

interface AnnotationProps {
  label?: string;
  children: ReactNode;
  className?: string;
}

export function Annotation({ label, children, className }: AnnotationProps) {
  return (
    <span className={cx("text-2xs text-text-dim", className)}>
      {label && <span className="font-semibold text-text">{label}: </span>}
      {children}
    </span>
  );
}
