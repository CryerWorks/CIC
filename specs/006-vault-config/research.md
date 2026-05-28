# Research: Vault Configuration

**Feature**: 006-vault-config · **Date**: 2026-05-28

All decisions resolve the Technical Context. No `NEEDS CLARIFICATION` remain.

---

## R1 — Folder picker

**Decision**: Add `tauri-plugin-dialog` (Rust) + `@tauri-apps/plugin-dialog` (JS) and use `open({ directory: true, multiple: false, title: "Choose your Obsidian vault" })`, which returns the chosen absolute directory path or `null` on cancel. The call lives in **one** file — `src/app/providers/vault/picker.ts` (the production `FolderPicker`); the rest of the app depends on the `FolderPicker` seam.

**Rationale**: A directory *path* is required (the 005 layer is path-based). The web File System Access API yields an opaque handle, not a path, and isn't reliable in the Tauri webview. The dialog plugin is the sanctioned native-plugin path (not custom Rust). Cancel → `null` maps cleanly to FR-008 (leave config unchanged).

**Alternatives considered**: Hand-typed path field — rejected (typo-prone, poor UX, easy to point at the wrong place). A Rust-side custom dialog — rejected (more custom native code than a standard plugin). **Constitution note**: the dialog plugin is a *new* native bridge beyond the locked `sql`/`fs`/`notification` list — flagged in the plan; recommend the user acknowledge it.

---

## R2 — Runtime fs-scope grant for a user-chosen directory (the key risk)

**Decision**: A **minimal custom Rust command** — `grant_vault_access(path: String)` → `app.fs_scope().allow_directory(&path, true)` (recursive) — registered via `.invoke_handler`. The JS side calls it through a single wrapper `authorizeVaultPath(path)` (`invoke("grant_vault_access", { path })`) inside the production `VaultConnector`. It is invoked **(a)** right after the user picks a folder and **(b)** on app boot for the stored path, *before* any `VaultReader`/`VaultWriter` call. Without the grant, `TauriVaultFs` operations are denied by Tauri's scope.

**Rationale**: Tauri v2 enforces fs access against a scope; the static capability cannot name a user-chosen path, and least-privilege (FR-004 / 005 R1) forbids pre-allowing a broad path like `$HOME/**`. There is **no stable JS API** to extend the fs scope at runtime — `app.fs_scope().allow_directory(...)` (the `FsExt` trait) is Rust-only. So the one supported way to authorize the chosen vault is a tiny Rust command. This is "genuinely custom native code" → flagged per the Constitution; it contains no logic beyond the scope call.

**Persistence across restarts**: re-grant on boot (the connector authorizes the stored path before building the vault). Chosen over `tauri-plugin-persisted-scope` — re-granting is a one-liner already on the boot path, needs no extra plugin, and keeps the grant explicit and inspectable.

**Alternatives considered**: Broad static capability scope — rejected (over-broad, violates least-privilege for a sacred vault). `tauri-plugin-persisted-scope` alone — doesn't remove the need for the *initial* runtime grant; adds a dependency for no gain over a boot-time re-grant. A JS-only approach — none exists in v2.

**Risk/mitigation**: This is the one surface the unit suite can't exercise (no Tauri). It is verified by the GUI runtime check (quickstart); the `VaultConnector` seam keeps all provider/state-machine tests Tauri-free, and the connector is thin enough to read for correctness.

---

## R3 — Persisting the configured vault path

**Decision**: A generic **`settings` key-value table** added by migration **`m0002`** (`settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)`), with a small repo (`getSetting`/`setSetting`) on the existing `SqlExecutor` seam. The vault path is stored under the key `vault.path`. Re-recording overwrites in place (upsert).

**Rationale**: The spec commits to storing config in the one local store (the 003 SQLite DB), not a separate file — keeps all app state in a single place, already wired and backed up together. A folder path is **not a secret**, so the OS keychain (reserved for API keys, Constitution II) is inappropriate. A generic kv table is reusable for later small settings and is trivial to model/validate with zod. `m0002` is the first evolution past `m0001`, exercising the tested forward-only runner (the 003 evolution/lossless tests already cover the runner's mechanics).

**Alternatives considered**: A dedicated single-row `vault_config` table — rejected: less reusable, more ceremony for one value. A Tauri store/JSON file (`tauri-plugin-store`) — rejected: splits app state out of the SQLite store the spec designates, and adds a dependency. The OS keychain — rejected: a path isn't a secret; keychain is for keys.

---

## R4 — `VaultProvider` state machine + seams (Tauri-free testability)

**Decision**: A `VaultProvider` mirroring `DbProvider`, exposing a discriminated `VaultState` (`checking · unset · ready · unavailable`) and actions (`chooseVault`, `changeVault`, `retry`). It depends on three injectable seams (prod defaults; tests inject fakes):
- **persistence** — `getSetting`/`setSetting` over the live `SqlExecutor` (from `useDb()`),
- **`FolderPicker`** — `() => Promise<string | null>` (default: the dialog `open`),
- **`VaultConnector`** — `(path) => Promise<ConnectResult>` (default: `authorizeVaultPath` + `createVault` + probe `reader.list()` for the note count).

`VaultProvider` renders under the **ready** `DbProvider` (it needs the store to read/write the setting). It is **not** a global gate: it provides context; the Vault screen and (later) knowledge screens consume `useVault()`.

**Rationale**: Same interface-first pattern proven in 003/004 — the `initialize`-style seam made `DbProvider` testable; the picker/connector seams do the same here. Injecting `VaultConnector` lets tests drive every transition (success with a count, missing path, denied access, cancel) deterministically, and lets one integration test use a real `node:fs`-backed connector over a temp dir. The state machine, not Tauri, owns first-run/persistence/recovery/change — exactly the spec's testable surface.

**Alternatives considered**: Calling the dialog/`invoke`/`createVault` directly in the component — rejected (untestable without Tauri, couples UI to native). A global app gate on vault readiness — rejected (would block Dashboard/Domains, which don't need a vault — see R6). Putting the connector inside the 005 vault layer — rejected: keeps 005 pure infra (no `invoke`, no app concerns); the *app* composition layer is the right home for "authorize + build + probe."

---

## R5 — Recovery + validation of a stored path

**Decision**: On boot, if a path is stored, the connector authorizes it then probes with the 005 reader (`exists`/`list`). Outcomes:

| Stored path | Probe | `VaultState` |
|---|---|---|
| absent | — | `unset` |
| present, reachable | succeeds (count ≥ 0) | `ready { path, vault, noteCount }` |
| present, missing/denied | throws / scope refused | `unavailable { path, error }` |

`unavailable` renders a clear recovery prompt offering **re-choose** (and a **retry**). The app never crashes, never falls back to another location, and performs no write. A freshly *chosen* folder that fails to connect surfaces the error and **does not** overwrite a previously-good stored path (persist only on a successful connect). An empty folder is valid (`ready`, count 0). Re-choosing the current folder is idempotent.

**Rationale**: Directly implements FR-002/FR-007/SC-004. Persist-only-on-success avoids replacing a working config with a broken one. Read-only probing honors Constitution I (no probe writes).

**Alternatives considered**: Persisting the chosen path before confirming access — rejected (could strand the user on a broken config). Treating an empty folder as invalid — rejected (a brand-new vault is legitimately empty). Auto-clearing a stored-but-missing path — rejected (the user may just have an unplugged drive; keep it and let them retry).

---

## R6 — Onboarding placement (a Vault screen, not a global gate)

**Decision**: Add a **Vault** destination + `/vault` route that is the home for first-run onboarding (guided empty state when `unset`), live status (path + note count when `ready`), recovery (when `unavailable`), and change. Add a small **sidebar affordance** when no vault is configured (e.g. the Vault item flagged) so a new user is drawn to it. Knowledge screens (later) gate on `useVault()`; non-knowledge screens (Dashboard, Domains, Style guide) keep working with no vault.

**Rationale**: FR-005 requires a guided state and "no vault I/O until set" — it does **not** require freezing the whole app. A dedicated screen + an unset affordance satisfies onboarding without blocking unrelated screens, and gives change/recovery a natural home (FR-006/FR-011). Matches the existing nav-registry pattern (`navigation.ts` → sidebar + routes).

**Alternatives considered**: A blocking modal/gate over the entire app until a vault is set — rejected (Dashboard/Domains/Style guide are usable without a vault; a hard gate is heavier than the spec needs). A topbar-only indicator with no dedicated screen — rejected (no good home for change/recovery/status detail).

---

## Open questions

None. Notes browsing/editing, the §13 diff dialog, the live watcher, multiple vaults, and tracking-data migration on vault change are out of scope (spec). The one carried risk — the runtime fs-scope grant (R2) — is isolated behind the `VaultConnector` seam and verified by the GUI runtime check, keeping the unit suite Tauri-free.
