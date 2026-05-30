# Contract: Projects Repository (`src/db/repositories/projects.ts`)

SQLite access for Projects. Pure data layer (takes a `SqlExecutor`, returns zod-parsed models). Mirrors `courses.ts` / `sessions.ts` patterns. Multi-statement mutations run in a transaction. Node-tested with `NodeSqlExecutor`.

---

## Create / read

```ts
export async function createProject(
  db: SqlExecutor,
  input: {
    courseId: string;
    title: string;          // non-empty (validated)
    capability: string;     // non-empty
    milestoneIds: string[]; // ≥1, all of courseId's milestones (validated in-app)
    template?: ProjectTemplateName | null;
    resources?: { resourceId: string; locator?: string | null }[];
    projectPath?: string | null; // set by sync after the file is written
  },
): Promise<Project>;
// status='open', opened_at=now. Inserts projects row + project_milestones (1..N) +
// project_resources (0..N) in one transaction. Throws on empty title/capability or 0 milestones.

export async function getProject(db: SqlExecutor, id: string): Promise<Project | null>;

export async function listCourseProjects(db: SqlExecutor, courseId: string): Promise<Project[]>;
// All of a Course's Projects, ordered (status active-first, then opened_at desc, id).

export async function listActiveProjects(db: SqlExecutor, vaultId: string): Promise<Project[]>;
// status IN (open,in-progress), scoped to the active vault via project→course→domain→vault.

export async function getProjectMilestoneIds(db: SqlExecutor, id: string): Promise<string[]>;
export async function listProjectResources(db: SqlExecutor, id: string): Promise<ProjectResourceRef[]>;
```

## Update — links & status

```ts
export async function setProjectMilestones(db: SqlExecutor, id: string, milestoneIds: string[]): Promise<void>;
// Replace the M:N set (delete-missing + insert-new) in a txn. Enforces ≥1 + same-Course in-app.

export async function setProjectResources(
  db: SqlExecutor, id: string, refs: { resourceId: string; locator?: string | null }[],
): Promise<void>;

export async function markProjectInProgress(db: SqlExecutor, id: string): Promise<void>;
// Idempotent: open → in-progress; no-op if already in-progress/complete/abandoned. Never auto-completes.

export async function setProjectTitleCapability(
  db: SqlExecutor, id: string, input: { title: string; capability: string; template?: string | null },
): Promise<void>;
```

## Close (+ manual card-spawn)

```ts
export async function closeProject(
  db: SqlExecutor,
  input: {
    projectId: string;
    outcome: "complete" | "abandoned";
    cards?: { front: string; back: string }[];   // learner-authored, manual-approved (may be empty)
    citeResourceIds?: string[];                   // optional citations for spawned cards
  },
): Promise<{ project: Project; spawnedCardIds: string[] }>;
// In one txn: set status=outcome + closed_at=now; for each card → createCard(tx,
// { courseId: project.course_id, front, back, projectId }) and optionally addCardResource.
// Never auto-generates cards; an empty `cards` array spawns none. (Reflection PROSE is appended to
// the vault body by the sync layer, not here — this is the DB side only.)
```

## Import & delete

```ts
export async function upsertImportedProject(
  db: SqlExecutor,
  input: {
    id: string; courseId: string; title: string; capability: string;
    status: ProjectStatus; milestoneIds: string[]; openedAt: string;
    closedAt: string | null; template: string | null; projectPath: string;
  },
): Promise<void>;
// Rescan path: upsert by id (insert or update the row + reconcile project_milestones). Resolves
// milestone ids that exist; silently drops unknown ids (the file is canonical, the DB follows).

export async function deleteProject(db: SqlExecutor, id: string): Promise<void>;
// Delete the projects row; cascade removes project_milestones/project_resources; sessions.project_id
// and cards.project_id reset to NULL via the FK. (Vault file fate handled by the sync delete layer.)
```

## `createCard` extension (`src/db/repositories/cards.ts`)

```ts
export async function createCard(
  db: SqlExecutor,
  input: { courseId: string; front: string; back: string; notePath?: string | null;
           projectId?: string | null },   // NEW — defaults null; sets cards.project_id
): Promise<Card>;
```

## `planSession` extension (`src/db/repositories/sessions.ts`)

```ts
// PlanFormInput gains: projectId?: string | null
// planSession(): when projectId is set, insert sessions.project_id AND call markProjectInProgress
// (open → in-progress) in the same transaction. listSessionsForProject(db, projectId) added for "touched".
```

## Guarantees

- Every mutation that writes ≥2 rows is transactional (no partial Project).
- All returned rows are zod-parsed (`ProjectSchema`); malformed DB rows throw at the boundary (not silently coerced).
- No query bypasses the active-vault scope for list/active reads.
- No code path sets `status='complete'` without an explicit learner-initiated `closeProject({ outcome: "complete" })`.
- **Zero-milestone reads are valid (M3/FR-020).** `createProject`/`setProjectMilestones` enforce ≥1, but `project_milestones.milestone_id` is `ON DELETE CASCADE`, so deleting a Milestone can leave a Project with zero links. `getProject`/`listCourseProjects`/`getProjectMilestoneIds` MUST return such a Project normally (empty milestone array; never throw or filter it out). The Project also survives a referenced Resource's deletion. This survival is covered by a deletion test (see tasks).
