import type { Migration } from "../migrate";

/**
 * Feature 012 (two-phase Daily Loop) — session lifecycle. Additive only (research R1/R2):
 *
 * - `sessions.status` ('planned' → 'completed') so a session can be *established* (planned) and
 *   *done* later — the corrected product model. `DEFAULT 'planned'` is harmless for the empty
 *   table and makes any bare insert a plan until finish flips it.
 * - `sessions.completed_at` — the completion timestamp (null while planned); `date` stays the
 *   planned/creation time so the plan timestamp isn't lost on finish.
 * - `session_card_drafts` — intended card prompts staged at plan time and materialized into real
 *   (new) `cards` on finish, then deleted. They live here (not in `cards`) so un-engaged prompts
 *   never enter the SRS queue before the learner does the session (Constitution III).
 *
 * No table rebuild — safe under the idempotent, transaction-wrapped runner and the pooled adapter
 * (`ADD COLUMN` is guarded by `columnExists`; the CREATE/INDEX use `IF NOT EXISTS`).
 * IMMUTABLE once shipped.
 */
export const m0006SessionLifecycle: Migration = {
  version: 6,
  name: "session_lifecycle",
  sql: `
ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed'));
ALTER TABLE sessions ADD COLUMN completed_at TEXT;

CREATE TABLE IF NOT EXISTS session_card_drafts (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  front       TEXT NOT NULL,
  back        TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_session_card_drafts_session_id ON session_card_drafts(session_id);
`.trim(),
};
