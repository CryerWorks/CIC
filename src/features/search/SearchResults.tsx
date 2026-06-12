import type { SearchResult } from "../../ai/rag/types";
import { Tag } from "../../components/ui";
import { cx } from "../../components/ui/types";

interface SearchResultsProps {
  results: SearchResult[];
  loading: boolean;
}

export function SearchResults({ results, loading }: SearchResultsProps) {
  if (loading) {
    return <p className="text-text-dim text-sm">Searching…</p>;
  }

  if (results.length === 0) {
    return <p className="text-text-dim text-sm">No matching results.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {results.map((r, i) => (
        <li
          key={`${r.chunk.id}-${i}`}
          className="rounded-sm border border-line bg-panel-raised p-3"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-text">{r.chunk.source_title}</span>
            <Tag
              className={cx(
                "text-xs",
                r.chunk.source_kind === "resource"
                  ? "bg-brand-soft text-brand"
                  : "bg-cyan-900/30 text-cyan-300",
              )}
            >
              {r.chunk.source_kind === "resource" ? "Resource" : "Note"}
            </Tag>
          </div>
          {r.chunk.heading_path && (
            <p className="text-xs text-text-dim mb-1">{r.chunk.heading_path}</p>
          )}
          <p className="text-sm text-text leading-relaxed line-clamp-4">
            {r.chunk.text_content}
          </p>
        </li>
      ))}
    </ul>
  );
}
