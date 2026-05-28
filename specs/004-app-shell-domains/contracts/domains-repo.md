# Contract: Domains Repository Additions

**Feature**: 004-app-shell-domains · **Date**: 2026-05-27

Additive to the Feature 003 domains repository (`src/db/repositories/domains.ts`). **No schema change** — these are typed CRUD over the existing `domains` table, through the `SqlExecutor` seam. They join `createDomain` / `getDomain` / `listDomains` (already shipped in 003).

## `updateDomain`

```ts
export function updateDomain(
  db: SqlExecutor,
  id: string,
  patch: { name: string; color: string },
): Promise<Domain>;
```

- Issues `UPDATE domains SET name = ?, color = ? WHERE id = ?` (via the query `update` builder), then reads the row back and returns it parsed through `DomainSchema`.
- A `name` colliding with another Domain violates the `domains.name UNIQUE` constraint and **rejects** (the UI validates first and treats this as the backstop).
- Updating a missing `id` affects 0 rows; callers pass ids that exist (from the list).

## `deleteDomain`

```ts
export function deleteDomain(db: SqlExecutor, id: string): Promise<void>;
```

- Issues `DELETE FROM domains WHERE id = ?`.
- **Cascade (per the 003 schema):** removing a Domain cascades to its `campaigns` and `courses` (and, transitively, their milestones/sessions/cards/projects). The UI MUST confirm with an explicit cascade warning before calling this (FR-010). 003's cascade tests already prove this behaviour at the data layer.

## Test obligations (covered by this feature's tests)

- `updateDomain` changes name + color and the change is read back parsed; a duplicate-name update rejects.
- `deleteDomain` removes the row (and, given seeded children, would cascade — the cascade itself is already proven in 003's `integrity.cascade.test.ts`, so here we assert the Domain is gone).
- Both run against an in-memory `node:sqlite` executor through the real repository (the 003 seam).

## Stability

Additive to the 003 public surface (re-exported from `src/db`). Existing functions are unchanged.
