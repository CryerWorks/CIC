# Feature Specification: Interleaving Scheduler (F6)

**Feature Branch**: `021-interleaving` | **Created**: 2026-06-15

**Input**: F6 Interleaving Scheduler / Desirable-Difficulty Engine. Pure logic — no AI. Surfaces cold domains/courses, distributes review load, suggests daily mix across domains, respects prereqs. Headless scheduler feeding Dashboard recommendations.

## User Stories

### US1: Dashboard Daily Mix (P1)
On the Dashboard, the learner sees a "Today's Mix" tile showing which domain/course to study next, drawn from multiple domains to enforce interleaving — not batching one domain until done.

### US2: Cold-Surface (P2)
Courses/domains not touched in a configurable N days (default 7) are highlighted as "cold" on the Dashboard, nudging rotation.

### US3: Prereq Respect (P3)
The scheduler never suggests a course whose dependency prereqs are unmet — the learner has completed at least one session in each declared prereq course.

## Functional Requirements
- FR-001: `getDailyMix(vaultId, config)` — returns ordered list of 3-5 recommended next-study items across domains
- FR-002: Mix draws from courses with pending sessions + due reviews, interleaved across domains
- FR-003: `getColdDomains(vaultId, days)` — returns domains with no sessions in N days
- FR-004: `respectPrereqs(courseId)` — returns false if any declared prereq has zero completed sessions
- FR-005: Dashboard "Today's Mix" tile + "Going Cold" tile
- FR-006: Configurable cold threshold (default 7 days) in settings

## Success Criteria
- SC-001: Daily mix returns results in under 200ms (3 SQL queries max)
- SC-002: Two adjacent recommendations are from different domains (interleaved)
- SC-003: Zero recommendations for courses with unmet prereqs

## Key Entities
- `course_dependencies` table (NEW m0012): course_id, prereq_course_id

## Out of scope
- AI-driven mix selection (v1 is heuristic)
- Custom scheduling rules
- Mobile/background scheduling
