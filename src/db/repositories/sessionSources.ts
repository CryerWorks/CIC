import type { SqlExecutor } from "../executor";
import { SessionSourceSchema, type SessionSourceRow } from "../models/sessionSource";
import { selectParsed, update } from "./query";

/**
 * Session Sources repository (Feature 023 / Daily Loop enrichment). A session source is a single
 * reading or watching assignment within a learning session. Per-source completion tracking gates
 * the Feynman/SelfTest step — the learner must finish all sources before the AI interrogation
 * auto-launches.
 */

/** All sources for a session, ordered by their position in the curriculum. */
export async function getSourcesForSession(
  db: SqlExecutor,
  sessionId: string,
): Promise<SessionSourceRow[]> {
  return selectParsed(
    db,
    SessionSourceSchema,
    "SELECT * FROM session_sources WHERE session_id = ? ORDER BY ordering",
    [sessionId],
  );
}

/** Mark a single source as completed (toggle done). */
export async function markSourceDone(
  db: SqlExecutor,
  sourceId: string,
): Promise<void> {
  await update(db, "session_sources", { completed: true }, { id: sourceId });
}

/** Whether every source in a session is marked completed. Returns true when there are no
 *  sources (vacuously true — nothing to gate on). */
export async function areAllSourcesDone(
  db: SqlExecutor,
  sessionId: string,
): Promise<boolean> {
  const rows = await db.select<{ n: number }>(
    "SELECT COUNT(*) AS n FROM session_sources WHERE session_id = ? AND completed = 0",
    [sessionId],
  );
  return (rows[0]?.n ?? 0) === 0;
}
