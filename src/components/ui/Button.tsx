import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx, type ButtonVariant, type ButtonSize } from "./types";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dim",
  secondary: "border border-line-bright bg-panel-raised text-text hover:bg-panel-header",
  ghost: "bg-transparent text-text-dim hover:bg-panel-raised hover:text-text",
  danger: "bg-danger text-white hover:opacity-90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
};

export function Button({ variant = "primary", size = "md", type = "button", className, children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-sm font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
