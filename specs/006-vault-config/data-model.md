# Data Model: Vault Configuration

**Feature**: 006-vault-config · **Date**: 2026-05-28

One **new SQLite table** (migration `m0002`) for app state, plus the in-memory value shapes the `VaultProvider` works with. Canonical knowledge still lives in the vault (Constitution I); this stores only *which folder* the vault is.

## Persisted entity — `settings` (new, migration `m0002`)

A generic key-value store for small app-state values. Forward-only migration appended after `m0001` (the table shipped nowhere before).

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- **Deliberate addition beyond strict PRD §8** (like `cards.created_at` in 003): a reusable settings table is the simplest home for app state such as the vault path. Noted here for traceability.
- The configured vault path is stored under key **`vault.path`** (constant `VAULT_PATH_KEY`). Re-recording upserts in place.

### Model — `src/db/models/setting.ts`
```ts
export const SettingSchema = z.object({ key: z.string(), value: z.string() });
export type Setting = z.infer<typeof SettingSchema>;
```

### Repository — `src/db/repositories/settings.ts`
| Function | Signature | Notes |
|---|---|---|
| `getSetting` | `(db, key) => Promise<string \| null>` | Reads the row (parsed via `SettingSchema`), returns its `value` or `null`. |
| `setSetting` | `(db, key, value) => Promise<void>` | Upsert on the natural key `key` (003 `upsert` helper). |

Exported from `src/db/index.ts` (additive).

## Value shapes (`src/app/providers/VaultProvider`)

### `VaultConfig`
```ts
interface VaultConfig { path: string; } // the configured vault folder (vault-relative paths are 005's concern)
```

### `ConnectResult` — outcome of the `VaultConnector`
```ts
type ConnectResult =
  | { ok: true; vault: Vault; noteCount: number }   // Vault = the 005 { reader, writer }
  | { ok: false; error: Error };
```

### `VaultState` — the provider's discriminated state (FR-010: single source of "active vault")
```ts
type VaultState =
  | { status: "checking" }                                            // boot: reading the stored path / connecting
  | { status: "unset" }                                               // no vault configured (first run)
  | { status: "ready"; path: string; vault: Vault; noteCount: number }
  | { status: "unavailable"; path: string; error: Error };            // stored/chosen path missing or denied
```

`useVault()` returns the `Vault` only in `ready` (throws otherwise, like `useDb()`); `useVaultState()` returns the raw state for the screen.

## State transitions

```
            boot (read settings)
  checking ───────────────┬─────────────▶ unset            (no stored path)
        │                 ├─────────────▶ ready             (stored path connects; noteCount)
        │                 └─────────────▶ unavailable       (stored path missing/denied)

  unset/ready/unavailable ──chooseVault()──▶ [picker]
        │  cancel → unchanged
        │  chosen + connect ok   → ready   (persist vault.path)
        │  chosen + connect fail → (stay)  + surface error  (do NOT persist over a good path)

  unavailable ──retry()──▶ checking ▶ ready | unavailable
```

- **Persist-only-on-success** (R5): `vault.path` is written via `setSetting` only when a chosen folder connects successfully — a failed pick never clobbers a working config.
- **Read-only probe**: the note count comes from `VaultReader.list()`; no write touches the vault (Constitution I).
- **Idempotent**: re-choosing the active folder yields the same `ready` state.

## Not in this feature

No notes/MOC content model, no diff-dialog state, no watcher/backlink index, no multi-vault registry, no migration of tracking data across a vault change. Those build on this later.
