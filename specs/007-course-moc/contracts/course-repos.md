# Contract: Course/Milestone/Campaign Repository Additions

**Location**: `src/db/repositories/{courses,milestones,campaigns}.ts` | Exported from `src/db/index.ts`. Built on the generic `insert/update/upsert/selectParsed` helpers (query.ts). All inputs/outputs are zod-validated rows. **Additive only** — existing functions unchanged.

## courses.ts (additions)

```ts
// Update mutable fields. Pass only what changes; returns the updated row.
updateCourse(db, id, patch: {
  title?: string; campaignId?: string | null; mocPath?: string | null;
}): Promise<Course>;

// All courses (for the screen, grouped by domain in the UI). Ordered by title.
listCourses(db): Promise<Course[]>;

// Read-back helpers.
getCourseByMocPath(db, mocPath: string): Promise<Course | null>;

// Id-preserving create-or-update (read-back import, R7). Upserts on PK `id`.
upsertCourseRow(db, row: {
  id: string; title: string; domainId: string; campaignId: string | null; mocPath: string | null;
}): Promise<Course>;
```

- `updateCourse` MUST validate the patched row through `CourseSchema` before returning.
- `upsertCourseRow` MUST be idempotent: calling twice with the same row yields one row, unchanged the second time.
- FK integrity (domain must exist) is enforced by the existing schema; a bad `domainId` rejects (as in hierarchy.test.ts).

## milestones.ts (additions)

```ts
updateMilestone(db, id, patch: {
  capability?: string; status?: MilestoneStatus; orderIndex?: number;
}): Promise<Milestone>;

deleteMilestone(db, id): Promise<void>;

// Make the DB match a desired set for one course (read-back, R7):
//  - upsert each desired milestone by id (insert if new, update otherwise)
//  - delete any existing milestone of this course whose id is NOT in `desired`
// `desired` carries final order via array position → order_index.
syncCourseMilestones(db, courseId: string, desired: {
  id: string; capability: string; status: MilestoneStatus;
}[]): Promise<Milestone[]>;
```

- `syncCourseMilestones` MUST be transactional in effect (no partial set left on error where avoidable) and MUST return the resulting ordered milestone list.
- After `syncCourseMilestones`, `listMilestonesByCourse(db, courseId)` MUST equal the desired set in order.

## domains.ts (addition)

```ts
// Read-back resolution helper (R7): match an existing Domain by name (case-insensitive)
// or create one with a default palette color. Used when importing a hand-authored MOC
// whose `domain:` name has no existing Domain.
findOrCreateDomainByName(db, name: string): Promise<Domain>;
```

- MUST match case-insensitively against existing domains; create only when absent, picking a deterministic default color from the palette.

## campaigns.ts (new)

```ts
listCampaignsByDomain(db, domainId: string): Promise<Campaign[]>;   // ordered by title
createCampaign(db, input: { title: string; domainId: string }): Promise<Campaign>;
getCampaign(db, id: string): Promise<Campaign | null>;
// Read-back resolution helper (R7): find by (domain, title) or create.
findOrCreateCampaignByTitle(db, domainId: string, title: string): Promise<Campaign>;
```

- All returned rows validated through `CampaignSchema`.
- `findOrCreateCampaignByTitle` matches case-insensitively within the domain; creates only when absent.

## db/index.ts
- Add `export * from "./repositories/campaigns";`.

## Test obligations
- `updateCourse` patches only provided fields; round-trips through `CourseSchema`.
- `upsertCourseRow` idempotency (twice → one row).
- `syncCourseMilestones`: insert-new + update-existing + delete-missing in one call; order preserved; re-running with the same set is a no-op.
- `findOrCreateCampaignByTitle`: creates once, reuses on second call (case-insensitive).
- A `domain`-less course insert still rejects (FK).
