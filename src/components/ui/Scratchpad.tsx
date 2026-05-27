import type { TextareaHTMLAttributes } from "react";
import { cx } from "./types";

interface ScratchpadProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Scratchpad({ label, className, id, ...rest }: ScratchpadProps) {
  return (
    <div className="relative">
      {label && (
        <label htmlFor={id} className="absolute -top-2 left-3 bg-surface px-1.5 text-2xs text-brand">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={cx(
          "min-h-24 w-full rounded-md border border-dashed border-line-bright bg-surface-sunken p-3 font-mono text-xs text-text placeholder:text-text-dim",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          className,
        )}
        {...rest}
      />
    </div>
  );
}
