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

// Feature 011 — source file import. `import_resource_file` / `remove_resource_files` are custom
// native code (flagged per Constitution Tech-Constraint): copying a user-picked file from an
// ARBITRARY source path needs full fs access, which Rust has without granting broad JS fs scope.
// The destination is always the app-managed store `appLocalData/resources/<id>/` — NEVER the vault
// (Constitution I) — and `resource_id`/`filename` are sanitised so a crafted value can't escape it.
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Resolve the per-resource store dir `appLocalData/resources/<resource_id>`. `resource_id` is
/// validated to the UUID charset (hex + `-`) so it cannot contain a path separator or `..` — the
/// destination is therefore structurally contained within the store base (no traversal; the vault
/// is never reachable).
fn resource_store_dir(app: &tauri::AppHandle, resource_id: &str) -> Result<PathBuf, String> {
    if resource_id.is_empty() || !resource_id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("invalid resource id".into());
    }
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("resources");
    Ok(base.join(resource_id))
}

/// Copy `source_path` into the resource's store folder (failure-safe replace): copy to a temp file,
/// atomically rename it into place, then prune any prior file. A failure at any step leaves the
/// previous stored file untouched. Returns the internalized absolute path.
#[tauri::command]
fn import_resource_file(
    app: tauri::AppHandle,
    source_path: String,
    resource_id: String,
    filename: String,
) -> Result<String, String> {
    let safe_name = Path::new(&filename)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "invalid filename".to_string())?;

    let dir = resource_store_dir(&app, &resource_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let tmp = dir.join(".incoming.tmp");
    if let Err(e) = std::fs::copy(&source_path, &tmp) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }

    let dest = dir.join(&safe_name);
    if let Err(e) = std::fs::rename(&tmp, &dest) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }

    // Prune stale siblings (a prior import with a different filename) only after the swap succeeded.
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if entry.file_name() != std::ffi::OsStr::new(&safe_name) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    dest.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "invalid destination path".to_string())
}

/// Remove a resource's store folder. No-op (Ok) if it doesn't exist.
#[tauri::command]
fn remove_resource_files(app: tauri::AppHandle, resource_id: String) -> Result<(), String> {
    let dir = resource_store_dir(&app, &resource_id)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Feature 011 (quickstart follow-up) — open a PDF citation AT its page locator. Why a custom command
// instead of the opener plugin: a citation target is a `file://…#page=N` URL, but Windows' shell-open
// canonicalises a `file:` URL to a plain path and DROPS the `#page=` fragment before the PDF app sees
// it — so the page jump is lost and every PDF lands on page 1. Browsers (Edge/Chrome/Firefox) DO honor
// `#page=` when the URL is passed as a command-line argument, so we detect the user's default browser
// from the registry and launch it directly. The TS caller only routes `.pdf` file URLs here and falls
// back to the plain opener if this fails, so a failed detection still opens the file (just at page 1).

/// Read a single REG_SZ/REG_EXPAND_SZ value via `reg query` (avoids a registry crate dependency).
/// `CREATE_NO_WINDOW` suppresses the console flash. `value = None` reads the key's default value.
#[cfg(windows)]
fn query_reg(key: &str, value: Option<&str>) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut cmd = Command::new("reg");
    cmd.arg("query").arg(key);
    match value {
        Some(v) => {
            cmd.args(["/v", v]);
        }
        None => {
            cmd.arg("/ve");
        }
    }
    cmd.creation_flags(CREATE_NO_WINDOW);
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!("reg query failed for {key}"));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    for line in text.lines() {
        for ty in ["REG_SZ", "REG_EXPAND_SZ"] {
            if let Some(idx) = line.find(ty) {
                let val = line[idx + ty.len()..].trim();
                if !val.is_empty() {
                    return Ok(val.to_string());
                }
            }
        }
    }
    Err(format!("no string value in {key}"))
}

/// Pull the executable path out of a registry `shell\open\command` template — the leading quoted path
/// (e.g. `"C:\…\msedge.exe" --single-argument %1`) or the first whitespace-delimited token.
#[cfg(windows)]
fn extract_exe(command: &str) -> Option<String> {
    let c = command.trim();
    if let Some(rest) = c.strip_prefix('"') {
        rest.split('"').next().map(str::to_string)
    } else {
        c.split_whitespace().next().map(str::to_string)
    }
}

/// Resolve the default browser's executable + whether its launch template uses `--single-argument`
/// (Chromium's flag for passing a whole URL as one token). Prefers the modern `https` association,
/// falling back to `http`.
#[cfg(windows)]
fn default_browser_launch() -> Result<(String, bool), String> {
    let progid = query_reg(
        r"HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice",
        Some("ProgId"),
    )
    .or_else(|_| {
        query_reg(
            r"HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice",
            Some("ProgId"),
        )
    })?;
    let command = query_reg(&format!(r"HKEY_CLASSES_ROOT\{progid}\shell\open\command"), None)?;
    let exe = extract_exe(&command).ok_or_else(|| "could not parse browser command".to_string())?;
    Ok((exe, command.contains("--single-argument")))
}

/// Open a (file/http/https) URL in the user's default browser so a PDF `#page=N` fragment is honored.
/// The scheme allowlist also prevents a leading-`-` argument from being mis-read as a browser flag.
#[cfg(windows)]
#[tauri::command]
fn open_url_in_default_browser(url: String) -> Result<(), String> {
    use std::process::Command;
    if !(url.starts_with("file://") || url.starts_with("http://") || url.starts_with("https://")) {
        return Err("unsupported url scheme".into());
    }
    let (exe, single) = default_browser_launch()?;
    let mut cmd = Command::new(&exe);
    if single {
        cmd.arg("--single-argument");
    }
    cmd.arg(&url);
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
fn open_url_in_default_browser(_url: String) -> Result<(), String> {
    Err("default-browser open is only implemented on Windows".into())
}

// Feature 016 — AI provider layer secrets storage. The three `ai_keychain_*` commands wrap the
// `keyring` crate (which speaks to Windows Credential Manager / macOS Keychain / Linux libsecret
// directly) so API keys never live in cleartext on disk (Constitution II). Service name is fixed
// at `cic.ai.providers`; the per-provider `ref` is the keychain "username", which (in v1) equals
// the provider's id. The only TypeScript caller is `src/ai/adapters/secrets/tauri.ts`.

const AI_KEYCHAIN_SERVICE: &str = "cic.ai.providers";

#[tauri::command]
fn ai_keychain_set(reference: String, secret: String) -> Result<(), String> {
    if reference.is_empty() {
        return Err("ref is required".into());
    }
    if secret.is_empty() {
        return Err("secret is required".into());
    }
    let entry = keyring::Entry::new(AI_KEYCHAIN_SERVICE, &reference).map_err(|e| e.to_string())?;
    entry.set_password(&secret).map_err(|e| e.to_string())
}

#[tauri::command]
fn ai_keychain_get(reference: String) -> Result<Option<String>, String> {
    if reference.is_empty() {
        return Err("ref is required".into());
    }
    let entry = keyring::Entry::new(AI_KEYCHAIN_SERVICE, &reference).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn ai_keychain_delete(reference: String) -> Result<(), String> {
    if reference.is_empty() {
        return Err("ref is required".into());
    }
    let entry = keyring::Entry::new(AI_KEYCHAIN_SERVICE, &reference).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        // Feature 016 (CORS fix): native HTTP so AI provider calls bypass the webview's CORS
        // (which blocks local LLM servers that send no Access-Control-Allow-Origin). See Cargo.toml.
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            grant_vault_access,
            import_resource_file,
            remove_resource_files,
            open_url_in_default_browser,
            ai_keychain_set,
            ai_keychain_get,
            ai_keychain_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
