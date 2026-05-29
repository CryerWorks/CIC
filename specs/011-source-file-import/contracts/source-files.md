# Contract — `SourceFiles` seam + native commands (011)

The Tauri-specific surface (native file dialog + the Rust copy/remove commands) sits behind one TS seam so the React hook/components are unit-testable without Tauri (Constitution IV; mirrors `FolderPicker`/`VaultConnector`).

## TS seam (`src/features/resources/sourceFiles.ts`)

```ts
import type { ResourceKind } from "../../db";

/** Tauri-facing operations for internalized source files. The ONLY module that imports
 *  @tauri-apps/plugin-dialog + invoke for this feature; everything else depends on this seam. */
export interface SourceFiles {
  /** Open the native chooser filtered for `kind`. Resolves to the chosen absolute path,
   *  or null if the user cancels. */
  pickFile(kind: ResourceKind): Promise<string | null>;

  /** Copy `sourcePath` into the app store for `resourceId` (replacing any existing file),
   *  returning the internalized absolute path to record in `resources.file_path`.
   *  Rejects if the source is unreadable / the copy fails (caller leaves file_path unset). */
  importFile(input: { sourcePath: string; resourceId: string; filename: string }): Promise<string>;

  /** Remove the app-store folder for `resourceId`. No-op if absent; never throws on "missing". */
  removeFiles(resourceId: string): Promise<void>;
}

/** Production impl over the native dialog + the custom Rust commands. */
export const tauriSourceFiles: SourceFiles;
```

- `pickFile` wraps `@tauri-apps/plugin-dialog` `open({ multiple:false, directory:false, filters:[…] })`. Filters by kind (R7): `pdf`→`["pdf"]`, `epub`→`["epub"]`, `markdown`→`["md","markdown"]`, `video_file`→`["mp4","mkv","mov","webm","avi"]`, `audio`→`["mp3","m4a","wav","flac","ogg"]`. URL-kinds never call `pickFile`.
- `importFile`/`removeFiles` call `invoke("import_resource_file"|"remove_resource_files", …)`.
- `filename` passed to `importFile` is derived from `sourcePath`'s basename on the JS side for display; the Rust side **re-derives** the basename defensively (R11).

### Dependency injection

`SourceFiles` is provided the same way the app already injects `connect`/`initialize` (composition root → `renderApp` for tests). Component/hook tests pass a fake:

```ts
const fakeSourceFiles: SourceFiles = {
  pickFile: async () => "/picked/baby-rudin.pdf",
  importFile: async ({ resourceId, filename }) => `/store/resources/${resourceId}/${filename}`,
  removeFiles: async () => {},
};
```

## Native commands (`src-tauri/src/lib.rs`)

Two custom commands (flagged native code; registered in `invoke_handler`):

```rust
#[tauri::command]
fn import_resource_file(
    app: tauri::AppHandle,
    source_path: String,
    resource_id: String,
    filename: String,
) -> Result<String, String>;   // Ok(internalized_absolute_path) | Err(message)

#[tauri::command]
fn remove_resource_files(
    app: tauri::AppHandle,
    resource_id: String,
) -> Result<(), String>;        // Ok(()) even if the folder is absent
```

### `import_resource_file` behaviour — copy-then-rename-then-prune (failure-safe; analyze F1)

1. Resolve `base = app.path().app_local_data_dir()? / "resources"`.
2. **Validate** `resource_id` against `^[0-9a-fA-F-]+$`; reject otherwise (R11).
3. `safe_name = Path::new(&filename).file_name()` (basename only); reject if empty.
4. `dest_dir = base / resource_id`; `create_dir_all(dest_dir)` (ensure it exists — do **not** clear it yet).
5. Verify `dest_dir` canonicalises to within `base` (containment; R11).
6. Copy the new file to a **temp** path first: `std::fs::copy(source_path, dest_dir/".incoming.tmp")`. On error → delete the temp if present, return `Err`; the prior file (if any) is **untouched**.
7. On copy success, **atomically rename** `.incoming.tmp` → `dest_dir/safe_name` (same filesystem → atomic), then **prune**: remove every other entry in `dest_dir` (the previous file, if its name differed). This is the "one file per Resource" replace (R8/FR-005).
8. Return `dest_dir/safe_name` as a string. Net effect: the swap to the new file is all-or-nothing; a failure at any step leaves the prior file and the caller's `file_path` unchanged (FR-011/SC-002).

### `remove_resource_files` behaviour

1. `dir = app_local_data_dir()? / "resources" / resource_id` (same validation).
2. If `dir.exists()`, `std::fs::remove_dir_all(dir)`; else no-op. Errors → `Err` (caller logs but still completes the row delete — FR-009).

### Invariants

- **Never writes inside `vaultPath`** — the destination base is fixed to `app_local_data_dir/resources` and inputs are sanitised; the vault path is never an input (Constitution I, SC-005).
- **Source untouched** — copy only, never move/modify (FR-003, SC-006).
- **Failure-safe replace** — a re-import that fails at any step leaves the prior stored file (and the Resource's `file_path`) intact; the new file is swapped in only via the temp→rename→prune sequence (FR-011, SC-002).
- **Fully local** — pure local fs; no network (FR-010).
- **No new capability** — uses Rust std fs (no `tauri-plugin-fs` scope); `dialog:allow-open` + `opener:default` already granted.
