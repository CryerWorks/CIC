import { TauriSqlExecutor } from "./adapters/tauri";
import { migrate } from "./migrate";
import type { SqlExecutor } from "./executor";

/**
 * Production composition root (Constitution IV — features never construct adapters). Called
 * once at app start: load the local store via the Tauri adapter, run pending migrations,
 * and hand back the executor for the rest of the app to use.
 *
 * Errors propagate to the caller (in `main.tsx`) which surfaces them — a store that fails to
 * open or migrate is a real problem the user must see, not one to swallow.
 */
export async function initDatabase(): Promise<SqlExecutor> {
  const db = await TauriSqlExecutor.load("sqlite:cic.db");
  // tauri-plugin-sql backs SQLite with an sqlx connection POOL, so a write on one connection can
  // collide with reads/writes on another and return SQLITE_BUSY ("database is locked"). Two PRAGMAs
  // fix this: WAL lets readers and a single writer proceed concurrently (persisted at the DB-file
  // level, so every pooled connection inherits it), and busy_timeout makes any remaining contention
  // wait-and-retry instead of erroring immediately. Set before migrate so the migration benefits too.
  await db.execute("PRAGMA journal_mode = WAL");
  await db.execute("PRAGMA busy_timeout = 5000");
  await migrate(db);
  return db;
}
