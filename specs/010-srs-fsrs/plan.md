# Implementation Plan: Native FSRS Spaced Repetition (SRS)

**Branch**: `010-srs-fsrs` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-srs-fsrs/spec.md`

## Summary

Build the **retention engine** core (PRD §F3): a fully native, in-app spaced-repetition system so the user never leaves the platform to review. Four increments: **(US1)** a vault-wide due-queue review session driven by **FSRS** (`ts-fsrs`) behind a thin `Scheduler` seam, with retrieval-before-reveal and the four grades; **(US2)** manual card authoring on a new **Course detail** screen; **(US3)** confidence **calibration** (1–5, no default) feeding an "overconfident cards" dashboard surface; **(US4)** a **Resource registry** (8 kinds, per-kind metadata, vault-scoped) plus card **citations** — Resource deep-links (best-effort via the already-enabled `tauri-plugin-opener`) and Obsidian **block-refs** written through `VaultWriter`.

The SRS schema already exists (003); this feature gives it runtime meaning and adds **one additive migration** (`m0004`): `resources.vault_id` (so the registry is vault-scoped like 009 — not a cross-vault leak) and `cards.note_block_id` (to anchor a block-ref). Scheduling state is stored as JSON in `cards.fsrs_state`; the audit/calibration log is `reviews`. Reads/writes scope to the **active vault** (cards transitively via `course → domain.vault_id`; resources via the new column), and screen hooks re-key on `useActiveVaultId()` so a vault switch refreshes every view without restart.

**Scope note (senior-review):** the user's clarify choices (fuller registry + citations) make this larger than a pure FSRS core — it bundles the engine, review UI, calibration, a Resources management screen, citations, and a new Course-detail screen. It is kept as **one feature with four independently-testable user-story phases** (MVP = US1+US2); `/speckit-tasks` will sequence them so the engine + review loop land first and US4 can be deferred or split out without reworking US1–US3.

## Technical Context

**Language/Version**: TypeScript (strict), React 19 (function components + hooks).

**Primary Dependencies**: **one new runtime dep — `ts-fsrs`** (the locked FSRS implementation, quarantined behind the `Scheduler` seam). Otherwise existing only: the 003 SQLite layer (`SqlExecutor` + repos + `selectParsed`/`insert`/`update`/`upsert` + forward-only `migrate`), the 005 vault spine (`VaultReader`/`VaultWriter`/`VaultWriteLog`), the 006 `VaultProvider`/`DbProvider` roots + `useActiveVaultId` (009), React Router, the 002 component kit, and the already-enabled `@tauri-apps/plugin-opener`.

**Storage**: SQLite. **One additive migration** (`m0004_srs_scoping`): `resources.vault_id` + index, `cards.note_block_id`. Scheduling state in `cards.fsrs_state` (JSON); reviews in `reviews`; daily new-card cap in the `settings` key-value table (no schema change). One new vault-write surface — block-id markers inserted into existing notes through `VaultWriter` only.

**Testing**: Vitest. Engine (`scheduler.test.ts`) + block-id (`blockId.test.ts`) are pure/runtime-free. Repos + migration + scoping + cap + review-transaction tested under `// @vitest-environment node` against `node:sqlite` (`NodeSqlExecutor`, FK-on), using the 009 `attachVault`+`createDomain(db,VID,…)` seeding. Block-ref write over the node fs adapter + a temp vault. Screens/hooks via jsdom reusing `renderWithVault`/`renderApp`/`makeReadyDb` (seeded vault id). The opener call is injected so citation tests stay Tauri-free.

**Target Platform**: Tauri desktop (Windows/macOS/Linux); all logic runtime-agnostic and Tauri-free in tests (only `openCitation` touches `plugin-opener`, behind an injected seam).

**Project Type**: Desktop app — single React + TS frontend over a Tauri shell.

**Performance Goals**: Review feels instant per card (SC-001); the due query is a single indexed join (`idx_cards_due_at` + the `domains.vault_id` path) — no N+1. A vault switch re-scopes within ~1s (SC-004).

**Constraints**: Fully local. Retrieval-before-reveal enforced; confidence has **no default**; nothing auto-marked "learned" (Constitution III). The block-ref write must route through `VaultWriter`, be atomic + idempotent, and never clobber an externally-edited note (Constitution I). `ts-fsrs` imported in exactly one file; no leaky scheduler types (Constitution IV). Citation opening best-effort + graceful.

**Scale/Scope**: Single local user; tens–hundreds of cards per Course. One migration, one new runtime dep, ~4 repo modules (cards/reviews/resources/cardResources), the `Scheduler` seam + impl, the citation utilities, three UI surfaces (Review, Resources, Course-detail) + two dashboard tiles, one nav addition.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| **I. Vault Canonical & Sacred** | ✅ **Watch-item: the block-ref write.** Inserting `^block-id` into an existing note is the only new `.md`-write surface; it routes **only** through `VaultWriter` via read→modify→`writeNote`, honoring the `WriteResult` conflict/`overwrite` contract (never clobbers a drifted/open note — 007 reapply pattern). Block-ids are deterministic + idempotent (no marker build-up). `cards.front/back` in SQLite are sanctioned SRS artifacts (§8 tracking/knowledge boundary), not note bodies. No ad-hoc `fs` in feature/db code. |
| **II. AI Vendor-Agnostic Tutor** | ✅ No AI in this feature (manual authoring only; AI card-gen is Phase 3). `ts-fsrs` is a scheduling library, not an AI provider — no `Provider`/vendor SDK involvement. Cyan (AI-only color) is not used. |
| **III. Preserve Desirable Difficulty** | ✅ **Central to this feature.** Recall is gated before reveal (the back is absent from the DOM until `reveal()`). Confidence (F3.5) has **no default value** — submission blocked until the user picks (Constitution III verbatim). A card is "learned" only via a real review (`reviews` row) — never on creation; the dashboard shows literal counts only, no fabricated "learned". |
| **IV. Interface-First, Deep Modules** | ✅ FSRS is a deep module behind the `Scheduler` interface; `ts-fsrs` imported in one impl file; repos/hooks/UI depend on `Scheduler` + domain types (`Grade`/`SchedulingState`), never the library's `Rating`/`Card` enums (greppable, tested). Scheduling/scoping stay in the repository layer over the `SqlExecutor` seam; the citation opener is injected behind a seam so the UI doesn't import Tauri. No leaky abstractions. |
| **V. Spec-Driven Development** | ✅ Spec written, validated, clarified; full Phase 1 doc set here. **PRD reconciliation:** F3 ships as scaffolded across US1–US4; PRD §F3.5/F3.6/F3.7 are realized, and the Resources registration half of §F2.3/F10.8 is pulled forward — to be noted in `PRD-CIC-Platform.md` during `/speckit-implement` (a tracked task), per "spec updated before code drifts". Mandatory walkthrough at the end. |

**Result: PASS.** Two watch-items (the block-ref vault write; the `ts-fsrs` quarantine) are satisfied by routing through `VaultWriter` and the `Scheduler` seam respectively. No violations → no Complexity Tracking entries. The feature's size is a *sequencing* consideration (handled via independently-testable US phases), not a Constitution violation.

## Project Structure

### Documentation (this feature)

```text
specs/010-srs-fsrs/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R13
├── data-model.md        # Phase 1 — m0004 migration, Card/Review/SchedulingState/Resource, scope paths
├── quickstart.md        # Phase 1 — manual scenarios A–H
├── contracts/
│   ├── scheduler.md         # Scheduler seam (ts-fsrs behind a thin interface) + monotonicity guarantees
│   ├── srs-data.md          # migration + cards/reviews/resources/cardResources repo signatures
│   ├── blockref-citations.md# block-id insertion via VaultWriter + opener deep-link, best-effort
│   └── ui-srs.md            # Review screen, Course detail, Resources screen, dashboard surfaces, routing
└── checklists/
    └── requirements.md  # (from /speckit-specify)
```

### Source Code (repository root)

```text
src/
├── db/
│   ├── migrations/
│   │   ├── m0004_srs_scoping.ts   # NEW — resources.vault_id + index, cards.note_block_id (additive)
│   │   └── index.ts               # register m0004 (append-only)
│   ├── migrate.test.ts            # bump latest→v4 (applied:4); evolution/lossless/settings tests too
│   └── repositories/
│       ├── cards.ts               # NEW — create/update/delete/get/listByCourse/listDueCards/countDueCards
│       ├── reviews.ts             # NEW — recordReview (txn), listByCard, getOverconfidentCards
│       ├── resources.ts           # NEW — register/list/update/delete + course links (vault-scoped)
│       ├── cardResources.ts       # NEW — add/remove/list card↔resource citations (locator)
│       ├── *.test.ts              # NEW — node:sqlite scoping/cap/txn/overconfidence/cascade
│       └── index (src/db/index.ts)# append new barrels
├── features/
│   ├── srs/                       # NEW — the review engine + session
│   │   ├── fsrs/
│   │   │   ├── types.ts           # Grade, SchedulingState, GradeResult
│   │   │   ├── scheduler.ts       # createScheduler() — ONLY file importing ts-fsrs
│   │   │   ├── schedulingState.ts # zod schema for fsrs_state JSON
│   │   │   └── scheduler.test.ts  # monotonicity, mapping, determinism, round-trip, no-leak
│   │   ├── citations/
│   │   │   ├── blockId.ts         # deterministic id + ensureBlockMarker (pure)
│   │   │   ├── blockRef.ts        # citeNoteParagraph via VaultReader/Writer (conflict-aware)
│   │   │   ├── openTarget.ts      # resourceTarget + openCitation (plugin-opener, injected)
│   │   │   └── *.test.ts
│   │   ├── ReviewRoute.tsx        # vault gate → ReviewSession
│   │   ├── ReviewSession.tsx      # retrieval-before-reveal, grades, confidence (no default), empty state
│   │   ├── useReview.ts           # keyed [db, vaultId]; listDueCards + recordReview
│   │   └── *.test.tsx
│   ├── resources/                 # NEW — the registry
│   │   ├── ResourcesRoute.tsx     # vault gate → registry
│   │   ├── useResources.ts        # keyed [db, vaultId]
│   │   ├── ResourceForm.tsx       # kind-aware metadata fields (R13)
│   │   └── *.test.tsx
│   ├── courses/
│   │   ├── CourseDetailRoute.tsx  # NEW — per-course card list + authoring + citation editor
│   │   ├── CardForm.tsx           # NEW — front/back/links + citation editor
│   │   ├── CoursesRoute.tsx       # rows link to /courses/:id
│   │   └── *.test.tsx
│   └── dashboard/
│       ├── DeferredTiles.tsx      # "Due cards" placeholder → real countDueCards
│       ├── OverconfidentTile.tsx  # NEW — getOverconfidentCards surface
│       └── useDashboard.ts        # +due count +overconfident (still [db, vaultId]-keyed)
└── app/
    ├── navigation.ts              # /review → implemented; + /resources
    └── router.tsx                 # real ReviewRoute; + /resources, + /courses/:courseId
```

**Structure Decision**: Follow the established seams. The **FSRS engine** is a deep module behind `Scheduler` (`src/features/srs/fsrs/`), the sole importer of `ts-fsrs` — features depend on the interface (Constitution IV). **Scheduling + scoping logic** stays in the **repository layer** (vault-id-scoped functions over `SqlExecutor`), so the UI never sees SQL or FSRS internals. The **block-ref write** is the one new `.md` surface and goes through `VaultWriter` (Constitution I); the **opener** call is the one Tauri touch and is injected behind a seam. UI mirrors the 009 gate→manager + `useActiveVaultId` re-keying convention and reuses the 002 kit. The **migration** appends `m0004` (additive DDL only) to the forward-only runner.

## Complexity Tracking

> No Constitution violations — section intentionally empty. The feature's breadth (engine + review UI + calibration + Resource registry + citations + a new Course-detail screen) is managed as **four independently-testable user-story phases** (MVP = US1+US2), not unjustified complexity; `/speckit-tasks` sequences them so US4 can be split into its own feature later without reworking US1–US3 if desired.
