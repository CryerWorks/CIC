# Contract — SRS data layer (migration + repositories)

All functions sit in the repository layer over the `SqlExecutor` seam; features never see SQL. Vault scoping follows 009 (cards via the `course → domain.vault_id` join; resources via `resources.vault_id`).

## Migration (`src/db/migrations/m0004_srs_scoping.ts`)

```ts
export const m0004SrsScoping: Migration = {
  version: 4,
  name: "srs_scoping",
  sql: `
    ALTER TABLE resources ADD COLUMN vault_id TEXT REFERENCES vaults(id);
    CREATE INDEX IF NOT EXISTS idx_resources_vault_id ON resources(vault_id);
    ALTER TABLE cards ADD COLUMN note_block_id TEXT;
  `,
};
```
Registered (append-only) in `migrations/index.ts`. Bumps `migrate.test.ts` (0→4, applied:4), `migrate.evolution.test.ts`, `migrate.lossless.test.ts`, `settings.test.ts` to v4 (R9).

## Cards (`src/db/repositories/cards.ts`)

```ts
createCard(db, input: {
  courseId: string; front: string; back: string;
  milestoneId?: string | null; notePath?: string | null; projectId?: string | null;
}): Promise<Card>;                                   // fsrs_state/due_at NULL (new); created_at = now

updateCardContent(db, id: string, patch: { front?: string; back?: string;
  notePath?: string | null; noteBlockId?: string | null }): Promise<Card>;  // never touches fsrs_state/due_at (FR-011)

deleteCard(db, id: string): Promise<void>;           // cascade removes reviews + card_resources

getCard(db, id: string): Promise<Card | null>;

listCardsByCourse(db, courseId: string): Promise<Card[]>;   // Course-detail listing (FR-025)

listDueCards(db, vaultId: string, now: string, cap: number): Promise<Card[]>;
//  due review cards (fsrs_state set, due_at <= now)  ++  up to (cap - newIntroducedToday) new cards
//  scoped: JOIN courses c ON c.id=cards.course_id JOIN domains d ON d.id=c.domain_id WHERE d.vault_id=?
//  newIntroducedToday = COUNT(DISTINCT card) with MIN(reviews.reviewed_at) on the current local day (R4)

countDueCards(db, vaultId: string, now: string, cap: number): Promise<number>;  // dashboard tile (R10)
```

## Reviews (`src/db/repositories/reviews.ts`)

```ts
recordReview(db, scheduler: Scheduler, input: {
  cardId: string; grade: Grade; confidence: number /* 1..5, required */; elapsedMs?: number; now?: string;
}): Promise<{ card: Card; review: Review }>;
//  TRANSACTION (R12): load card.fsrs_state → scheduler.grade(prev, grade, now)
//  → UPDATE cards SET fsrs_state, due_at, last_reviewed → INSERT reviews row → return both

listReviewsByCard(db, cardId: string): Promise<Review[]>;

getOverconfidentCards(db, vaultId: string): Promise<Card[]>;
//  cards whose LATEST review has confidence >= 4 AND rating = 'again' (R11), vault-scoped via the domain join
```

## Resources (`src/db/repositories/resources.ts`)

```ts
registerResource(db, vaultId: string, input: {
  title: string; kind: ResourceKind; filePath?: string | null; url?: string | null;
  metadata?: ResourceMetadata;   // zod discriminated union on kind (R13)
}): Promise<Resource>;            // stamps vault_id, added_at = now, metadata default {}

attachResources(db, vaultId: string): Promise<void>;   // one-shot adopt legacy NULLs (R6; no-op here)
listResources(db, vaultId: string): Promise<Resource[]>;            // WHERE vault_id = ?
updateResource(db, id, patch): Promise<Resource>;
deleteResource(db, id): Promise<void>;                              // cascade removes course/card links

linkResourceToCourse(db, { courseId, resourceId, role }): Promise<void>;   // upsert course_resources
unlinkResourceFromCourse(db, courseId, resourceId): Promise<void>;
listCourseResources(db, courseId): Promise<Resource[]>;
```

## Card citations (`src/db/repositories/cardResources.ts`)

```ts
addCardResource(db, { cardId, resourceId, locator? }): Promise<void>;       // upsert card_resources
removeCardResource(db, cardId, resourceId): Promise<void>;
listCardResources(db, cardId): Promise<Array<{ resource: Resource; locator: string | null }>>;
```

## Settings (existing `settings.ts`, no new fn)

```ts
getSetting(db, "srs.dailyNewCap")  // → string | null; parseInt, default 20 (R4)
setSetting(db, "srs.dailyNewCap", String(n))
```

## Exports
All added repos re-exported from `src/db/index.ts` (append to the existing barrel).

## Tests (node:sqlite, `// @vitest-environment node`)
Per 009 pattern: `freshDb()` = `NodeSqlExecutor.open()` → `migrate` → `attachVault(db,{id:VID,path})` → `createDomain(db, VID, …)` → `createCourse(db, {domainId})`. Cover: new-card due + cap boundary, due ordering, grade persistence + monotonic due, review transaction atomicity, overconfidence selection, resource vault-scoping isolation (two vaults), citation add/remove, cascade on Course delete.
