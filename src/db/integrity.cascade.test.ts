// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "./adapters/node";
import { migrate } from "./migrate";
import { seedFullGraph } from "./test-fixtures";

async function setup() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  const ids = await seedFullGraph(db);
  return { db, ids };
}

async function count(db: NodeSqlExecutor, sql: string, param: string): Promise<number> {
  const rows = await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${sql}`, [param]);
  return rows[0].n;
}

describe("cascade behaviour (FR-003/FR-005)", () => {
  it("deleting a Course removes owned children + course_resources but keeps the shared resource", async () => {
    const { db, ids } = await setup();

    await db.execute("DELETE FROM courses WHERE id = ?", [ids.courseId]);

    // owned children gone
    expect(await count(db, "milestones WHERE course_id = ?", ids.courseId)).toBe(0);
    expect(await count(db, "sessions WHERE course_id = ?", ids.courseId)).toBe(0);
    expect(await count(db, "cards WHERE course_id = ?", ids.courseId)).toBe(0);
    expect(await count(db, "projects WHERE course_id = ?", ids.courseId)).toBe(0);
    // grandchildren gone (via the cascade chain)
    expect(await count(db, "reviews WHERE card_id = ?", ids.cardId)).toBe(0);
    expect(await count(db, "pretest_responses WHERE session_id = ?", ids.sessionId)).toBe(0);
    expect(await count(db, "session_assignments WHERE session_id = ?", ids.sessionId)).toBe(0);
    expect(await count(db, "card_resources WHERE card_id = ?", ids.cardId)).toBe(0);
    expect(await count(db, "project_milestones WHERE project_id = ?", ids.projectId)).toBe(0);
    // link row removed…
    expect(await count(db, "course_resources WHERE course_id = ?", ids.courseId)).toBe(0);
    // …but the shared resource survives (unlinking never deletes it)
    expect(await count(db, "resources WHERE id = ?", ids.resourceId)).toBe(1);
  });

  it("deleting a Project nulls dependent session/card project_id, keeping the rows", async () => {
    const { db, ids } = await setup();

    await db.execute("DELETE FROM projects WHERE id = ?", [ids.projectId]);

    const session = await db.select<{ project_id: string | null }>(
      "SELECT project_id FROM sessions WHERE id = ?",
      [ids.sessionId],
    );
    expect(session).toHaveLength(1);
    expect(session[0].project_id).toBeNull();

    const card = await db.select<{ project_id: string | null }>(
      "SELECT project_id FROM cards WHERE id = ?",
      [ids.cardId],
    );
    expect(card).toHaveLength(1);
    expect(card[0].project_id).toBeNull();

    // the project's own M:N rows are gone
    expect(await count(db, "project_milestones WHERE project_id = ?", ids.projectId)).toBe(0);
    expect(await count(db, "project_resources WHERE project_id = ?", ids.projectId)).toBe(0);
  });
});
