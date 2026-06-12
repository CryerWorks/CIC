import type { ChunkSourceKind } from "../../ai/rag/types";

interface SearchFiltersProps {
  sourceKind: ChunkSourceKind | "all";
  onSourceKindChange: (kind: ChunkSourceKind | "all") => void;
  disabled?: boolean;
}

const KIND_OPTIONS: { value: ChunkSourceKind | "all"; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "resource", label: "Resources" },
  { value: "note", label: "Notes" },
];

export function SearchFilters({ sourceKind, onSourceKindChange, disabled }: SearchFiltersProps) {
  return (
    <fieldset className="flex items-center gap-3" disabled={disabled}>
      <legend className="sr-only">Filter by source kind</legend>
      {KIND_OPTIONS.map((opt) => (
        <label key={opt.value} className="flex items-center gap-1.5 text-sm text-text-dim">
          <input
            type="radio"
            name="sourceKind"
            value={opt.value}
            checked={sourceKind === opt.value}
            onChange={() => onSourceKindChange(opt.value)}
            className="accent-brand"
          />
          {opt.label}
        </label>
      ))}
    </fieldset>
  );
}
