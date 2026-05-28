# Contract: Vault identity capability + connector resolution

The new vault-spine capability that owns the `.cic/vault.json` marker, plus how the app connector resolves a stable id at connect time and surfaces it. Constitution I watch-item lives here.

## `VaultIdentity` (src/vault/identity.ts)

A capability on the `Vault` handle, built by `createVault`, behind the `VaultFs` seam (no Tauri/db imports). The marker lives at the constant relative path `.cic/vault.json`.

```ts
export interface VaultIdentity {
  /** Read + parse .cic/vault.json. null if absent or unparseable. Never writes. */
  read(): Promise<string | null>;
  /** Read; if present return it (created:false); else mint a v4 UUID, write atomically, return (created:true). */
  ensure(): Promise<{ id: string; created: boolean }>;
  /** (Re)write a known id atomically — recovery when the marker was lost (FR-010). */
  write(id: string): Promise<void>;
}
```

`Vault` becomes `{ reader: VaultReader; writer: VaultWriter; identity: VaultIdentity }`.

### Behavioral obligations (tested over the node fs adapter + temp vault)

1. **ensure() on a fresh vault** creates `.cic/vault.json`, returns `{id, created:true}`; the file contains `{cicVaultMarker:1, id}` and `read()` returns that same id.
2. **ensure() is idempotent**: a second `ensure()` returns the *same* id with `created:false`; the file is byte-identical (no rewrite churn).
3. **Atomic write**: writing leaves no `*.cic-tmp` artifact; uses temp-in-same-dir → rename (same primitive as `VaultWriter`).
4. **read() tolerates absence + garbage**: missing file → `null`; malformed/non-conforming JSON → `null` (caller recreates).
5. **write(id)** persists exactly that id; a subsequent `read()` returns it (recovery path).
6. **Never a Note**: after `ensure()`, `vault.reader.list()` does **not** include the marker (it's not `.md`, and `.cic/` is outside the `.md` scan). *(Constitution I / FR-009.)*
7. **Never clobbers a `.md`**: the capability only ever touches `.cic/vault.json`; it has no code path that writes any `.md`.

## Connector resolution (src/app/providers/vault/connect.ts)

`createConnector(db)` gains identity resolution. After authorize + `createVault`, before returning `ok`:

```text
const existing = await vault.identity.read()
let id: string
if (existing) {                       // marker present → recognized regardless of path (US3 AS-1)
    id = existing
} else {                              // marker absent → recovery (FR-010)
    const byPath = await getVaultByPath(db, path)
    if (byPath) { id = byPath.id; await vault.identity.write(id) }   // re-create marker, keep data (US3 AS-2)
    else        { id = (await vault.identity.ensure()).id }          // genuinely new
}
await attachVault(db, { id, path })   // upsert row (refresh path) + one-shot legacy adoption (FR-008)
return { ok: true, vault, noteCount, id }
```

`ConnectResult.ok` gains `id: string`.

### Obligations

8. **Marker present** → returned id equals the marker's; `vaults.path` is updated to the connect path (rename/move recognized).
9. **Marker absent, path matches a `vaults` row** → reuses that row's id and **recreates** the marker (`read()` afterward is non-null).
10. **Marker absent, no path match** → mints a new id, writes the marker, inserts the `vaults` row.
11. **Marker write fails** (fs error) → the connector returns `{ok:false, error}` (vault goes `unavailable`); **never** returns `ok` with an unidentified vault (spec edge case).

## `VaultProvider` surface (src/app/providers/VaultProvider.tsx)

- `VaultState.ready` gains `id: string` (the resolved vault id). Set wherever `{status:"ready", …}` is constructed (boot effect, `choose`, `retry`) from `ConnectResult.id`.
- New hook **`useActiveVaultId(): string | null`** — returns `state.status === "ready" ? state.id : null`. The reactivity + scoping key for screens (research R5).

### Obligations

12. On a successful connect/boot/retry, `useActiveVaultId()` returns the resolved id; in `unset`/`unavailable`/`checking` it returns `null`.
13. Switching to a different vault changes `useActiveVaultId()` to the new id (drives the screen refresh — see ui-scoping).
