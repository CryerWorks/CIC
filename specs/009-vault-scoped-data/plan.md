# Implementation Plan: Vault-scoped data (per-vault datasets)

**Branch**: `009-vault-scoped-data` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-vault-scoped-data/spec.md`

## Summary

Make the **active Obsidian vault the data boundary**. Today SQLite is one global store, so switching vault folders keeps showing the previous vault's Domains/Courses/Milestones (the reported Scenario D bug). This feature partitions the tracking hierarchy by vault: every `Domain` belongs to exactly one vault, and Campaigns/Courses/Milestones inherit that vault transitively (they already cascade under Domains), so a single vault link on `Domain` scopes the whole tree.

A vault is identified by a **stable UUID** stored in a hidden, CIC-owned marker *inside* the vault (`.cic/vault.json`), written atomically through a new capability on the vault spine — so renaming/moving the folder still recognizes the same vault. Reads (Domains, Courses, Dashboard) and writes (create Domain/Course/Milestone, the 007 rescan-import) are scoped to the **active** vault id; switching vaults re-keys the screen hooks so every view refreshes **without a restart**. Pre-existing global data is **adopted** by the first vault whose identity is established after upgrade, so nothing is lost.

The schema change is **additive only** (a `vaults` table + a nullable `domains.vault_id` + an index) — a `domains` table-rebuild is deliberately avoided (it would cascade-delete the hierarchy under the FK-on runner and is unsafe on the pooled production adapter). Consequence: the existing global `domains.name` UNIQUE is retained as a **documented Phase-1 limitation** (per-vault same-named Domains are deferred — see research R3/R8).

## Technical Context

**Language/Version**: TypeScript (strict), React 19 (function components + hooks).

**Primary Dependencies**: existing only — the 003 SQLite layer (`SqlExecutor` + repositories + the forward-only `migrate` runner), the 005 vault spine (`VaultReader`/`VaultWriter`/`VaultFs`/`createVault`), the 006 `VaultProvider`/`DbProvider` composition roots, React Router, the 002 component kit. **No new runtime dependencies.**

**Storage**: SQLite. **One additive migration** (`m0003_vaults`): `CREATE TABLE vaults`, `ALTER TABLE domains ADD COLUMN vault_id`, `CREATE INDEX idx_domains_vault_id`. Plus a new hidden non-`.md` vault file (`.cic/vault.json`) written through the vault spine.

**Testing**: Vitest. Repo scoping + migration + adoption unit-tested under `// @vitest-environment node` against `node:sqlite` (`NodeSqlExecutor`, FK-on). Vault identity capability tested over the node fs adapter + a temp vault. Hooks/screens via jsdom component tests reusing `renderWithVault`/`makeReadyDb` (extended with an active vault id).

**Target Platform**: Tauri desktop (Windows/macOS/Linux); all logic runtime-agnostic and Tauri-free in tests.

**Project Type**: Desktop app — single React + TS frontend over a Tauri shell.

**Performance Goals**: Every screen reflects a vault switch within ~1s, no restart (SC-005). Scoping adds a `WHERE`/`JOIN` on an indexed `vault_id` — no new N+1.

**Constraints**: Fully local. The identity marker is the **only** new vault-write surface — it must route through the sanctioned vault layer, write atomically (temp→rename), live in a hidden CIC-owned dot-folder, never overwrite user content, and never surface as a Note/Course (Constitution I). No destructive migration. Lossless vault switching (no prune/reconcile of the inactive vault's data).

**Scale/Scope**: Single local user; a handful of vaults; tens–hundreds of Courses each. One migration, one vault-spine capability, ~4 scoped repo signatures, active-vault-id plumbing through 3 hooks, a vault gate on the Domains screen.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| **I. Vault Canonical & Sacred** | ✅ **Central gate this feature.** The identity marker is a new write surface, so: it is written **only** through a new vault-spine capability (`VaultIdentity`) using the existing atomic temp→rename `VaultFs` primitive — no ad-hoc `fs` in app/db code (Constitution IV chokepoint preserved). It lives at `.cic/vault.json` — a hidden dot-folder Obsidian ignores; `VaultReader.list()` filters `.md`, so it never surfaces as a Note/Course (FR-009). It is **CIC-owned metadata, not user content**: it only ever reads-then-creates its own file, never touches `.md`, never clobbers a user file. Reads stay read-only; no existing `.md` write path changes. |
| **II. AI Vendor-Agnostic Tutor** | ✅ No AI in this feature. No vendor imports. |
| **III. Preserve Desirable Difficulty** | ✅ Pure scoping/identity. Nothing is auto-marked "learned"; no retrieval/spacing surface touched. Milestone statuses remain user-set; the Dashboard still shows literal counts (now per-vault). |
| **IV. Interface-First, Deep Modules** | ✅ Identity is a thin capability added to the vault spine (`src/vault`), wired at the `createVault` composition root and the app `connect` seam; features read the active id via a `VaultProvider` hook. Scoping stays in the **repository layer** (vault-id params on existing fns) behind the `SqlExecutor` seam — features never see SQL. No leaky abstraction: the `Vault`/`VaultProvider` surfaces gain an `id`, not Tauri/SQLite detail. |
| **V. Spec-Driven Development** | ✅ Spec written + validated; full Phase 1 doc set produced here. **PRD reconciliation (this plan):** refines the Feature 006 "single active vault; don't migrate tracking data" assumption and extends PRD §8 (a `vaults` table + a vault link on `Domain`) — applied to `PRD-CIC-Platform.md` during `/speckit-implement` (tracked as a task), per "spec updated before code drifts". Walkthrough at the end. |

**Result: PASS.** One watch-item (the marker write surface) is satisfied by routing through the vault spine. No violations → no Complexity Tracking entries. The retained global `domains.name` UNIQUE is a *scope limitation*, not a Constitution violation (documented R3/R8).

## Project Structure

### Documentation (this feature)

```text
specs/009-vault-scoped-data/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R8
├── data-model.md        # Phase 1 — vaults table, domains.vault_id, the .cic/vault.json marker, scoping & adoption
├── quickstart.md        # Phase 1 — manual scenarios A–F (incl. the Scenario D regression)
├── contracts/
│   ├── vault-identity.md # VaultIdentity capability + connector resolution + VaultState.id
│   ├── db-scoping.md     # migration + scoped repo signatures + attachVault/adoption
│   └── ui-scoping.md     # useActiveVaultId + hook re-keying + Domains vault gate
└── checklists/
    └── requirements.md   # (from /speckit-specify)
```

### Source Code (repository root)

```text
src/
├── db/
│   ├── migrations/
│   │   ├── m0003_vaults.ts        # NEW — CREATE TABLE vaults + ALTER domains ADD vault_id + index
│   │   └── index.ts               # register m0003 (append-only)
│   ├── models/
│   │   ├── vault.ts               # NEW — VaultRecordSchema (id, path, created_at)
│   │   └── domain.ts              # +vault_id on DomainSchema
│   └── repositories/
│       ├── vaults.ts              # NEW — attachVault (upsert row + adopt orphans), getVaultByPath, getVault
│       ├── vaults.test.ts         # NEW — node:sqlite: attach, path-refresh, one-shot adoption
│       ├── domains.ts             # createDomain/listDomains/findOrCreateDomainByName gain vaultId
│       ├── courses.ts             # listCourses gains vaultId (JOIN domains)
│       ├── dashboard.ts           # getDashboardSummary gains vaultId (all 3 queries scoped)
│       └── *.test.ts              # updated for scoped signatures
├── vault/
│   ├── identity.ts                # NEW — VaultIdentity (read/ensure the .cic/vault.json marker, atomic)
│   ├── identity.test.ts           # NEW — node fs adapter: create-once, read-back, missing→recreate, never-.md
│   ├── bootstrap.ts               # Vault gains `identity`; createVault wires it
│   └── index.ts                   # export VaultIdentity type
├── app/
│   ├── providers/
│   │   ├── VaultProvider.tsx      # VaultState.ready gains `id`; new useActiveVaultId()
│   │   └── vault/connect.ts       # connector resolves identity (read/recreate) + attachVault → returns id
│   └── routes/
│       └── domains/
│           ├── DomainsRoute.tsx   # NEW vault gate (FR-006) — mirrors CoursesRoute
│           └── useDomains.ts      # re-key on [db, vaultId]; pass vaultId to create/list
└── features/
    ├── courses/
    │   ├── useCourses.ts          # re-key on [db, vaultId]; scoped listDomains/listCourses
    │   └── sync/rescan.ts         # findOrCreateDomainByName(db, vaultId, …) — import into active vault
    └── dashboard/
        └── useDashboard.ts        # re-key on [db, vaultId]; getDashboardSummary(db, vaultId)
```

**Structure Decision**: Follow the established seams. The **identity capability** is a thin addition to the **vault spine** (`src/vault/identity.ts`), wired at the `createVault` composition root and resolved by the app `connect.ts` seam — keeping *all* vault-filesystem access inside the vault layer (Constitution I+IV). **Scoping** stays in the **repository layer** (vault-id parameters on existing fns over the `SqlExecutor` seam) so features depend on typed repo functions, never SQL. The **active vault id** is exposed from `VaultProvider` (`useActiveVaultId`) and threaded into the three screen hooks, which re-key their load effects on it so a vault switch refreshes every view. The **migration** appends `m0003` to the existing forward-only runner — additive DDL only.

## Complexity Tracking

> No Constitution violations — section intentionally empty. The retained global `domains.name` UNIQUE (deferring per-vault names) is a documented scope limitation (research R3/R8), surfaced for user sign-off, not an unjustified complexity.
