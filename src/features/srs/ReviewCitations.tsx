import { useEffect, useState } from "react";
import { Button } from "../../components/ui";
import { useDb } from "../../app/providers/DbProvider";
import { listCardResources, type CardCitation } from "../../db";
import { resourceTarget, openCitation } from "./citations/openTarget";

/** A reviewed card's Resource citations, each with a best-effort "Open" deep-link (F3.7). When a
 *  Resource can't be auto-opened (e.g. a physical book), the locator is shown and Open is disabled
 *  — never an error (SC-006). */
export function ReviewCitations({ cardId }: { cardId: string }) {
  const db = useDb();
  const [cites, setCites] = useState<CardCitation[]>([]);

  useEffect(() => {
    let active = true;
    listCardResources(db, cardId)
      .then((c) => active && setCites(c))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [db, cardId]);

  if (cites.length === 0) return null;

  return (
    <div className="rounded-md border border-line bg-surface-sunken p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-dim">Sources</p>
      <ul className="mt-1 flex flex-col gap-1">
        {cites.map((c) => {
          const target = resourceTarget(c.resource, c.locator);
          return (
            <li key={c.resource.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-text">
                {c.resource.title}
                {c.locator && <span className="text-text-dim"> · {c.locator}</span>}
              </span>
              <Button size="sm" variant="ghost" disabled={!target} onClick={() => void openCitation(target)}>
                Open
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
