import type { SqlExecutor } from "../../db/executor";

/**
 * A vault note referenced by cards, with reference metadata.
 * Pure read-model aggregate — no AI, no vault writes.
 */
export interface LinkedNote {
  /** Relative path within the vault (e.g. "Math/RA.md"). */
  notePath: string;
  /** How many cards cite this note via `cards.note_path`. */
  referenceCount: number;
  /** How many distinct domains the note's citations span. */
  domainCount: number;
  /** Domain names, sorted alphabetically. */
  domainNames: string[];
}

/**
 * Knowledge graph read-model for the dashboard (Feature 022).
 * Two views: most-linked notes and cross-domain bridges.
 */
export interface KnowledgeGraphData {
  /** Top vault notes by card-reference count (descending, capped). */
  mostLinked: LinkedNote[];
  /** Notes referenced in more than one domain (bridge nodes). */
  crossDomainBridges: LinkedNote[];
}

const MAX_MOST_LINKED = 10;
const MAX_BRIDGES = 8;

/**
 * Query the active vault's card → note references to build a lightweight
 * knowledge graph: which notes are most frequently cited, and which span
 * multiple domains. Pure read-model: no migration, no writes, no AI.
 */
export async function getLinkedNotes(
  db: SqlExecutor,
  vaultId: string,
): Promise<KnowledgeGraphData> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT c.note_path, d.id AS domain_id, d.name AS domain_name
     FROM cards c
     JOIN courses co ON co.id = c.course_id
     JOIN domains d ON d.id = co.domain_id
     WHERE d.vault_id = ? AND c.note_path IS NOT NULL
     ORDER BY c.note_path`,
    [vaultId],
  );

  // Group by note_path in JS — avoids SQL GROUP_CONCAT / JSON subtleties.
  const map = new Map<
    string,
    { refCount: number; domainIds: Set<string>; domainNames: Set<string> }
  >();
  for (const row of rows) {
    const path = row.note_path as string;
    if (!path) continue;
    let entry = map.get(path);
    if (!entry) {
      entry = { refCount: 0, domainIds: new Set(), domainNames: new Set() };
      map.set(path, entry);
    }
    entry.refCount++;
    const domainId = row.domain_id as string;
    const domainName = row.domain_name as string;
    if (domainId) entry.domainIds.add(domainId);
    if (domainName) entry.domainNames.add(domainName);
  }

  const all: LinkedNote[] = [];
  for (const [notePath, entry] of map) {
    all.push({
      notePath,
      referenceCount: entry.refCount,
      domainCount: entry.domainIds.size,
      domainNames: [...entry.domainNames].sort(),
    });
  }

  // Most-linked: highest reference count first.
  all.sort((a, b) => b.referenceCount - a.referenceCount);
  const mostLinked = all.slice(0, MAX_MOST_LINKED);

  // Cross-domain bridges: notes spanning >1 domain, sorted by domain count
  // then reference count.
  const crossDomainBridges = all
    .filter((n) => n.domainCount > 1)
    .sort(
      (a, b) =>
        b.domainCount - a.domainCount || b.referenceCount - a.referenceCount,
    )
    .slice(0, MAX_BRIDGES);

  return { mostLinked, crossDomainBridges };
}
