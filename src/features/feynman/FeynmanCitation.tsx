/**
 * FeynmanCitation — Clickable citation chip rendered inline within a Feynman tutor message.
 *
 * Parsed from `[source: Name, locator]` markers in the AI response. Opens the source
 * via the existing citation opener seam (010/011) on click. Falls back silently when
 * no target can be resolved (FR-017).
 */
import { cx } from "../../components/ui/types";
import { openCitation } from "../srs/citations/openTarget";

interface FeynmanCitationProps {
  sourceName: string;
  locator: string;
  /** Injected opener for testability — defaults to openCitation */
  open?: (target: string | null) => Promise<{ opened: boolean }>;
}

export function FeynmanCitation({
  sourceName,
  locator,
  open = openCitation,
}: FeynmanCitationProps) {
  const handleClick = () => {
    // Build a simple locator string as the open target. The existing opener handles
    // pure text locators gracefully — if nothing can be opened it returns { opened: false }.
    void open(locator ? `${sourceName} — ${locator}` : sourceName);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cx(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5",
        "text-2xs font-medium leading-normal",
        "bg-brand/15 text-brand",
        "hover:bg-brand/25",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        "transition-colors cursor-pointer",
      )}
      title={`${sourceName} — ${locator}`}
    >
      {/* Chain-link icon — smaller than emoji, no i18n burden */}
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
        <path d="M6.5 9.5a4 4 0 0 0 5.66-5.66l-1-1a4 4 0 0 0-5.66 5.66" />
        <path d="M9.5 6.5a4 4 0 0 0-5.66 5.66l1 1a4 4 0 0 0 5.66-5.66" />
      </svg>
      <span className="truncate max-w-[180px]">{sourceName}</span>
      {locator && <span className="opacity-70">· {locator}</span>}
    </button>
  );
}
