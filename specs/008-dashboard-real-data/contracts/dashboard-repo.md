# Contract — Dashboard read-model (`src/db/repositories/dashboard.ts`)

Read-only aggregate read-model over existing tables. Pure SQL; no writes; no new schema.

## Surface

```ts
export interface DashboardTotals { domains: number; courses: number; milestones: number; }

export interface MilestoneProgress {
  todo: number;
  inProgress: number;
  done: number;
  total: number;        // todo + inProgress + done
  percentDone: number;  // 0..100 integer; 0 when total === 0
}

export interface DomainAllocation {
  id: string;
  name: string;
  color: string;
  courseCount: number;
  milestoneCount: number;
}

export interface DashboardSummary {
  totals: DashboardTotals;
  milestoneProgress: MilestoneProgress;
  allocation: DomainAllocation[]; // one per Domain, ordered by name; includes Domains with 0 courses
}

export function getDashboardSummary(db: SqlExecutor): Promise<DashboardSummary>;
```

Exported from `src/db/index.ts` (additive).

## Behavior

- Runs a **constant** number of aggregate queries (≈3–4) — never one-per-course (FR-011).
- `milestoneProgress` counts the three statuses; a status missing from the `GROUP BY` result is `0` (do not assume all present).
- `percentDone = total === 0 ? 0 : Math.round(done / total * 100)` — never `NaN`.
- `allocation` uses `LEFT JOIN` so a Domain with zero Courses still appears (`courseCount: 0`), ordered by `name`.
- Every aggregate row is parsed through a zod schema (`selectParsed`); a status value outside the enum throws (data-integrity).
- Pure read — issues no `INSERT`/`UPDATE`/`DELETE`, touches no `.md`.

## Test obligations (`dashboard.test.ts`, `// @vitest-environment node`, `node:sqlite`)

1. **Totals** — seed N domains / M courses / K milestones → `totals` equals N/M/K.
2. **Status breakdown** — seed milestones across todo/in-progress/done → counts match; `total` sums them; `percentDone` correct (e.g. 12 done of 30 → 40).
3. **Empty DB** — all totals `0`, `milestoneProgress` all `0` with `percentDone: 0` (no `NaN`), `allocation` `[]`.
4. **Course with no milestones** — counted in `totals.courses`; contributes 0 milestones; no divide-by-zero.
5. **Domain with no courses** — still present in `allocation` with `courseCount: 0`, `milestoneCount: 0`.
6. **Allocation correctness** — multi-domain seed: each Domain's `courseCount`/`milestoneCount`/`color` correct; `sum(courseCount) === totals.courses`, `sum(milestoneCount) === totals.milestones`; ordered by name.
7. **Status outside enum** — a hand-inserted bad status row makes the parse throw (guards the zod boundary).
