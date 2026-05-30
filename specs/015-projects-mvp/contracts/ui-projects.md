# Contract: Projects UI (`src/features/projects/` + Course-detail / dashboard hooks)

React surfaces (function components + hooks, Tailwind/Obsidian theme). DI: `useDb()`, `useVault()`, `useActiveVaultId()` from the existing providers. jsdom-tested via the existing test-support (no jest-dom; `.toBeTruthy()`, `(el as HTMLInputElement).value`, `fireEvent`).

---

## `useProjects(courseId)` — `src/features/projects/useProjects.ts`

```ts
export function useProjects(courseId: string): {
  loading: boolean;
  projects: Project[];                 // this Course's projects, active-first
  milestones: Milestone[];             // course's milestones (for the picker)
  resources: Resource[];               // active-vault resources (for references)
  create(input: CreateProjectFormInput): Promise<CreateResult>;  // repo.createProject → materializeNewProject → refresh
  edit(id, input): Promise<MaterializeProjectResult>;            // setTitleCapability/Milestones/Resources → updateProjectFrontmatter
  markInProgress(id): Promise<void>;
  close(id, input: CloseFormInput): Promise<MaterializeProjectResult>; // repo.closeProject → closeProjectFile(reflection) → refresh
  remove(id, mode, opts?): Promise<RemoveProjectResult>;
  pendingReapply: ProjectDocModel | null;  // set on drift; UI offers "Reload & reapply"
  refresh(): Promise<void>;
};
// Mirrors useCourses: drives mutations, threads materialize/close/rescan results, exposes drift for the
// "reapply" affordance. CreateResult = { ok:true; materialize } | { ok:false; error }.
```

## `ProjectsSection` — mounted in `CourseDetailRoute.tsx`

- Renders under the existing Course-detail sections (alongside `CourseSessions`).
- Lists the Course's Projects: title, capability (dimmed), status chip, milestone count, resource count.
- "New Project" opens `ProjectForm`. Each row: edit, **mark in-progress** (when `open`), **Close…** (when active), **Delete…**.
- Empty state: a calm "No projects yet — applied practice is optional" (no nudge, no fabricated tiles — FR / SC-007/008).
- Completed/abandoned rows shown read-only with their outcome + closed date.

## `ProjectForm` — create/edit

- Fields: **title** (required), **capability** (required, one-line), **milestones** (multi-select, ≥1, limited to the Course's milestones — FR-002), **template** (select: math/proof · cs/implement · freeform · none), **opening framing** (optional textarea — **woven once into the created file's `## Problem` section**, then learner-owned; M1, not a discarded input), **resources** (optional rows: resource select + locator text).
- The framing value is passed through `useProjects.create` to `materializeNewProject(model, framing)` (creation only); it is not stored in the DB or frontmatter.
- Save disabled until title + capability + ≥1 milestone present. `aria-label`s on every control.
- **Read tolerance (M3):** when *editing* an existing Project that has zero milestones (left so by a Milestone deletion), the form MUST open without error and simply re-require ≥1 before the edit can be saved — it must not assume the Project already has ≥1.
- On drift conflict from materialize, surface "Reload & reapply".

## `CloseProjectDialog`

- Choice: **Complete** (capability claimed) vs **Abandon** (neutral — copy must not frame as failure).
- **Reflection** textarea ("What did you have to look up? What was hard?").
- **Spawn cards** (optional): editable front/back rows the learner adds/fills; "Add card" appends a row; each is manual. Optional "cite resources" multi-select.
- Confirm → `useProjects.close(id, { outcome, reflection, cards, citeResourceIds })`. Declining cards closes with none.
- Modal a11y mirrors `DeleteCourseDialog` (focus trap, Esc cancels, focus restore).

## `DeleteProjectDialog` (mirror of `DeleteCourseDialog`)

```ts
interface Props {
  title: string;
  projectPath: string | null;          // null if never materialized
  onCancel(): void;
  onConfirm(mode: DeleteProjectMode, opts: { overwrite?: boolean }): Promise<RemoveProjectResult>;
}
```
- If `projectPath`: radios **detach** (keep file, stop tracking) vs **delete the file too** (hard delete).
- On `conflict` (drifted/unmanaged): warn "changed in Obsidian" + offer **Delete anyway** (`{ overwrite: true }`).

## `SessionPlanner` extension (`src/features/courses/SessionPlanner.tsx`)

- Add an optional **Project** select (the Course's `open`/`in-progress` projects) → `PlanFormInput.projectId`.
- Labeled "Work block for project (optional)". Planning against a Project flips it to `in-progress` (repo side).

## Dashboard extension (`src/db/repositories/dashboard.ts` + `src/features/dashboard/`)

- `getDashboardSummary` (or a sibling read in `useDashboard`'s load) returns **active Projects per Domain** (count + minimal `{ id, title, courseId }` list), one grouped query joined through to the active vault.
- `DashboardView` renders an "Active projects" cell/section per Domain, linking to the Course-detail. Nothing rendered when zero (Constitution III — no fabricated data).

## Routing / navigation

- **No new route**: Projects live inside the existing `/courses/:courseId` detail screen and the dashboard. No nav change.

## Test focus

- Create flow blocks until title + capability + ≥1 milestone (US1).
- Milestone picker shows only the Course's milestones.
- Close as complete spawns exactly the rows the learner confirmed (and zero when declined); nothing auto-marks mastery (US2 / Constitution III).
- Abandon copy is neutral.
- Delete dialog offers detach vs delete-file and "delete anyway" on drift (US3).
- Dashboard shows no Project data when there are none.
