# Data Model — Command Center Dashboard (real data)

**No new persistent schema.** This feature adds a *derived, read-only* read-model computed from existing tables (`domains`, `courses`, `milestones`). Nothing is written.

## Existing tables consumed (read-only)

- `domains(id, name, color)` — allocation grouping + color.
- `courses(id, title, domain_id, campaign_id, moc_path)` — counts; `moc_path` → "has MOC" flag; Course list.
- `milestones(id, course_id, capability, status, order_index)` — `status ∈ {todo, in-progress, done}` drives progress.

`campaigns` exists but is **not surfaced** by this feature.

## Derived read-model: `DashboardSummary`

The shape `getDashboardSummary(db)` returns. All numbers are literal counts of stored rows.

```text
DashboardSummary
├── totals
│   ├── domains: number          # COUNT(*) FROM domains
│   ├── courses: number          # COUNT(*) FROM courses
│   └── milestones: number       # COUNT(*) FROM milestones
├── milestoneProgress
│   ├── todo: number             # COUNT WHERE status='todo'
│   ├── inProgress: number       # COUNT WHERE status='in-progress'
│   ├── done: number             # COUNT WHERE status='done'
│   ├── total: number            # todo+inProgress+done
│   └── percentDone: number      # round(done/total*100); 0 when total===0 (UI shows "no milestones yet")
└── allocation: DomainAllocation[]   # one row per Domain, ordered by name
    └── DomainAllocation
        ├── id: string
        ├── name: string
        ├── color: string
        ├── courseCount: number   # COUNT(DISTINCT courses) in this domain (0 allowed)
        └── milestoneCount: number # COUNT(milestones) under this domain's courses
```

The **at-a-glance Course list** is not part of `DashboardSummary`; the hook fetches it via the existing `listCourses(db)` and groups it by `domain_id` using `allocation` (which already carries id/name/color). This keeps the summary purely numeric and reuses the canonical Course ordering.

## Aggregate queries (constant count — no N+1)

1. **Totals + status breakdown** — milestone status counts in one grouped query; domain/course totals as two scalar counts (or a small `UNION`/separate counts). Conceptually:
   - `SELECT status, COUNT(*) AS n FROM milestones GROUP BY status`
   - `SELECT COUNT(*) AS n FROM domains` · `SELECT COUNT(*) AS n FROM courses`
2. **Per-Domain allocation** — single grouped `LEFT JOIN` so Domains with zero Courses still appear:
   ```sql
   SELECT d.id, d.name, d.color,
          COUNT(DISTINCT c.id)  AS course_count,
          COUNT(m.id)           AS milestone_count
   FROM domains d
   LEFT JOIN courses c    ON c.domain_id = d.id
   LEFT JOIN milestones m ON m.course_id = c.id
   GROUP BY d.id, d.name, d.color
   ORDER BY d.name;
   ```

Total: ~3–4 queries irrespective of data size.

## Validation (zod, at the read boundary)

Aggregate rows are validated through ad-hoc zod schemas via `selectParsed` (Constitution: never trust raw row shape). Sketch:

- `StatusCountRow = z.object({ status: MilestoneStatusSchema, n: z.number().int().nonnegative() })`
- `CountRow = z.object({ n: z.number().int().nonnegative() })`
- `AllocationRow = z.object({ id: z.string(), name: z.string(), color: z.string(), course_count: z.number().int().nonnegative(), milestone_count: z.number().int().nonnegative() })`

`MilestoneStatusSchema` is the existing enum (`src/db/models/enums`). A status outside the enum throws (data-integrity signal), consistent with the rest of the repo layer.

## Invariants & edge handling

- `milestoneProgress.total === totals.milestones` (the breakdown sums to the total).
- `sum(allocation[].courseCount) === totals.courses`; `sum(allocation[].milestoneCount) === totals.milestones`.
- `percentDone` guards `total === 0` → `0` (UI renders "no milestones yet", never `NaN%`).
- Empty DB → `totals` all `0`, `allocation` empty → UI shows onboarding (not a zero grid).
- A status absent from the `GROUP BY` result defaults to `0` (don't assume all three statuses are present).

## State transitions

None — read-only. The Dashboard never mutates Domains, Courses, or Milestones (FR-007).
