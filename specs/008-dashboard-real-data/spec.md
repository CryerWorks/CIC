# Feature Specification: Command Center Dashboard (real data)

**Feature Branch**: `008-dashboard-real-data`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Command Center Dashboard fed by real data (F8, Phase 1). Replace the placeholder Dashboard with a real landing screen that summarizes the learner's current state from the data that exists today — the Domain → Campaign → Course → Milestone hierarchy in SQLite plus vault-connection status. … Deferred-but-visible: the retention tiles (streak, today's protocol checklist, activity heatmap, recent sessions, due cards) are shown as clearly-labeled, non-fabricated 'arrives in Phase 2' states and MUST NOT display fake numbers or mark anything 'learned'."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See my real learning state at a glance (Priority: P1)

When the learner opens the app, the Dashboard greets them with a true summary of what they have built so far — how many Domains, Courses, and Milestones they have, and how far along their milestones are overall — instead of a placeholder panel. The numbers are read from their actual stored data, so the dashboard is a trustworthy mirror of reality.

**Why this priority**: This is the whole point of the feature — replacing the placeholder with a real, honest landing screen. On its own it already turns the home screen from a stub into something that reflects the learner's work and closes the Phase 1 milestone.

**Independent Test**: With a few Domains/Courses/Milestones already created, open the Dashboard and confirm the totals and the overall milestone-progress figure match the data; with the data changed and the screen re-opened, the figures update.

**Acceptance Scenarios**:

1. **Given** the learner has 4 Domains, 7 Courses, and 30 Milestones (12 done), **When** they open the Dashboard, **Then** it shows those counts and an overall progress of 12/30 (40%).
2. **Given** the learner marks more milestones done and returns to the Dashboard, **When** the screen loads, **Then** the progress figure reflects the new state (no stale numbers, no app restart required).
3. **Given** a Course has no Milestones yet, **When** the Dashboard renders, **Then** it shows that Course without producing a broken or "NaN%" progress value.

---

### User Story 2 - Understand where my effort is allocated and jump to a Course (Priority: P2)

The learner wants to see how their study is distributed across Domains — which subjects hold the most Courses/Milestones — and to move quickly from the Dashboard into a specific Course. Each Domain is shown with its own color (matching the Domains screen), and the Course list is grouped by Domain and links through to the Courses screen.

**Why this priority**: Allocation + navigation make the dashboard a launchpad rather than just a readout. It builds directly on US1's data but adds orientation and a path to act, so it follows once the core summary exists.

**Independent Test**: With Courses spread across multiple Domains, open the Dashboard and confirm each Domain's course/milestone counts and color are correct, and that clicking a Course (or its Domain) navigates to the Courses screen.

**Acceptance Scenarios**:

1. **Given** Math has 3 Courses and CS has 2, **When** the Dashboard renders the allocation tile, **Then** each Domain shows its real course (and milestone) count alongside its color.
2. **Given** the learner sees a Course on the Dashboard, **When** they click it, **Then** they land on the Courses screen.
3. **Given** a Domain has no Courses, **When** the allocation tile renders, **Then** the Domain still appears (shown as having zero Courses) rather than being silently dropped.
4. **Given** a Course has a materialized MOC, **When** it appears in the Dashboard list, **Then** its MOC presence is indicated (consistent with the Courses screen).

---

### User Story 3 - Honest onboarding and honest "coming later" tiles (Priority: P3)

A brand-new learner with no Domains or Courses is guided toward creating their first ones rather than shown empty zeroed tiles. And the retention-focused tiles that the war-room HUD is known for — streak, today's protocol checklist, activity heatmap, recent sessions, due-cards — are shown as clearly-labeled "arrives later" states, because the data that feeds them does not exist yet. They never show fabricated or zeroed-as-if-real numbers, and nothing on the screen claims anything was "learned."

**Why this priority**: It protects two things the product cares about: a welcoming first run, and intellectual honesty (a core principle — never fake retention signals or smooth away the work). It's P3 because it polishes the edges of the screen US1/US2 establish.

**Independent Test**: With an empty database, open the Dashboard and confirm it shows actionable onboarding (links to create a Domain/Course) rather than blank tiles; confirm each retention tile is labeled as not-yet-available and shows no numeric value presented as real.

**Acceptance Scenarios**:

1. **Given** a fresh install with no Domains, **When** the learner opens the Dashboard, **Then** it shows a welcoming prompt that links to create their first Domain (and Course) rather than "0 / 0 / 0" as the headline.
2. **Given** any state, **When** the Dashboard shows the streak / heatmap / sessions / due-cards tiles, **Then** each is visibly labeled as not yet available (Phase 2) and displays no fabricated count.
3. **Given** any state, **When** the Dashboard renders, **Then** no element marks a Milestone, Card, or Course as "learned" or auto-completes it.

---

### Edge Cases

- **No vault connected**: the Dashboard still renders the (vault-independent) Domain/Course/Milestone summary; the existing "connect a vault" guidance remains visible, and when a vault is connected the screen indicates it is active.
- **Empty database (new user)**: actionable onboarding instead of zeroed headline tiles (US3).
- **Course with zero Milestones**: counted as a Course; contributes no milestones; no divide-by-zero in progress.
- **Domain with zero Courses**: still listed in allocation as having zero Courses.
- **Many Domains/Courses**: the screen stays readable (grouping/scroll); figures stay correct and the screen still loads quickly.
- **Deferred tiles**: streak/heatmap/sessions/due-cards never show a fabricated or zeroed-as-real value — only a labeled not-yet-available state.

## Requirements *(mandatory)*

### Functional Requirements

**Real-data summary**

- **FR-001**: The Dashboard MUST display the learner's real counts of Domains, Courses, and Milestones, derived from stored data.
- **FR-002**: The Dashboard MUST display overall Milestone progress — the count and percentage of Milestones that are done (and the breakdown across the todo / in-progress / done statuses) across all Courses.
- **FR-003**: The Dashboard MUST display per-Domain allocation — the number of Courses (and Milestones) within each Domain — shown with each Domain's color.
- **FR-004**: The Dashboard MUST present Courses grouped by Domain, each navigable to the Courses screen, and MUST indicate whether a Course has a materialized MOC.
- **FR-009**: The Dashboard MUST reflect the current stored data whenever it is opened (re-read on view; no stale values requiring an app restart).
- **FR-010**: The Dashboard MUST render correctly for partial/edge data shapes — Courses with no Milestones, Domains with no Courses, and an empty database — without errors or nonsensical values (e.g., no "NaN%").
- **FR-012**: Every figure shown MUST be derived only from real stored records — no hardcoded, sample, or fabricated data.

**Onboarding & honesty**

- **FR-005**: When the learner has no Domains (and/or no Courses), the Dashboard MUST present actionable onboarding that links to creating a first Domain/Course rather than displaying empty/zeroed headline tiles.
- **FR-006**: The retention tiles (current/longest streak, today's protocol / Daily Loop checklist, activity heatmap, recent Sessions, due-cards count) MUST be shown as clearly-labeled not-yet-available states and MUST NOT display fabricated values or zeros presented as real data.
- **FR-007**: The Dashboard MUST NOT mark any Milestone, Card, or Course as "learned" or complete on its own, and MUST NOT fabricate streaks or activity history (preserve desirable difficulty).

**Context**

- **FR-008**: The Dashboard MUST surface vault-connection status — guidance to connect when no vault is set, and an indication that the vault is active when connected.
- **FR-011**: The Dashboard MUST remain readable and load quickly as the number of Domains and Courses grows (no degradation that makes the screen feel broken or slow).

### Key Entities *(include if feature involves data)*

- **Domain** *(existing)*: top-level subject area; has a name and a color. Drives allocation grouping.
- **Campaign** *(existing)*: optional long-arc grouping spanning Courses. (Available; not required to be surfaced in this feature.)
- **Course** *(existing)*: the enrollable unit; belongs to one Domain, optionally a Campaign; may have a materialized MOC.
- **Milestone** *(existing)*: a capability gate within a Course, carrying a status (todo / in-progress / done). Drives progress figures.
- **Vault connection state** *(existing)*: whether an Obsidian vault is connected and active.
- **Dashboard summary** *(derived, read-only)*: the aggregated view computed from the above — totals, status breakdowns, per-Domain allocation. Not a new persisted entity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On opening the app with existing data, the learner sees real Domain/Course/Milestone counts and an overall Milestone-progress figure — never the old placeholder — and the screen is usable within ~1 second.
- **SC-002**: The per-Domain allocation and the overall progress figures match the actual stored data in 100% of cases (independently verifiable by counting records).
- **SC-003**: A brand-new learner with no data is shown an actionable next step (create a first Domain/Course) rather than a blank or zeroed headline.
- **SC-004**: 100% of the deferred retention tiles are labeled as not-yet-available and show no fabricated number; zero tiles present fake or placeholder-as-real values.
- **SC-005**: The Dashboard renders without error across edge data shapes — empty database, Courses with zero Milestones, Domains with zero Courses, and a large number of Courses.
- **SC-006**: Every number on the Dashboard is traceable to a stored record; there is no hardcoded or sample data anywhere on the screen.

## Assumptions

- The existing Domain / Campaign / Course / Milestone data model and its repositories (Feature 003), the app shell + navigation (Feature 004), the active-vault state (Feature 006), and Courses/Milestones (Feature 007) are reused as-is; **no new persistent schema** is introduced.
- Milestone status values are todo / in-progress / done (as established in Features 003/007); "done" drives the progress percentage.
- Domains carry a color (Feature 004); that color is reused for allocation.
- Domain/Course/Milestone records exist in the local store independent of whether a vault is connected, so the summary renders even with no vault; vault status is shown alongside but does not gate the summary.
- There is no per-Course recency timestamp today, so the Course list is an at-a-glance list ordered consistently with the Courses screen (grouped by Domain) rather than a true "most recent" list.
- The Dashboard is read-only — it never mutates Domains, Courses, or Milestones.
- Single local user; no authentication or multi-user concerns.

### Out of Scope (deferred to later features/phases)

- Any tile fed by **Sessions, Cards, or SRS** data with real values — current/longest streak, today's protocol / Daily Loop checklist, 12-week activity heatmap, recent Sessions, due-cards count (Phase 2; shown only as labeled placeholders here).
- The note-link **graph view** and the **backlink index** (F7, later).
- Any **AI** feature.
- The **Daily Loop** itself (F2).
- **Live file-watching** / real-time vault sync.
- A **customizable / configurable** dashboard layout, widget reordering, or date-range filtering.
