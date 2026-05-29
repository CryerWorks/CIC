# Contract — SRS UI (screens, routing, reactivity)

Mirrors the 009 pattern: outer vault gate → inner manager; feature hooks re-key on `useActiveVaultId()` so a vault switch refreshes every view without restart. Reuses the 002 kit (`Panel`, `Segmented`/`Rating`, `Citation`, `Callout`, `Tag`, `StatCell`, `Button`). Obsidian theme — purple is brand; **cyan is reserved for AI and is not used here**.

## Navigation & routes (`src/app/navigation.ts`, `src/app/router.tsx`)

- `/review` — flip `DESTINATIONS` entry to `implemented: true`; route element → real `ReviewRoute` (replaces placeholder).
- `/resources` — **new** `DESTINATIONS` entry + `<Route path="resources" element={<ResourcesRoute />} />`.
- `/courses/:courseId` — **new** detail route + `<Route path="courses/:courseId" element={<CourseDetailRoute />} />`; the Courses list links each row to it.

## Review screen (`src/features/srs/`) — US1 + US3

- `ReviewRoute.tsx`: outer gate — `useVaultState()`; `checking` → loader, not `ready` → `<Callout>` "Connect a vault first" with a `/vault` link. Ready → `<ReviewSession />`.
- `useReview.ts`: keyed on `[db, vaultId]` (`useActiveVaultId()`); loads `listDueCards(db, vaultId, now, cap)` (cap from `getSetting`). Exposes `current`, `revealed`, `reveal()`, `grade(grade, confidence, elapsedMs)`, `remaining`, `done`.
- **Retrieval-before-reveal (FR-005, Constitution III):** the back is not rendered/in the DOM until `reveal()`. Grade buttons (`Segmented`, 4 grades) appear only after reveal; each may show the `scheduler.preview` interval hint.
- **Confidence (FR-013, R11):** a 1–5 control with **no preselected value**; `grade(...)` is disabled until the user picks one. No autofill.
- **Empty/caught-up (FR-008):** queue empty → calm "All caught up" panel (or onboarding when the vault has zero cards) — never a fabricated card.
- **Vault switch (FR-020):** changing the active vault re-runs the load (queue re-scopes); switching back restores that vault's queue.

## Course detail (`src/features/courses/CourseDetailRoute.tsx`) — US2 + US4

- Vault-gated like CoursesRoute; reads the course + `listCardsByCourse`.
- Header (title, domain, MOC tag) + a **Cards** section: list each card (front preview, due/new badge via `Tag`, citation count), plus **add / edit / delete** (`createCard`/`updateCardContent`/`deleteCard`).
- Card form: front, back, optional milestone/note path; a **citation editor** (US4) — add/remove Resource citations with a locator (`addCardResource`/`removeCardResource`) and optionally cite a note paragraph (`citeNoteParagraph` → store `note_block_id`; surface a drift conflict with a "cite anyway" action).
- Editing front/back must not reset scheduling (FR-011).

## Resources screen (`src/features/resources/`) — US4

- `ResourcesRoute.tsx`: vault-gated; `useResources.ts` keyed on `[db, vaultId]` → `listResources(db, vaultId)`.
- Registry: list Resources (kind `Tag`, title, linked-course count); **register/edit/delete** with a kind-aware form (`registerResource`/`updateResource`/`deleteResource`) — fields per `ResourceMetadata` (R13); link to Courses (`linkResourceToCourse`, role).
- Delete confirms (destructive) and removes citations without orphaning cards.

## Dashboard surfaces (`src/features/dashboard/`) — real data only (Constitution III)

- Replace the `DeferredTiles` **"Due cards"** placeholder with a live count via `countDueCards(db, vaultId, now, cap)`; clicking routes to `/review`.
- Add an **"Overconfident"** calibration tile/list from `getOverconfidentCards(db, vaultId)` (empty state when none). No fabricated numbers; nothing shown as "learned" without a real review (SC-007).
- `useDashboard.ts` extends its `[db, vaultId]`-keyed load with these two reads.

## Tests
- Component tests (jsdom) reuse `renderWithVault`/`renderApp` + a seeded vault id + `makeReadyDb` (009 helpers): retrieval-before-reveal hides the answer; grade advances; confidence required (grade disabled until picked); empty state; vault gate; due count + overconfident tiles render real seeded data; Course-detail card CRUD; Resources registry CRUD.
- Accessibility: rating + confidence controls keyboard-operable and labelled (`a11y.test.tsx` extended).
