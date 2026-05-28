# Contract: `VaultProvider` (the active-vault composition root)

**Feature**: 006-vault-config · **Date**: 2026-05-28

The UI's single source of "which vault is active" (FR-010), mirroring `DbProvider`. Screens depend on **this** — never on the dialog plugin, `invoke`, or `createVault` directly (Constitution IV).

## State — `src/app/providers/VaultProvider.tsx`

```ts
import type { Vault } from "../../vault";  // the 005 { reader, writer }

export type VaultState =
  | { status: "checking" }
  | { status: "unset" }
  | { status: "ready"; path: string; vault: Vault; noteCount: number }
  | { status: "unavailable"; path: string; error: Error };
```

## Seams (injectable; production defaults)

```ts
/** Open the OS folder chooser; resolves to the chosen absolute path, or null on cancel. */
export type FolderPicker = () => Promise<string | null>;

/** Authorize + build + probe a vault for a path. Default: authorizeVaultPath → createVault → reader.list().length. */
export type VaultConnector = (path: string) => Promise<ConnectResult>;
export type ConnectResult =
  | { ok: true; vault: Vault; noteCount: number }
  | { ok: false; error: Error };

export interface VaultProviderProps {
  children: ReactNode;
  picker?: FolderPicker;       // default: dialog open({ directory: true })
  connect?: VaultConnector;    // default: src/app/providers/vault/connect.ts
}
```

- Mounts **above** the AppShell store-gate (it wraps the whole route tree), so it consumes `useDbState()` — **not** `useDb()` — and stays `checking` until the store reports `ready`; only then does it read/write the `vault.path` setting via `getSetting`/`setSetting` on the live executor. (Calling `useDb()` here would throw before the store is ready.)
- On mount: `checking` (until the store is ready) → read `vault.path` → `unset` (absent) or `connect(path)` → `ready` | `unavailable`.

## Actions (exposed via context)

```ts
export interface VaultActions {
  /** Open the picker; on a chosen folder, connect; on success persist vault.path + go ready;
   *  on cancel do nothing; on connect failure surface the error without clobbering a good config. */
  chooseVault(): Promise<void>;
  /** Alias of chooseVault for the "change" affordance (same flow; current vault stays until success). */
  changeVault(): Promise<void>;
  /** Re-attempt connecting the currently-stored path (from `unavailable`). */
  retry(): Promise<void>;
}
```

## Hooks

```ts
export function useVaultState(): VaultState;          // raw state — for the Vault screen + unset affordance
export function useVault(): Vault;                    // the ready handle; throws if not `ready` (like useDb)
export function useVaultActions(): VaultActions;
```

## Guarantees (the public contract)

- **Single active vault** (FR-010): one `VaultState`; `useVault()` is the only way knowledge features obtain a `reader`/`writer`.
- **Never crash on a bad path** (FR-007): an inaccessible stored/chosen path yields `unavailable`/error state, never a throw to the user.
- **No probe writes** (Constitution I): readiness is proven by a read-only note count.
- **Persist-only-on-success** (R5): `vault.path` is written only after a successful connect.
- Stability: `VaultState`'s variants and the never-crash/persist-on-success semantics are the contract; adding an action is additive.
