import type { ReactNode } from "react";
import { cx } from "./types";

interface PanelProps {
  title?: ReactNode;
  headerRight?: ReactNode;
  footer?: ReactNode;
  as?: "section" | "div";
  className?: string;
  children?: ReactNode;
}

export function Panel({ title, headerRight, footer, as: Tag = "div", className, children }: PanelProps) {
  return (
    <Tag className={cx("overflow-hidden rounded-md border border-line bg-panel", className)}>
      {(title || headerRight) && (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-panel-header px-4 py-2.5">
          {title && <div className="text-sm font-semibold text-text">{title}</div>}
          {headerRight && <div className="text-xs text-text-dim">{headerRight}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
      {footer && <div className="border-t border-line px-4 py-2.5 text-xs text-text-dim">{footer}</div>}
    </Tag>
  );
}
