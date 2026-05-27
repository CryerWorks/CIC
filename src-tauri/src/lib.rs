// Feature 001 — minimal Tauri 2 shell. No custom commands yet: the frontend renders
// static content and invokes no IPC (the first command, with its contract, arrives in a
// later feature). The opener plugin is the scaffold default and is left in place.
//
// Feature 003 — SQLite via tauri-plugin-sql. Builder::default() (no Rust-side migrations):
// the schema and its forward-only migration runner live in TypeScript (src/db), so they
// stay reviewable in one place and unit-testable through the SqlExecutor seam. This is
// standard plugin wiring, not custom native logic.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
