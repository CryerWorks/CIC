// Feature 017 — RAG ingestion pipeline: sqlite-vec vector store.
//
// Six custom Tauri commands expose sqlite-vec operations to the frontend. The TypeScript
// adapter (src/ai/adapters/rag/tauri.ts) is the ONLY caller.
//
// Commands:
//   rag_init              — attach sqlite-vec extension to the SQLite connection (boot-time)
//   rag_insert_chunks     — batch insert chunks + embeddings via sqlite-vec vec0 table
//   rag_delete_by_source  — remove all chunks for a Resource or vault note
//   rag_search            — KNN search via MATCH on vec0, joined back to chunks for metadata
//   rag_get_source_stats  — chunk counts by source in the active vault
//   rag_get_chunk_count   — total chunks in the active vault

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sqlite_vec::sqlite3_vec_init;
use tauri::Manager;

// ── Database helper ──

/// Open the app-local SQLite database (same file used by tauri-plugin-sql).
fn open_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let db_path = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("cic.db");
    Connection::open(&db_path).map_err(|e| format!("cannot open db: {}", e))
}

// ── TypeScript-facing types (mirror src/ai/rag/types.ts) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkInput {
    pub id: String,
    #[serde(rename = "vaultId")]
    pub vault_id: String,
    #[serde(rename = "sourceKind")]
    pub source_kind: String,
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "sourceTitle")]
    pub source_title: String,
    #[serde(rename = "chunkIndex")]
    pub chunk_index: i32,
    #[serde(rename = "headingPath")]
    pub heading_path: Option<String>,
    #[serde(rename = "textContent")]
    pub text_content: String,
    #[serde(rename = "contentHash")]
    pub content_hash: String,
    #[serde(rename = "charOffsetStart")]
    pub char_offset_start: i32,
    #[serde(rename = "charOffsetEnd")]
    pub char_offset_end: i32,
    pub embedding: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchFilter {
    #[serde(rename = "sourceKind")]
    pub source_kind: Option<String>,
    #[serde(rename = "resourceId")]
    pub resource_id: Option<String>,
    #[serde(rename = "courseId")]
    pub course_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkRow {
    pub id: String,
    #[serde(rename = "vaultId")]
    pub vault_id: String,
    #[serde(rename = "sourceKind")]
    pub source_kind: String,
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "sourceTitle")]
    pub source_title: String,
    #[serde(rename = "chunkIndex")]
    pub chunk_index: i32,
    #[serde(rename = "headingPath")]
    pub heading_path: Option<String>,
    #[serde(rename = "textContent")]
    pub text_content: String,
    #[serde(rename = "contentHash")]
    pub content_hash: String,
    #[serde(rename = "charOffsetStart")]
    pub char_offset_start: i32,
    #[serde(rename = "charOffsetEnd")]
    pub char_offset_end: i32,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub chunk: ChunkRow,
    pub distance: f64,
    #[serde(rename = "resourceId")]
    pub resource_id: Option<String>,
    #[serde(rename = "milestoneId")]
    pub milestone_id: Option<String>,
    pub locator: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceStats {
    #[serde(rename = "sourceKind")]
    pub source_kind: String,
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "sourceTitle")]
    pub source_title: String,
    #[serde(rename = "chunkCount")]
    pub chunk_count: i32,
    #[serde(rename = "lastUpdated")]
    pub last_updated: String,
}

/// Convert a f32 slice to a JSON array string for sqlite-vec's vec_f32() SQL function.
fn embedding_to_json(vec: &[f32]) -> String {
    serde_json::to_string(vec).unwrap_or_else(|_| "[]".to_string())
}

/// Attach sqlite-vec extension. Idempotent — safe to call multiple times.
/// sqlite3_vec_init() registers as a SQLite auto-extension (no arguments needed).
#[tauri::command]
pub fn rag_init(app: tauri::AppHandle) -> Result<(), String> {
    // sqlite-vec registers itself globally via sqlite3_auto_extension.
    // We open a connection to trigger the auto-extension, then close it.
    unsafe {
        sqlite3_vec_init();
    }
    let conn = open_db(&app)?;
    // Verify the vec0 function is available
    conn.execute("SELECT vec_f32('[0]')", [])
        .map_err(|e| format!("sqlite-vec not loaded: {}", e))?;
    Ok(())
}

/// Batch insert chunks with embeddings into `chunks` + `chunks_vec` tables.
/// For Resource chunks, also inserts into `resource_map`.
/// Returns the number of chunks inserted.
#[tauri::command]
pub fn rag_insert_chunks(
    app: tauri::AppHandle,
    chunks: Vec<ChunkInput>,
) -> Result<u32, String> {
    let conn = open_db(&app)?;
    let mut count: u32 = 0;

    for chunk in &chunks {
        let embed_json = embedding_to_json(&chunk.embedding);

        conn.execute(
            "INSERT OR REPLACE INTO chunks (id, vault_id, source_kind, source_id, source_title, \
             chunk_index, heading_path, text_content, content_hash, char_offset_start, char_offset_end) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                chunk.id,
                chunk.vault_id,
                chunk.source_kind,
                chunk.source_id,
                chunk.source_title,
                chunk.chunk_index,
                chunk.heading_path,
                chunk.text_content,
                chunk.content_hash,
                chunk.char_offset_start,
                chunk.char_offset_end,
            ],
        )
        .map_err(|e| format!("chunk insert failed: {}", e))?;

        // Insert embedding via vec_f32() which converts JSON array to vector blob
        conn.execute(
            "INSERT INTO chunks_vec (chunk_id, embedding) VALUES (?1, vec_f32(?2))",
            params![chunk.id, embed_json],
        )
        .map_err(|e| format!("vec insert failed: {}", e))?;

        // Resource map (only for Resource chunks)
        if chunk.source_kind == "resource" {
            conn.execute(
                "INSERT OR REPLACE INTO resource_map (id, chunk_id, resource_id, locator) \
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    format!("rm_{}", chunk.id),
                    chunk.id,
                    chunk.source_id,
                    chunk.heading_path.clone().unwrap_or_default(),
                ],
            )
            .map_err(|e| format!("resource_map insert failed: {}", e))?;
        }

        count += 1;
    }

    Ok(count)
}

/// Delete all chunks for a given source (cascade-removes from chunks_vec and resource_map).
/// Returns the number of chunks removed.
#[tauri::command]
pub fn rag_delete_by_source(
    app: tauri::AppHandle,
    source_kind: String,
    source_id: String,
) -> Result<u32, String> {
    let conn = open_db(&app)?;
    let count = conn
        .execute(
            "DELETE FROM chunks WHERE source_kind = ?1 AND source_id = ?2",
            params![source_kind, source_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(count as u32)
}

/// KNN search: embed query → MATCH on chunks_vec → JOIN chunks + resource_map for metadata.
/// Returns top-k results ordered by ascending distance.
#[tauri::command]
pub fn rag_search(
    app: tauri::AppHandle,
    query_vector: Vec<f32>,
    k: usize,
    filter: Option<SearchFilter>,
) -> Result<Vec<SearchResult>, String> {
    let conn = open_db(&app)?;
    let embed_json = embedding_to_json(&query_vector);

    let mut sql = String::from(
        "SELECT c.id, c.vault_id, c.source_kind, c.source_id, c.source_title, \
                c.chunk_index, c.heading_path, c.text_content, c.content_hash, \
                c.char_offset_start, c.char_offset_end, c.created_at, \
                v.distance, \
                rm.resource_id, rm.milestone_id, rm.locator \
         FROM chunks_vec v \
         JOIN chunks c ON c.id = v.chunk_id \
         LEFT JOIN resource_map rm ON rm.chunk_id = c.id \
         WHERE v.embedding MATCH vec_f32(?1)",
    );

    let mut param_idx = 2;
    let mut has_source_kind = false;
    let mut has_resource_id = false;

    if let Some(ref f) = filter {
        if let Some(ref sk) = f.source_kind {
            sql.push_str(&format!(" AND c.source_kind = ?{}", param_idx));
            param_idx += 1;
            has_source_kind = true;
        }
        if let Some(ref rid) = f.resource_id {
            sql.push_str(&format!(" AND rm.resource_id = ?{}", param_idx));
            param_idx += 1;
            has_resource_id = true;
        }
    }

    sql.push_str(&format!(" ORDER BY v.distance LIMIT ?{}", param_idx));

    // Build params dynamically using Vec<Box<dyn rusqlite::types::ToSql>>
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    param_values.push(Box::new(embed_json));
    if has_source_kind {
        param_values.push(Box::new(
            filter.as_ref().and_then(|f| f.source_kind.clone()).unwrap_or_default(),
        ));
    }
    if has_resource_id {
        param_values.push(Box::new(
            filter
                .as_ref()
                .and_then(|f| f.resource_id.clone())
                .unwrap_or_default(),
        ));
    }
    param_values.push(Box::new(k as i64));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(
            rusqlite::params_from_iter(param_values.iter().map(|p| p.as_ref())),
            |row| {
                Ok(SearchResult {
                    chunk: ChunkRow {
                        id: row.get(0)?,
                        vault_id: row.get(1)?,
                        source_kind: row.get(2)?,
                        source_id: row.get(3)?,
                        source_title: row.get(4)?,
                        chunk_index: row.get(5)?,
                        heading_path: row.get(6)?,
                        text_content: row.get(7)?,
                        content_hash: row.get(8)?,
                        char_offset_start: row.get(9)?,
                        char_offset_end: row.get(10)?,
                        created_at: row.get(11)?,
                    },
                    distance: row.get(12)?,
                    resource_id: row.get(13)?,
                    milestone_id: row.get(14)?,
                    locator: row.get::<_, Option<String>>(15)?.unwrap_or_default(),
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

/// Get chunk counts + last-updated timestamps for all sources in the active vault.
#[tauri::command]
pub fn rag_get_source_stats(
    app: tauri::AppHandle,
    vault_id: String,
) -> Result<Vec<SourceStats>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT source_kind, source_id, source_title, \
                    COUNT(*) as chunk_count, \
                    MAX(created_at) as last_updated \
             FROM chunks \
             WHERE vault_id = ?1 \
             GROUP BY source_kind, source_id, source_title \
             ORDER BY source_kind, source_title",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![vault_id], |row| {
            Ok(SourceStats {
                source_kind: row.get(0)?,
                source_id: row.get(1)?,
                source_title: row.get(2)?,
                chunk_count: row.get(3)?,
                last_updated: row.get::<_, String>(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

/// Get content hashes for all chunks of a source (for incremental re-ingestion).
#[tauri::command]
pub fn rag_get_source_hashes(
    app: tauri::AppHandle,
    source_kind: String,
    source_id: String,
) -> Result<Vec<String>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT content_hash FROM chunks WHERE source_kind = ?1 AND source_id = ?2 ORDER BY chunk_index",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![source_kind, source_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let mut hashes = Vec::new();
    for row in rows {
        hashes.push(row.map_err(|e| e.to_string())?);
    }
    Ok(hashes)
}

/// Read the text content of a stored resource file from `appLocalData/resources/<id>/<file>`.
/// Reads the first file found in the resource's store directory.
#[tauri::command]
pub fn rag_read_resource_file(
    app: tauri::AppHandle,
    resource_id: String,
) -> Result<String, String> {
    if resource_id.is_empty()
        || !resource_id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
    {
        return Err("invalid resource id".into());
    }
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("resources")
        .join(&resource_id);

    if !dir.exists() {
        return Err(format!("no stored file for resource {}", resource_id));
    }

    let mut found: Option<std::path::PathBuf> = None;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                found = Some(path);
                break;
            }
        }
    }

    let path = found.ok_or_else(|| format!("no file found for resource {}", resource_id))?;
    std::fs::read_to_string(&path).map_err(|e| format!("cannot read file: {}", e))
}

/// Get total chunk count for the active vault.
#[tauri::command]
pub fn rag_get_chunk_count(
    app: tauri::AppHandle,
    vault_id: String,
) -> Result<u32, String> {
    let conn = open_db(&app)?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chunks WHERE vault_id = ?1",
            params![vault_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count as u32)
}
