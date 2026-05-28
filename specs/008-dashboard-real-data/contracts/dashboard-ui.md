# Contract — Dashboard UI (`useDashboard` + `DashboardRoute`)

## `useDashboard()` hook (`src/features/dashboard/useDashboard.ts`)

Mirrors `useDomains`/`useCourses`. Loads the read-model + the Course list; exposes vault status passthrough.

```ts
interface DashboardData {
  loading: boolean;
  summary: DashboardSummary | null;     // null while loading
  courseGroups: { domain: DomainAllocation; courses: Course[] }[]; // courses grouped by domain
}

export function useDashboard(): DashboardData;
```

Behavior:
- On mount, `Promise.all([getDashboardSummary(db), listCourses(db)])`; build `courseGroups` by bucketing courses into `summary.allocation` by `domain_id` (ordered by domain name, then course title).
- Re-reads on mount each time the screen is shown (FR-009) — no cross-session cache.
- Read-only — exposes no mutators.
- Uses `useDb()`; does **not** require `useVault()` (the data is vault-independent).

## `DashboardRoute` (`src/features/dashboard/DashboardRoute.tsx`)

Reads `useDashboard()` + `useVaultState()`. Renders:

1. **Vault status (FR-008)** — when `vault.status === "unset"`, the existing "No vault connected" Callout linking to `/vault`; when `ready`, a subtle "vault connected" indicator. Never gates the rest of the screen.
2. **Onboarding vs summary (FR-005)** — if `summary.totals.domains === 0`: an onboarding Panel/Callout linking to `/domains` ("create your first Domain") rather than a zero grid. Otherwise the tiles below.
3. **Totals (FR-001)** — `StatCell`s: Domains, Courses, Milestones.
4. **Milestone progress (FR-002)** — `MilestoneProgress`: a done/in-progress/todo segmented bar + "X/Y done (Z%)"; when `total === 0`, "no milestones yet" (no `NaN%`).
5. **Per-Domain allocation (FR-003)** — `DomainAllocation`: each Domain with its color dot, course & milestone counts, ordered by name; Domains with 0 courses still shown.
6. **At-a-glance Courses (FR-004)** — Domain-grouped list; each Course links to `/courses`; a `Tag` marks Courses that have a MOC (`moc_path` set). Reuses the CoursesRoute list idiom.
7. **Deferred retention tiles (FR-006/FR-007)** — `DeferredTiles`: streak / today's protocol / activity heatmap / recent sessions / due cards as muted shells, each with a "Phase 2" tag and an em-dash where a value will go. **No numbers, no populated heatmap, nothing marked "learned".**

## Test obligations (`DashboardRoute.test.tsx`, jsdom, `renderWithVault` + `makeReadyDb`)

1. **Vault banner** — no vault set → "No vault connected" Callout linking to `/vault` (carried over from the old test).
2. **Banner hidden when ready** — vault ready → no banner; summary renders.
3. **Real totals** — seed domains/courses/milestones → the totals + progress (e.g. "12/30 done (40%)") reflect the data.
4. **Per-domain allocation** — seed two domains with different course counts → each shows its real count; a zero-course domain still appears.
5. **Course navigation** — a seeded Course appears and links to `/courses`; a Course with `moc_path` shows the MOC tag.
6. **Onboarding empty state** — empty DB → onboarding prompt linking to `/domains`, not a zero headline grid.
7. **Deferred-tile honesty (SC-004)** — streak/heatmap/sessions/due-cards tiles are present, labeled "Phase 2", and render **no fabricated number** (assert the label; assert no real-looking count). Nothing reads "learned".
8. **Edge data** — a Course with no milestones renders without `NaN%`.
