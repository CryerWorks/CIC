---
description: "Task list for Feature 009 — Vault-scoped data (per-vault datasets)"
---

# Tasks: Vault-scoped data (per-vault datasets)

**Input**: Design documents from `specs/009-vault-scoped-data/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — Constitution §V + CLAUDE.md require unit tests for data-integrity surfaces (schema migration, vault read/write, repositories). The contracts list explicit numbered obligations; UI gets component tests.

**Organization**: By user story (US1 P1 → US2 P2 → US3 P3), on top of a shared Setup + Foundational phase (the migration + `vaults` repo + the `VaultIdentity` capability + connector resolution + active-vault-id plumbing).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task → parallelizable
- File paths are exact and relative to the repo root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the additive-only constraints before touching the schema.

- [X] T001 Confirm no new runtime dependencies are needed; confirm `tsconfig`/`eslint` already cover the new `src/db/models/vault.ts`, `src/db/repositories/vaults.ts`, and `src/vault/identity.ts`; re-read research R3 (additive migration only — no `domains` rebuild) and R1/R2 (marker at `.cic/vault.json`, written only through the vault spine) so the foundational work respects both constraints.

---

## Phase 2: Foundational (Blocking Prerequisites) — identity, migration, repo, plumbing

**Purpose**: The shared spine every story needs: a stable vault id (marker + `vaults` row), the additive migration, runtime adoption, and the active-vault-id reaching React. Constitution I watch-item lives here (T008–T010).

**⚠️ CRITICAL**: No user-story scoping work can begin until this phase is complete.

- [X] T002 [P] Create `VaultRecordSchema` (`id`, `path`, `created_at`) + `VaultRecord` type in `src/db/models/vault.ts`; export from `src/db/models/index.ts` and `src/db/index.ts`.
- [X] T003 [P] Add `vault_id: z.string().nullable()` to `DomainSchema` in `src/db/models/domain.ts` (nullable so a freshly-migrated, not-yet-adopted row still parses — data-model).
- [X] T004 Migration tests for `m0003_vaults` — forward from v2 applies (`{from:2,to:3,applied:1}`); `vaults` table + `domains.vault_id` + `idx_domains_vault_id` exist; pre-migration domains/courses/milestones rows survive with `vault_id` NULL (lossless); re-running at v3 is a no-op; no row is deleted — in `src/db/migrate.vaults.test.ts` (`// @vitest-environment node`, `node:sqlite`). (db-scoping obligations 1–4.)
- [X] T005 Implement migration `src/db/migrations/m0003_vaults.ts` (`CREATE TABLE vaults` + `ALTER TABLE domains ADD COLUMN vault_id TEXT REFERENCES vaults(id)` + `CREATE INDEX idx_domains_vault_id`) and append it to `src/db/migrations/index.ts` (append-only; satisfies T004). **Also update the three existing migration tests that assume "latest = v2" — registering a real v3 otherwise breaks their assertions and trips the runner's duplicate-version guard:** in `src/db/migrate.test.ts` expect `{from:0,to:3,applied:3}` + `user_version` 3 and add `"vaults"` to `ALL_TABLES` (→ 19 tables); in `src/db/migrate.evolution.test.ts` expect `applied:3` / idempotent `{from:3,to:3,applied:0}` / refuse-newer, and bump the ad-hoc `dummyV3` → **version 4** (kept one past the new latest); in `src/db/migrate.lossless.test.ts` bump `addColumnV3` → **version 4**.
- [ ] T006 Unit tests for the `vaults` repo — `attachVault` inserts a row (path + created_at); re-attaching the same id only refreshes `path` (no dup, created_at stable); first attach adopts all `vault_id IS NULL` domains; a second attach adopts nothing; `getVault` round-trips — in `src/db/repositories/vaults.test.ts` (`node:sqlite`). (db-scoping obligations 5–7.)
- [ ] T007 Implement `attachVault(db, {id, path})` (upsert row + one-shot orphan adoption) and `getVault(db, id)` in `src/db/repositories/vaults.ts`; export from `src/db/index.ts` (depends T005; satisfies T006).
- [ ] T008 [P] `VaultIdentity` tests — `ensure()` on a fresh vault creates `.cic/vault.json`, returns `{id, created:true}`, and `read()` returns that id; `ensure()` is idempotent (`created:false`, file byte-identical); atomic write leaves no `*.cic-tmp`; `read()` returns `null` for absent/garbage; `write(id)` persists; the marker is **not** in `reader.list()`; no `.md` is ever written — in `src/vault/identity.test.ts` (node fs adapter + `makeTempVault`). (vault-identity obligations 1–7.)
- [ ] T009 Implement `VaultIdentity` (`read`/`ensure`/`write` over `.cic/vault.json`, zod `{cicVaultMarker:1, id}`, atomic temp→rename via `VaultFs`) in `src/vault/identity.ts`; export the `VaultIdentity` type from `src/vault/index.ts` (satisfies T008).
- [ ] T010 Wire identity into the vault composition root: `Vault` gains `identity: VaultIdentity`; `createVault` constructs it over the same `VaultFs`/`vaultPath` in `src/vault/bootstrap.ts` (depends T009).
- [ ] T011 Connector resolution (happy path): in `src/app/providers/vault/connect.ts`, after authorize + `createVault`, read the marker / `ensure()` a new id, call `attachVault(db, {id, path})`, and return `id` on `ConnectResult` (`{ok:true, vault, noteCount, id}`) (depends T007/T010). (vault-identity obligation 8 + 10; recovery branch is US3/T027.)
- [ ] T012 `VaultProvider`: add `id: string` to the `ready` `VaultState`; set it from `ConnectResult.id` in the boot effect, `choose`, and `retry`; add `useActiveVaultId(): string | null` in `src/app/providers/VaultProvider.tsx` (depends T011). (vault-identity obligations 12–13.)
- [ ] T013 Extend the test harness so a `ready` vault carries an `id`: add `identity` to `stubVault()` and an `id` to `readyResult()` (and `fakeConnector` results) in `src/app/providers/vault/test-support.tsx` — both break `tsc` once `Vault` gains `identity` (T010) and `ConnectResult` gains `id` (T011). `makeReadyDb` lives in `src/app/test-support.tsx` and is unaffected. Used by every scoped component test (depends T012).

**Checkpoint**: a connected vault has a stable id, a `vaults` row, and a `.cic/vault.json` marker on disk; `useActiveVaultId()` returns it; foundation ready.

---

## Phase 3: User Story 1 - My data follows the active vault (Priority: P1) 🎯 MVP

**Goal**: The active vault is the data boundary — Domains/Courses/Dashboard show only its data, switching refreshes every screen with no restart, switching back is lossless, and pre-feature data is adopted (the Scenario D fix).

**Independent Test**: Create Courses in vault A; switch to B → A's are gone; create Courses in B; switch back to A → A's intact, B's absent — no restart, no loss. Pre-existing global data appears under the first vault attached.

- [ ] T014 [P] [US1] Scope the domains repo: `listDomains(db, vaultId)` (`WHERE vault_id = ?`), `createDomain(db, vaultId, {name,color})` (sets `vault_id`), `findOrCreateDomainByName(db, vaultId, name)` (lookup + create within the vault); update `src/db/repositories/domains.test.ts` — in `src/db/repositories/domains.ts`. (db-scoping obligations 9, 12.)
- [ ] T015 [P] [US1] Scope `listCourses(db, vaultId)` via `JOIN domains d ON d.id = c.domain_id WHERE d.vault_id = ?`; update `src/db/repositories/courses.test.ts` — in `src/db/repositories/courses.ts`. (db-scoping obligation 10.)
- [ ] T016 [P] [US1] Scope `getDashboardSummary(db, vaultId)` — all three aggregates filtered to the vault's domains (totals subqueries, milestone-status JOIN, allocation `WHERE d.vault_id = ?` keeping zero-course domains); update `src/db/repositories/dashboard.test.ts` — in `src/db/repositories/dashboard.ts`. (db-scoping obligation 11.)
- [ ] T017 [US1] Thread the active vault id through the 007 rescan import so it creates/links domains in the active vault: add `vaultId` to `CourseSyncDeps` and call `findOrCreateDomainByName(db, vaultId, …)` in `src/features/courses/sync/rescan.ts`; update `src/features/courses/sync/rescan.test.ts` (depends T014).
- [ ] T018 [US1] Re-key `useDashboard` on `[db, vaultId]` via `useActiveVaultId()`; call `getDashboardSummary(db, vaultId)` + `listCourses(db, vaultId)`; when `vaultId` is null don't query (the gate handles it) — in `src/features/dashboard/useDashboard.ts` (depends T016/T012).
- [ ] T019 [US1] Re-key `useCourses` on `[db, vaultId]`; scoped `listDomains(db, vaultId)`/`listCourses(db, vaultId)`; pass `vaultId` into boot-rescan + `rescan` — in `src/features/courses/useCourses.ts` (depends T014/T015/T017/T012).
- [ ] T020 [US1] Re-key `useDomains` on `[db, vaultId]`; scoped `listDomains(db, vaultId)` + `createDomain(db, vaultId, …)` (the per-vault clash check already runs against the loaded list) — in `src/app/routes/domains/useDomains.ts` (depends T014/T012).
- [ ] T021 [P] [US1] Cross-repo isolation + lossless integration test: distinct data under A and B; each scoped read sees only its own; flipping the `vaultId` argument restores the other set unchanged; adoption assigns legacy NULL domains to the first vault only — in `src/db/repositories/vaults.scoping.test.ts` (`node:sqlite`) (depends T014/T015/T016/T007). (db-scoping obligation 13; SC-001/004.)
- [ ] T022 [US1] Component test: with active id = A the Dashboard/Courses render A's data; changing the provided active vault id re-renders B's data (re-key proven); switching back shows A again — in `src/features/dashboard/DashboardRoute.test.tsx` (extend, using the T013 harness) (depends T018/T019/T013). (FR-007 / ui-scoping obligations 1–2.)

**Checkpoint**: the Scenario D bug is fixed — switching vaults refreshes every screen, losslessly; the MVP slice is demoable.

---

## Phase 4: User Story 2 - New data belongs to the active vault, and needs one (Priority: P2)

**Goal**: Creation is scoped to the active vault and gated when none is connected — no orphaned data, consistent with the Courses gate.

**Independent Test**: With A active, create a Domain → appears under A, not B. Disconnect → Domains/Courses show "connect a vault first" with no create action; Dashboard guides to connect (not a zero grid).

- [ ] T023 [P] [US2] Add a vault gate to the Domains screen mirroring `CoursesRoute`'s outer/inner split: outer reads `useVaultState()` → when not `ready`, render the existing connect-a-vault guidance with **no** "New domain" affordance; when `ready`, render the inner view (which uses `useDomains`, now non-null `vaultId`) — in `src/app/routes/domains/DomainsRoute.tsx` (depends T020). (ui-scoping obligations 4, 6.)
- [ ] T024 [US2] Update the Dashboard no-vault branch to render the connect-a-vault guidance (not another vault's data, not a zeroed grid) — in `src/features/dashboard/DashboardRoute.tsx` (depends T018). (ui-scoping obligation 5.)
- [ ] T025 [US2] Component tests: no vault → Domains shows the gate and offers no create; no vault → Dashboard shows connect guidance (not a zero headline); vault ready → a created Domain attaches to the active vault (appears under A, absent under B) — in `src/app/routes/domains/DomainsRoute.test.tsx` + `src/features/dashboard/DashboardRoute.test.tsx` (extend) (depends T023/T024). (US2 AS-1/2/3.)

**Checkpoint**: creation is impossible without a vault and always lands in the active one — no orphans.

---

## Phase 5: User Story 3 - Recognized even if I move/rename the folder (Priority: P3)

**Goal**: The stored marker id (not the path) identifies a vault, so a moved/renamed folder shows its data; a missing marker is recovered by the recorded path.

**Independent Test**: Connect + create data; rename/move the folder; reconnect → same data (recognized by id). Delete the marker; reconnect from the same path → marker recreated, data still associated.

- [ ] T026 [P] [US3] Add `getVaultByPath(db, path)` (exact-path lookup, else null) to `src/db/repositories/vaults.ts`; cover it in `src/db/repositories/vaults.test.ts` (extend) (depends T007). (db-scoping obligation 8.)
- [ ] T027 [US3] Add the connector recovery branch in `src/app/providers/vault/connect.ts`: when the marker is **absent**, look up `getVaultByPath(db, path)` → if found, reuse that id and `vault.identity.write(id)` to recreate the marker; else `ensure()` a fresh id. (Marker-write failure → return `{ok:false, error}`; never proceed unidentified.) (depends T026/T011). (vault-identity obligations 9, 11.)
- [ ] T028 [US3] Connector tests: marker present → recognized regardless of path and `vaults.path` refreshed; marker absent + path match → id reused + marker recreated (`read()` non-null after); marker absent + no match → new id minted; marker-write failure → `{ok:false}` (vault `unavailable`) — in `src/app/providers/vault/connect.test.ts` (depends T027). (US3 AS-1/2; spec edge cases.)

**Checkpoint**: vault identity survives folder moves and marker loss; all three stories functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T029 [P] PRD reconciliation (Constitution V): in `PRD-CIC-Platform.md`, extend the §8 data model (add a `vaults` table + the `Domain.vault_id` link) and refine the Feature 006 "single active vault; changing the vault does not migrate tracking data" assumption to "single ACTIVE vault; tracking data is partitioned per vault", with a "Locked in vX.Y" changelog entry.
- [ ] T030 Run the full gate — `npm run test` (Vitest), `tsc --noEmit` (strict), `npm run lint` — and fix any regressions, especially caller fallout from the scoped repo signatures (`listDomains`/`createDomain`/`findOrCreateDomainByName`/`listCourses`/`getDashboardSummary` now take `vaultId`).
- [X] T031 Run the [quickstart.md](./quickstart.md) scenarios A–F in `npm run tauri dev` (manual runtime check — the user's surface), confirming the Scenario D regression is gone and the marker stays invisible in Obsidian (Constitution I).
- [X] T032 [P] After implementation: update the CLAUDE.md SPECKIT block to "implemented" and deliver the mandatory end-of-feature walkthrough (Constitution V).

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup. **Blocks all stories.** Internal order: models (T002/T003 [P]) → migration (T004→T005) → vaults repo (T006→T007) → identity (T008→T009→T010) → connector (T011) → provider (T012) → harness (T013). T008/T009/T010 are independent of the migration chain and can proceed in parallel with T004–T007.
- **US1 (P3)** → after Foundational. The MVP + bug fix.
- **US2 (P4)** → after Foundational; builds on US1's scoped `useDomains`/`useDashboard` (gates them).
- **US3 (P5)** → after Foundational; extends the connector (T011) with recovery.
- **Polish (P6)** → after the desired stories.

### Within a story
- Tests precede (or accompany) the implementation they cover (write failing test → implement → green) — T004/T006/T008 before T005/T007/T009.
- Repo scoping (T014–T016) before the hooks that call them (T017–T020); hook re-key before the component test that proves it (T022).
- Both create-flow scoping (US1 `createDomain`) and the gate (US2) edit the Domains screen path — sequence T020 → T023.

### File-coupling cautions
- The scoped repo signatures (T014–T016) break their callers on change; land the matching hook updates (T018–T020) in the same pass to restore `tsc` green (or expect T030 to mop up).
- `src/features/dashboard/DashboardRoute.test.tsx` is extended by T022, T024, T025 — serialize edits to it.
- `src/app/providers/vault/connect.ts` is created (T011) then extended (T027) — US3 after US1's foundation.
- Adding `identity` to the `Vault` type (T010) breaks `stubVault()`, and adding `id` to `ConnectResult` (T011) breaks `readyResult()` — both in `src/app/providers/vault/test-support.tsx`; fix them in T013 (or expect `tsc` red until then).
- Registering `m0003` (T005) breaks the three pre-existing migration tests — handled in T005's own description; don't defer to T030.

### Parallel opportunities
- **Foundational**: T002 ∥ T003; the identity chain (T008→T009→T010) ∥ the migration+repo chain (T004→T005→T006→T007).
- **US1**: the three repo-scoping tasks **T014 ∥ T015 ∥ T016** (different files), then the hooks; **T021** (integration test) ∥ the hook work once repos land.

---

## Parallel Example: US1 repo scoping

```bash
Task: "Scope domains repo (listDomains/createDomain/findOrCreateDomainByName take vaultId) in src/db/repositories/domains.ts"   # T014
Task: "Scope listCourses(db, vaultId) in src/db/repositories/courses.ts"                                                       # T015
Task: "Scope getDashboardSummary(db, vaultId) in src/db/repositories/dashboard.ts"                                             # T016
```

(Then thread the hooks T018→T019→T020, which import these scoped fns.)

---

## Implementation Strategy

### MVP first (US1 only)
1. Setup → 2. Foundational (id + migration + adoption + `useActiveVaultId`) → 3. US1 (scope reads/writes + re-key hooks). **STOP & validate**: quickstart Scenario A — switching vaults refreshes every screen, losslessly; the Scenario D bug is gone. Demoable; this is the whole point of the feature.

### Incremental delivery
- + US2 → creation gating + scoped writes (Scenarios B, C).
- + US3 → identity survives rename/move + marker recovery (Scenario D-of-quickstart, the rename one).
- Upgrade adoption (Scenario E) is exercised from US1 onward (foundational `attachVault`).
- Each story adds value without breaking the previous.

---

## Notes
- [P] = different file, no incomplete-task dependency.
- **Constitution I watch-item** (T008–T011): the `.cic/vault.json` marker is written **only** through `VaultIdentity` (atomic temp→rename), lives in an Obsidian-ignored dot-folder, never surfaces in `reader.list()`, and never touches a `.md` file.
- **Additive migration only** (research R3): no `domains` rebuild; the global `domains.name` UNIQUE is retained (per-vault names deferred, R8 — user-confirmed 2026-05-28).
- **Scope anchor = Domain**: Campaigns/Courses/Milestones inherit their vault transitively; only Domain reads/writes carry `vaultId`.
- **FR-008 boot-order**: the "currently-configured vault adopts first" clause relies on `VaultProvider` connecting the stored `vault.path` at boot (existing 006 behavior) before the user can switch; the `attachVault` adoption logic is unit-tested (T006/T021), while the boot-order itself is covered by quickstart Scenario E (manual — T031). SC-005's "~1s" is likewise a manual check (T031).
- Commit after each story/logical group; keep the tree green (lint + tests). `src-tauri/Cargo.lock`/`Cargo.toml` stay out of commits.
