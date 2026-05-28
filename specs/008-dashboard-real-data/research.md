# Research — Command Center Dashboard (real data)

Phase 0 decisions. Each: Decision · Rationale · Alternatives rejected.

## R1 — Read-model: SQL aggregates vs JS aggregation

**Decision**: A dedicated read-only module `src/db/repositories/dashboard.ts` exposing `getDashboardSummary(db)`, computed with a small fixed set of `GROUP BY` aggregate queries (totals, milestone-status breakdown, per-Domain allocation). Each aggregate row is parsed through an ad-hoc `zod` schema via `selectParsed`.

**Rationale**: Honors the spec's "aggregate queries, no per-course N+1" (FR-011) — the query count is constant regardless of how many Courses exist. Keeps SQL in the SQLite deep module (Constitution IV); the feature sees a typed summary object. `node:sqlite` makes the aggregates unit-testable without Tauri.

**Alternatives rejected**:
- *Load all rows via `listDomains`/`listCourses`/`listMilestonesByCourse` and aggregate in JS* — the per-course milestone fetch is the exact N+1 the spec forbids; and re-deriving counts in JS duplicates what SQL does well.
- *A SQL `VIEW`* — would be a schema change (the spec mandates none) and is harder to unit-test incrementally.

## R2 — Deferred retention tiles: how to be honest (Constitution III)

**Decision**: Render the streak / today's-protocol / activity-heatmap / recent-sessions / due-cards tiles as **labeled placeholder shells** — a muted Panel each, a "Phase 2" tag, and an em-dash (`—`) where a number will later go. **No populated heatmap, no `0`-as-if-real.** A single `DeferredTiles` component owns them.

**Rationale**: FR-006/FR-007 + SC-004 + Constitution III: the platform must never fabricate retention signals or imply progress that didn't happen. A real-looking heatmap of fake data, or a "0-day streak", reads as real and is exactly the illusion to avoid. A visible-but-labeled shell sets the right expectation ("this lights up in Phase 2") without lying.

**Alternatives rejected**:
- *Hide the tiles entirely until Phase 2* — loses the product's "command center" shape and the signal that these are coming; the user explicitly asked for visible-but-labeled.
- *Show `0` / empty heatmap* — a zero presented in a normal tile is indistinguishable from a real zero; violates SC-004.

## R3 — Feature/screen structure

**Decision**: Create `src/features/dashboard/` (hook + screen + presentational tiles); move the screen out of `src/app/routes/DashboardRoute.tsx` and wire the router to the feature; delete the old placeholder route + its test (rewritten under the feature).

**Rationale**: Direct precedent — Feature 007 placed `CoursesRoute` under `src/features/courses/` and removed the `app/routes` placeholder. Matching it keeps feature code co-located and the router thin. The CLAUDE.md target structure puts features under `src/features/`.

**Alternatives rejected**:
- *Keep the screen in `src/app/routes/`* — inconsistent with the most recent feature and scatters dashboard pieces across two trees.

## R4 — Milestone progress representation

**Decision**: A small feature-local `MilestoneProgress` component: a horizontal segmented bar (done / in-progress / todo) plus a "X/Y done (Z%)" label. Built inline with Tailwind; **not** promoted to the shared component kit yet.

**Rationale**: One consumer today. "Three similar lines beat a premature abstraction" — promote to `src/components/ui` only when a second screen needs it (likely Phase 2). Uses theme tokens (`success` for done, `brand` for in-progress, muted for todo) consistent with the kit.

**Alternatives rejected**:
- *Add a `ProgressBar` to the component kit now* — premature; no second consumer.
- *Reuse `Heatmap`/`StatCell` only* — a status breakdown wants a proportional bar, which neither provides.

## R5 — Course list ordering ("recent" vs at-a-glance)

**Decision**: No per-Course recency timestamp exists (the `courses` table has no `created_at`/`updated_at`). The Dashboard's Course list is an **at-a-glance** list grouped by Domain and ordered like the Courses screen (Domain name, then Course title) — not a true "most recent" list.

**Rationale**: Honest to the data we have; reuses the existing `listCourses` ordering and the grouping the user already sees on the Courses screen. Avoids inventing a recency signal (which would also brush Constitution III's "no fabrication" spirit).

**Alternatives rejected**:
- *Add a `created_at` column to fake recency* — a schema change the spec forbids, for marginal value.
- *Order by `rowid`* — implementation-leaky and not meaningful to the user.

## R6 — Empty / onboarding state

**Decision**: When there are no Domains, the Dashboard leads with an onboarding Callout/Panel linking to create a first Domain (and mentions Courses follow). When Domains exist but no Courses, the allocation/Course area guides to create a first Course. Totals still render (they're honestly `0`/`0`/`0` only *after* the user has structure; the headline for a truly empty DB is the onboarding prompt, not a zero grid).

**Rationale**: FR-005 + SC-003: a new user should get a next step, not a wall of zeros. Reuses the existing `Callout` pattern already used by the vault banner and CoursesRoute.

**Alternatives rejected**:
- *Always show the zero grid* — unwelcoming and uninformative for a first run (SC-003 fails).

## R7 — Vault status surfacing (don't gate on it)

**Decision**: Reuse `useVaultState()`. Keep the existing "No vault connected" Callout when `status === "unset"`; when `ready`, show a small "vault connected/active" indicator. The summary renders **regardless** of vault status (Domain/Course/Milestone rows live in SQLite independent of the vault).

**Rationale**: FR-008. Unlike the Courses *authoring* screen (which gates on a vault because it writes MOCs), the Dashboard only *reads* SQLite, so it must not be blocked by a missing vault. The "MOC present?" tag is derived from `moc_path` and simply shows absent if unset.

**Alternatives rejected**:
- *Gate the whole Dashboard on a connected vault (like CoursesRoute)* — wrong: the dashboard's data isn't vault-dependent, and a user mid-setup should still see their structure.

## Cross-cutting notes

- **Performance (FR-011/SC-001)**: `getDashboardSummary` is ≈3 aggregate queries; the hook adds one `listCourses`. Constant query count; safe at expected scale.
- **Edge data (FR-010/SC-005)**: percent-done guards against `total === 0` (→ render "no milestones yet", not `NaN%`); `LEFT JOIN` keeps Domains with zero Courses in allocation.
- **Testability**: aggregates are pure SQL over `node:sqlite`; the screen is exercised with `renderWithVault` + a seeded `makeReadyDb`, asserting real counts and the deferred-tile labels.
