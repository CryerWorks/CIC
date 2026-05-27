import { cx } from "./types";

interface CitationProps {
  source: string;
  locator?: string;
  href?: string;
  className?: string;
}

export function Citation({ source, locator, href, className }: CitationProps) {
  const content = (
    <>
      {source}
      {locator && <span className="text-text-dim"> · {locator}</span>}
    </>
  );
  const base = cx("inline-flex items-center gap-1 font-mono text-2xs", className);
  return href ? (
    <a href={href} className={cx(base, "text-brand hover:underline")}>
      {content}
    </a>
  ) : (
    <span className={cx(base, "text-text-dim")}>{content}</span>
  );
}
