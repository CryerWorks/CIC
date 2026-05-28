# Contract: UI scoping — active-vault plumbing, hook re-keying, Domains gate

How the active vault id reaches the screens, makes them refresh on switch (FR-007, fixes Scenario D), and gates creation (FR-006).

## Active vault id source

`useActiveVaultId(): string | null` (from `VaultProvider`, see vault-identity.md). The single source screens read; `null` ⇔ no vault ready.

## Hook re-keying (FR-007 / SC-005)

Each screen hook takes the active vault id and **keys its load effect + scoped reads on it**.

### `useDashboard` (src/features/dashboard/useDashboard.ts)

- `const vaultId = useActiveVaultId();`
- Effect deps `[db, vaultId]`. If `vaultId` is null → render the connect-a-vault gate (below) and don't query.
- `getDashboardSummary(db, vaultId)` + `listCourses(db, vaultId)`.

### `useCourses` (src/features/courses/useCourses.ts)

- Already calls `useVault()` (vault-gated). Add `const vaultId = useActiveVaultId();` (non-null inside the gate).
- Effect + `refresh` deps include `vaultId`; `listDomains(db, vaultId)`, `listCourses(db, vaultId)`.
- Boot rescan + manual `rescan` pass `vaultId` so `rescanCourses` imports into the active vault (`findOrCreateDomainByName(db, vaultId, …)`).

### `useDomains` (src/app/routes/domains/useDomains.ts)

- Add `const vaultId = useActiveVaultId();` (non-null inside the new gate).
- Effect + `refresh` deps include `vaultId`; `listDomains(db, vaultId)`, `createDomain(db, vaultId, …)`.
- The optimistic clash check already runs against the loaded (now per-vault) list — unchanged.

### Obligations

1. **Switch refreshes** (the Scenario D fix): with A active, the Domains/Courses/Dashboard show A's data; switching to B re-runs the effects (dep `vaultId` changed) and shows B's data — no remount, no restart.
2. **Switch back is lossless**: A→B→A shows A's original data (the DB never pruned B or A; the hooks just re-scope) (US1 AS-3 / SC-001).
3. No scoped query runs with a null `vaultId` (the gate intercepts first).

## Domains screen vault gate (FR-006)

`DomainsRoute` currently renders unconditionally. Add a vault gate mirroring `CoursesRoute`'s outer/inner split:

- Read `useVaultState()`. If not `ready` → render the same "connect a vault first" guidance used by Courses (no create affordance). If `ready` → render the inner Domains view (which calls `useDomains`, now non-null `vaultId`).

The **Dashboard** already gates on vault state (008); update its no-vault branch to the connect-a-vault guidance and ensure it does **not** show another vault's data or a zero grid (FR-006 / US2 AS-3).

### Obligations

4. **No vault → Domains** shows connect guidance, **no** "New domain" action (US2 AS-2).
5. **No vault → Dashboard** shows connect guidance, not data and not a zeroed grid (US2 AS-3).
6. **Vault ready → Domains/Courses** behave as before, now scoped to the active vault.

## Test-support extension

`renderWithVault` / `makeReadyDb` (jsdom harness) provide a ready vault state carrying an `id`, so component tests of the three hooks/screens exercise the scoped path. Component tests assert: data shown for the active vault id; switching the provided id re-renders the other vault's data; no-vault renders the gate.
