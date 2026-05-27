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
  await migrate(db);
  return db;
}
