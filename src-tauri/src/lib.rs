// Feature 001 — minimal Tauri 2 shell. No custom commands yet: the frontend renders
// static content and invokes no IPC (the first command, with its contract, arrives in a
// later feature). The opener plugin is the scaffold default and is left in place.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
