# Implementation Report — Knowledge Graph Tile (Feature 022)

## Diff Summary

| File | Action | Lines |
|------|--------|-------|
| `src/features/dashboard/graphQueries.ts` | **Created** | 101 |
| `src/features/dashboard/KnowledgeGraph.tsx` | **Created** | 73 |
| `src/features/dashboard/useDashboard.ts` | Modified | +11 / −2 |
| `src/features/dashboard/DashboardRoute.tsx` | Modified | +9 / −2 |

**Total: 4 files changed, ~194 lines added, ~4 lines removed**

---

## What Was Built

### 1. `src/features/dashboard/graphQueries.ts` — Knowledge Graph Query Layer

Pure read-model query function `getLinkedNotes(db, vaultId)` that:

- Queries `cards → courses → domains` to find all vault note paths referenced by cards
- Groups by `note_path` in JS (avoiding SQL `GROUP_CONCAT`/JSON subtleties)
- Returns two sorted views:
  - **`mostLinked`**: top 10 notes by card-reference count
  - **`crossDomainBridges`**: notes referenced in >1 domain, sorted by domain count then ref count (up to 8)
- Both views capped to keep the tile compact
- Gracefully handles empty results (returns empty arrays)

**Design decision**: JS-side grouping was chosen over SQL `GROUP_CONCAT` because:
1. The raw rows already need domain name resolution (join)
2. No zod schema gymnastics for aggregate columns
3. Volume is bounded by total cards in vault (typically <10k)

### 2. `src/features/dashboard/KnowledgeGraph.tsx` — Tile Component

Shallow interface: `<KnowledgeGraph mostLinked crossDomainBridges />`.

- Two sections: "Most-linked notes" and "Cross-domain bridges"
- Each note rendered with `notePath`, `referenceCount`, and domain names (if multi-domain)
- Inner capped display: 8 most-linked, 6 bridges with "+N more" overflow indicator
- Returns `null` when both lists empty (Constitution III — no fabricated data)

### 3. `useDashboard.ts` Changes

- Added `knowledgeGraph: KnowledgeGraphData` to `DashboardData` interface
- Loaded in `useEffect` with `.catch()` fallback to empty arrays (parallel to Feature 021 pattern)
- Cleared on vault switch / no-vault state

### 4. `DashboardRoute.tsx` Changes

- Imported `KnowledgeGraph` component
- Destructured `knowledgeGraph` from `useDashboard()`
- Added `<Panel title="Knowledge Graph">` between "Active projects" and `DeferredTiles`
- Panel only renders when there's data (empty state = no panel)

---

## Quality Gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | ✅ Pass |
| `npx eslint (changed files)` | ✅ Pass |
| `npx vitest run` (133 files, 795 tests) | ✅ Pass |
| No debug artifacts | ✅ Pass |
| No TODO/FIXME/HACK | ✅ Pass |
| All public APIs typed | ✅ Pass |

---

## Design Decisions

1. **No new migration**: All queries use existing `cards.note_path`, `courses.domain_id`, `domains.vault_id` columns — pure read-model.

2. **No AI, no vault writes**: The tile only reads from the DB. Knowledge graph is computed from card-to-note references that already exist.

3. **JS-side aggregation**: Instead of SQL `GROUP_CONCAT` + zod parsing of aggregate rows, we fetch raw `(note_path, domain_id, domain_name)` tuples and group in JS. This avoids ambiguity around SQLite `GROUP_CONCAT` returning `NULL` for empty groups.

4. **Parallel loading isolation**: Knowledge graph query runs in parallel with other non-critical features (daily mix, cold domains) and is `.catch()`-wrapped so a failure doesn't block the core summary.

---

## Known Issues / Limitations

- The "knowledge graph" is a flat list, not a visual graph — no D3/cytoscape rendering. This keeps the interface minimal and avoids adding a visualization dependency.
- Only `cards.note_path` is used to find note references. Session writeups (`sessions.writeup_path`) and resources (`resources.file_path`) are not scanned. This was judged sufficient for v1; they can be added in a follow-up.
- Domain names are fetched per row and deduped in JS. On large vaults (>100k cards) this could be optimized with a SQL-level aggregation, but for typical usage (<10k cards) it's fine.
