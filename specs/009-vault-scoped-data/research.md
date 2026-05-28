# Research: Vault-scoped data (per-vault datasets)

Phase 0 decisions. Each: **Decision · Rationale · Alternatives rejected**. The two spec forks (creation gating; stable-id identity) are already locked; the open engineering questions are the schema strategy (R3 — the crux), the marker write surface (R1/R2), scoping mechanics (R4), reactivity (R5), and migration/recovery (R6/R7).

---

## R1 — Vault identity: storage location & format

**Decision.** A hidden, CIC-owned JSON marker at **`.cic/vault.json`** inside the vault, holding a v4 UUID minted on first connect:

```json
{ "cicVaultMarker": 1, "id": "f1e2d3c4-…" }
```

The UUID is the vault's stable identity (FR-001); the dot-folder makes it invisible in Obsidian.

**Rationale.** Obsidian ignores dot-folders (it already does for `.obsidian`, `.trash`), so the marker never appears in the file tree (FR-009). It is **not** a `.md` file, so `VaultReader.list()` (which filters `.md`) never returns it and the 007 rescan never mistakes it for a Course. JSON is trivially zod-parseable and human-legible if a curious user opens it. A small version tag lets a future format change be detected.

**Alternatives rejected.**
- *A `.md` note with `cic-type: vault` frontmatter* — would surface in Obsidian's file tree and in `reader.list()`, violating FR-009 (looks like a Note/Course). Rejected.
- *Path-keyed identity (no marker)* — the spec's locked decision; breaks on folder rename/move (US3). Rejected by clarification.
- *Identity in SQLite only, keyed by path* — same rename fragility; also the vault couldn't be recognized if reconnected from a fresh install. Rejected.
- *Storing it inside `.obsidian/`* — that folder is Obsidian's, not ours; co-opting it risks collisions and is rude to the user's tool. A dedicated `.cic/` is cleaner.

---

## R2 — Who writes/reads the marker (Constitution I watch-item)

**Decision.** Add a small **`VaultIdentity` capability to the vault spine** (`src/vault/identity.ts`), exposed on the `Vault` handle (`vault.identity`) from `createVault`. It reuses the existing `VaultFs` seam and the same **atomic temp→rename** primitive as `VaultWriter`. API:

- `read(): Promise<string | null>` — read+parse `.cic/vault.json`; `null` if absent/garbage.
- `ensure(): Promise<{ id: string; created: boolean }>` — read; if present return it; if absent mint a UUID, write atomically, return `{created:true}`.
- `write(id): Promise<void>` — (re)write a known id atomically (FR-010 recovery).

**Rationale.** Constitution I requires *all* vault-filesystem access to live in the vault layer behind one chokepoint. The marker is a new write surface, so it belongs in `src/vault`, not in app/db code doing ad-hoc `fs`. It reuses the atomic-write guarantee (no half-written marker). It is deliberately **separate from `VaultWriter.writeNote`**, which is `.md`-note-shaped (frontmatter + body) and runs the never-clobber `vault_writes` log — neither fits a hidden JSON metadata file. The marker's "never clobber" is simpler: **never overwrite an existing id** (read-first; only create when absent), and it can't collide with user content because it owns its dot-folder.

**Alternatives rejected.**
- *Write the marker from the app `connect.ts` via raw Tauri `fs`* — punches a second hole in the vault chokepoint (Constitution I/IV). Rejected.
- *Overload `VaultWriter.writeNote`* — forces frontmatter/body + `.md` semantics + the `vault_writes` drift log onto a non-note metadata file. Wrong shape. Rejected.
- *Run the marker through the never-clobber drift log* — pointless: it's CIC-owned, not user-edited; drift detection guards *user* edits to *notes*. Read-first-create is the right guard.

---

## R3 — Database schema strategy (the crux): additive vs. rebuild

**Decision.** **Additive migration only** (`m0003_vaults`):

```sql
CREATE TABLE IF NOT EXISTS vaults (
  id         TEXT PRIMARY KEY,        -- the marker UUID (FR-001)
  path       TEXT NOT NULL,           -- last-connected folder (refreshed on connect)
  created_at TEXT NOT NULL
);
ALTER TABLE domains ADD COLUMN vault_id TEXT REFERENCES vaults(id);
CREATE INDEX IF NOT EXISTS idx_domains_vault_id ON domains(vault_id);
```

`domains.vault_id` is **nullable** (existing rows back-fill NULL, adopted at runtime — R6). The existing **global `domains.name` UNIQUE is retained** (see R8 for the consequence).

**Rationale — why NOT rebuild `domains`.** The "correct" schema would make uniqueness composite (`UNIQUE(vault_id, name)`), which requires replacing the table's implicit `name` unique index — and SQLite cannot drop a column-constraint's auto-index without a full table rebuild. A rebuild is **unsafe here**:
1. **FK-cascade wipeout.** Both adapters run with foreign keys ON (the node test adapter sets `PRAGMA foreign_keys=ON`; sqlx enables them by default). With FK on, `DROP TABLE domains` performs an *implicit DELETE* of all rows, firing `ON DELETE CASCADE` on `campaigns`→`courses`→`milestones` — i.e. it would **delete the entire hierarchy**. Catastrophic.
2. **Can't disable FK mid-migration.** The 003 runner wraps each migration in a transaction, and `PRAGMA foreign_keys` is a **no-op inside a transaction**; `defer_foreign_keys` defers constraint *checks* but not cascade *actions*. So the standard 12-step rebuild (which needs FK off *before* `BEGIN`) doesn't fit the runner.
3. **Pooled production adapter.** `tauri-plugin-sql` is backed by an sqlx connection *pool*; `PRAGMA foreign_keys` is per-connection and statements aren't guaranteed to share a connection (documented caveat in `adapters/tauri.ts`). A migration that toggles FK around a multi-statement rebuild is unreliable in production.

Additive `ALTER TABLE ADD COLUMN` (nullable) is the one runner-safe, production-safe option: single statement, no cascade, no FK toggling, idempotent. It matches the existing tested evolution pattern (`migrate.lossless.test.ts` adds a column).

**Alternatives rejected.**
- *Rebuild `domains` with `UNIQUE(vault_id, name)`* — correct schema, but unsafe under the FK-on, transaction-wrapped, pooled runner (above). Would require a "FK-off rebuild" migration kind + pinned-connection production work — out of scope for a Phase-1 hardening pass. **Deferred** (R8).
- *Add a second composite UNIQUE index alongside the global one* — the global implicit index still rejects first; doesn't lift the limitation. Useless.
- *Direct vault link on every entity (campaign/course/milestone)* — redundant; they cascade under Domain, so one link on Domain scopes the tree (spec assumption). More columns, more drift risk. Rejected.

---

## R4 — Scoping reads and writes

**Decision.** Thread an `activeVaultId: string` into the **Domain-level** repository functions; everything below inherits scope transitively through `domains.vault_id`:

| Function | Change |
|---|---|
| `createDomain(db, input)` | → `createDomain(db, vaultId, input)` — sets `vault_id` |
| `listDomains(db)` | → `listDomains(db, vaultId)` — `WHERE vault_id = ?` |
| `findOrCreateDomainByName(db, name)` | → `findOrCreateDomainByName(db, vaultId, name)` — lookup + create within the vault (007 import) |
| `listCourses(db)` | → `listCourses(db, vaultId)` — `JOIN domains d ON d.id = c.domain_id WHERE d.vault_id = ?` |
| `getDashboardSummary(db)` | → `getDashboardSummary(db, vaultId)` — all 3 aggregates scoped to the vault's domains |

`createCourse`/`createCampaign`/`createMilestone`, `listCoursesByDomain`, `getCourse`, `updateDomain`/`deleteDomain` are **unchanged**: they key off a `domainId`/`id` that already belongs to a vault, so scope is inherited. `getDomain(db, id)` stays by-PK (id is globally unique).

**Rationale.** One scope anchor (Domain) keeps the change surface tiny and the invariant single-sourced: "a row's vault = its Domain's vault." Passing the id explicitly (rather than a global "current vault" singleton in the repo layer) keeps repositories pure/stateless and unit-testable — consistent with the existing `db`-first signatures.

**Alternatives rejected.**
- *A repo-layer global/ambient "active vault"* — hidden state in a layer that's deliberately stateless; breaks testability and the `SqlExecutor`-only dependency. Rejected.
- *Scope at the UI only (filter in JS)* — over-fetches every vault's rows and is one missed filter away from a leak; the DB is the right boundary. Rejected.

---

## R5 — UI reactivity on vault switch (FR-007, fixes Scenario D)

**Decision.** Expose the active vault id from `VaultProvider`: `VaultState.ready` gains an **`id`** field, and a new **`useActiveVaultId(): string | null`** hook returns it (`null` unless ready). The three screen hooks (`useDomains`, `useCourses`, `useDashboard`) take the id and **key their load effects on `[db, vaultId]`**. Switching the active vault changes `id` → effects re-run → screens re-scope and refresh, no restart.

**Rationale.** This is the *root cause* of Scenario D: the hooks currently key on `[db]` alone, and the single global `SqlExecutor` never changes on a vault switch, so nothing re-fetches. The vault id is the missing reactivity key. It also threads naturally into the scoped repo calls (R4) — the same value gates the query and triggers the refetch.

**Alternatives rejected.**
- *Recreate the `SqlExecutor` per vault / per-vault DB files* — much larger change, breaks the single-store model, and the spec keeps one global store partitioned by vault. Rejected.
- *Manual "refresh" button only* — fails FR-007 ("without an app restart", "every screen updates"); leaves the confusing stale view the bug is about. Rejected.
- *An event bus / pub-sub on vault change* — React effect deps already express exactly this dependency; an event bus is redundant machinery. Rejected.

---

## R6 — Migration of pre-existing data (FR-008)

**Decision.** **Runtime adoption at identity establishment**, in a repo fn `attachVault(db, { id, path })` called by the connector after the marker id is resolved:

1. Upsert the `vaults` row (`id` PK; `path` refreshed; `created_at` on insert).
2. If this is the **first** vault ever attached (i.e. there exist `domains` with `vault_id IS NULL`), adopt them: `UPDATE domains SET vault_id = ? WHERE vault_id IS NULL`.

**Rationale.** Self-limiting and covers both FR-008 clauses with one rule: the legacy global set (all `vault_id NULL` after the additive migration) is adopted by whichever vault establishes identity first. After that, no NULLs remain, so later vaults start empty — no bleed. On boot, `VaultProvider` connects the **stored** `vault.path` first, so a configured-at-upgrade vault adopts before the user can switch ("assigned to the currently-configured vault"); if none was configured, the first vault the user connects adopts ("adopted by the first vault connected").

**Alternatives rejected.**
- *Adopt inside the SQL migration* — the migration can't know the runtime vault id (it comes from the marker at connect). Impossible. Rejected.
- *Adopt for every connect (not just first)* — would vacuum a second vault's accidental NULLs into the wrong vault; the "only when NULLs exist / first attach" guard prevents that. Rejected.
- *Leave legacy rows NULL and union them into every vault's view* — defeats partitioning; the same global-bleed bug. Rejected.

---

## R7 — Folder move/rename & missing-marker recovery (FR-001/010)

**Decision.** Identity resolution in the connector (`connect.ts`), after `createVault`:

1. `id = await vault.identity.read()`.
2. **Marker present** → recognized regardless of path. `attachVault(db, { id, path })` refreshes the stored path → moved/renamed folder shows its data (US3 AS-1).
3. **Marker absent** → recovery (FR-010): look up `getVaultByPath(db, path)`.
   - **Row found** (older vault we recorded by path, or user deleted the marker) → reuse that row's `id`, `vault.identity.write(id)` to recreate the marker, `attachVault`. Existing data re-associated (US3 AS-2).
   - **No row** → genuinely new: `ensure()` mints+writes a fresh id, `attachVault` inserts the row and adopts any legacy NULL orphans (R6).

The resolved id flows into `VaultState.ready.id`.

**Rationale.** The marker is the primary identity; the recorded path is the **fallback** the spec scopes recovery to ("re-associate via the previously-recorded folder path"). Refreshing `vaults.path` on every connect keeps the path-fallback current for the *next* missing-marker case.

**Alternatives rejected / documented limits.**
- *Recover a moved folder that ALSO lost its marker* — can't: no marker (id gone) and the path changed (no row match) → treated as new. Out of scope per spec edge cases; acceptable.
- *Two folders sharing one marker id (user copied a vault)* — treated as the same vault; most-recent connect wins the `path`. Documented limitation (spec); full divergence handling deferred.
- *If writing the marker fails* (read-only/locked vault) — `ensure()`/`write()` rejects; the connector returns `{ok:false, error}` and the vault goes `unavailable` (surfaced), never proceeding unidentified (spec edge case).

---

## R8 — Consequence of R3: per-vault Domain name uniqueness (deferred, **needs user sign-off**)

**Decision (default, pending confirmation).** Retain the global `domains.name` UNIQUE for this feature. Net effect: a Domain name must be unique **across all vaults**, so two vaults cannot each have a Domain named e.g. "Math". The app-layer validation in `useDomains` already checks against the *loaded* (now per-vault) list, so the in-vault UX reads correctly; the rare cross-vault collision surfaces the existing "a domain with that name already exists" message (stricter than ideal, never data-corrupting).

**Rationale.** Lifting it requires the `domains` table rebuild ruled out in R3 (unsafe under the FK-on, transaction-wrapped, pooled runner). The headline scenarios (Math vault vs language vault — distinct names) and all three user stories work under the limitation; only identically-named Domains across vaults are blocked.

**Deferred path.** Per-vault names → a dedicated migration that rebuilds `domains` with `UNIQUE(vault_id, name)`, which first needs the runner to support a FK-disabled rebuild step **and** a pinned-connection guarantee on the production adapter. Tracked as a follow-up, not in this feature's scope.

**Flag for the user.** This is the one product-visible tradeoff in the plan. Recommendation: **accept the limitation now** (keeps the migration safe and the feature small) and defer the rebuild. If true per-vault names are wanted immediately, the rebuild + runner work expands scope materially — call it and we'll plan that instead.
