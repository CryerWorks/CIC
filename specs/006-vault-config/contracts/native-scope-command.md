# Contract: Native fs-scope grant (custom Rust command)

**Feature**: 006-vault-config · **Date**: 2026-05-28

The one **custom Rust touch** (flagged per the Constitution). Authorizes Tauri fs access to the user-chosen vault folder at runtime — the only supported way to grant a dynamic directory under least-privilege (research R2). Contains no logic beyond the scope call.

## Rust command — `src-tauri/src/lib.rs`

```rust
#[tauri::command]
fn grant_vault_access(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_fs::FsExt;
    app.fs_scope()
        .allow_directory(&path, true)        // recursive
        .map_err(|e| e.to_string())
}
```
Registered with `.invoke_handler(tauri::generate_handler![grant_vault_access])`. (`tauri-plugin-fs` is already a dependency from Feature 005.)

## JS wrapper — `src/app/providers/vault/connect.ts`

```ts
import { invoke } from "@tauri-apps/api/core";

/** Authorize fs access to the chosen vault folder (recursive). Must be called before any
 *  VaultReader/VaultWriter op against `path` — on boot for the stored path, and on each pick. */
export async function authorizeVaultPath(path: string): Promise<void> {
  await invoke("grant_vault_access", { path });
}
```

## Usage (inside the production `VaultConnector`)

```ts
export const connect: VaultConnector = async (path) => {
  try {
    await authorizeVaultPath(path);                 // runtime least-privilege grant
    const vault = createVault({ vaultPath: path, db });
    const noteCount = (await vault.reader.list()).length;   // read-only probe (no write)
    return { ok: true, vault, noteCount };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
};
```

## Capability — `src-tauri/capabilities/default.json`

Add the dialog permission (`dialog:allow-open`). The fs commands needed by the vault layer are already granted (Feature 005); the *path* scope is what `grant_vault_access` extends at runtime.

## Notes

- **Boot re-grant**: the connector re-authorizes the stored path on every launch, so the grant need not be persisted (no `tauri-plugin-persisted-scope`).
- **Not unit-tested**: the command + `authorizeVaultPath` need the Tauri runtime; they sit behind the `VaultConnector` seam (tests inject a fake/`node:fs` connector) and are verified by the GUI runtime check (quickstart).
- **Least-privilege**: only the chosen directory (recursive) is allowed — never a broad path (FR-004 / 005 R1).
