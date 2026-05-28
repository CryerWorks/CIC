# Quickstart — Command Center Dashboard (real data)

Manual runtime verification in `npm run tauri dev`. The automated Vitest suite covers the repo aggregates + the screen; this is the live check the user runs.

## Prerequisites
- `npm run tauri dev` running.
- (Optional) an Obsidian vault connected via `/vault` — not required for the dashboard to render.

## Scenario A — Real summary with existing data (US1 · SC-001/SC-002)
1. Have a few Domains, Courses, and Milestones (create via `/domains` and `/courses`, or from a prior session).
2. Open the Dashboard (`/`).
3. **Expect**: Domains / Courses / Milestones counts match reality; the milestone-progress bar shows "X/Y done (Z%)" matching the milestone statuses you set. No placeholder text.

## Scenario B — Progress updates on return (US1)
1. On `/courses`, mark another Milestone done (edit a Course).
2. Return to the Dashboard.
3. **Expect**: the progress figure increased — no stale number, no app restart.

## Scenario C — Per-domain allocation + navigation (US2)
1. With Courses spread across ≥2 Domains, view the allocation tile.
2. **Expect**: each Domain shows its real course/milestone counts in its own color; a Domain with no Courses still appears (0 courses).
3. Click a Course in the at-a-glance list.
4. **Expect**: you land on the Courses screen. Courses with a materialized MOC show the "MOC" tag.

## Scenario D — New-user onboarding (US3 · SC-003)
1. With an empty database (fresh profile / no Domains), open the Dashboard.
2. **Expect**: a welcoming prompt linking to create your first Domain — not a "0 / 0 / 0" headline grid.

## Scenario E — Deferred tiles are honest (US3 · SC-004 · Constitution III)
1. On the Dashboard, find the streak / today's protocol / activity heatmap / recent sessions / due-cards tiles.
2. **Expect**: each is clearly labeled "arrives in Phase 2", shows an em-dash (not a number), and there is **no** populated heatmap and **nothing** marked "learned". No fabricated streak or activity.

## Scenario F — Vault status, but not gated (FR-008 · R7)
1. With **no** vault connected, open the Dashboard.
2. **Expect**: the "No vault connected" banner shows AND the Domain/Course/Milestone summary still renders (the dashboard is read-only over SQLite, not vault-gated).
3. Connect a vault via `/vault`, return.
4. **Expect**: the banner is gone / replaced by a "vault connected" indicator; the summary is unchanged.

## Edge checks
- A Course with zero Milestones renders without `NaN%`.
- Many Courses: the screen stays readable and loads quickly (≈1s).
