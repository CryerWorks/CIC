// Feature 001 — minimal Tauri 2 shell. No custom commands yet: the frontend renders
// static content and invokes no IPC (the first command, with its contract, arrives in a
// later feature). The opener plugin is the scaffold default and is left in place.
//
// Feature 003 — SQLite via tauri-plugin-sql. Builder::default() (no Rust-side migrations):
// the schema and its forward-only migration runner live in TypeScript (src/db), so they
// stay reviewable in one place and unit-testable through the SqlExecutor seam. This is
// standard plugin wiring, not custom native logic.
//
// Feature 005 — the vault filesystem bridge via tauri-plugin-fs. Standard plugin wiring (no
// custom Rust). The capability (capabilities/default.json) grants the fs *commands* the
// VaultFs adapter calls; the allowed *path* is not static — the vault folder is user-chosen,
// so its scope is granted at runtime when the vault is configured (research R1). All `.md`
// access still funnels through src/vault (VaultReader/VaultWriter) — this only exposes the
// primitive commands that layer is built on.
//
// Feature 006 — vault configuration. The dialog plugin provides the native folder chooser.
// `grant_vault_access` is the ONE custom command (Constitution: flag custom native code): it
// extends the fs scope to the user-chosen vault folder at runtime — the only supported way to
// authorize a dynamic directory under least-privilege (research R2). No business logic beyond
// the scope call; invoked on each pick and on app boot for the stored path (006 contract).
#[tauri::command]
fn grant_vault_access(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_fs::FsExt;
    app.fs_scope()
        .allow_directory(&path, true)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![grant_vault_access])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
