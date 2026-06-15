import type { ColdDomain } from "../interleaving/scheduler";

/**
 * "Going Cold" dashboard tile (Feature 021 / F6). Shows domains that haven't been
 * touched (no completed session) within the configured threshold. Renders nothing
 * when no domains are going cold — the healthy state is no fabricated data.
 */
export function ColdTile({ domains }: { domains: ColdDomain[] }) {
  if (domains.length === 0) return null;

  return (
    <div className="rounded-md border border-line bg-surface-sunken px-3 py-2">
      <span className="text-xs text-text-dim">Going Cold</span>
      <ul className="mt-2 flex flex-col gap-1.5">
        {domains.slice(0, 5).map((d) => (
          <li key={d.id} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 truncate text-text-dim">
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <span className="truncate" title={d.name}>{d.name}</span>
            </span>
            <span className="ml-2 shrink-0 text-text-dim">{d.daysSinceLastSession}d</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
