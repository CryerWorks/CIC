import type { LinkedNote } from "./graphQueries";

/**
 * "Knowledge Graph" dashboard tile (Feature 022). Shows the most-linked vault
 * notes (most card citations) and cross-domain bridges (notes referenced by
 * cards in more than one domain). Pure read-model — no AI, no vault writes.
 *
 * Renders nothing when there are no linked notes (Constitution III — no
 * fabricated data; the healthy state is an empty tile).
 */
export function KnowledgeGraph({
  mostLinked,
  crossDomainBridges,
}: {
  mostLinked: LinkedNote[];
  crossDomainBridges: LinkedNote[];
}) {
  if (mostLinked.length === 0 && crossDomainBridges.length === 0) return null;

  const renderNote = (note: LinkedNote) => (
    <li
      key={note.notePath}
      className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-sunken px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs text-text" title={note.notePath}>
          {note.notePath}
        </span>
        {note.domainCount > 1 && (
          <span className="mt-0.5 block truncate text-[10px] text-text-dim" title={note.domainNames.join(", ")}>
            {note.domainNames.join(", ")}
          </span>
        )}
      </div>
      <span className="shrink-0 font-mono text-xs text-text-dim">{note.referenceCount} cards</span>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Most-linked notes */}
      {mostLinked.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-text-dim">Most-linked notes</h3>
          <ul className="flex flex-col gap-1.5">
            {mostLinked.slice(0, 8).map(renderNote)}
          </ul>
          {mostLinked.length > 8 && (
            <p className="mt-1 text-[11px] text-text-dim">
              +{mostLinked.length - 8} more
            </p>
          )}
        </section>
      )}

      {/* Cross-domain bridges */}
      {crossDomainBridges.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-text-dim">
            Cross-domain bridges
            <span className="ml-1.5 text-text-dim font-normal">
              ({crossDomainBridges.length})
            </span>
          </h3>
          <ul className="flex flex-col gap-1.5">
            {crossDomainBridges.slice(0, 6).map(renderNote)}
          </ul>
          {crossDomainBridges.length > 6 && (
            <p className="mt-1 text-[11px] text-text-dim">
              +{crossDomainBridges.length - 6} more
            </p>
          )}
        </section>
      )}
    </div>
  );
}
