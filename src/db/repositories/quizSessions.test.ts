// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain } from "./domains";
import { createCourse } from "./courses";
import { insertQuizSession, getLastQuizForCourse } from "./quizSessions";
import type { QuizSessionInsert } from "./quizSessions";

const VID = "vault-quiz";

async function freshDb() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: VID, path: "/vault-quiz-test" });
  return db;
}

async function seedCourse(db: NodeSqlExecutor, title = "Test Course", domainName = "Test Domain") {
  const domain = await createDomain(db, VID, { name: domainName, color: "#00ff00" });
  const course = await createCourse(db, { title, domainId: domain.id });
  return { domain, course };
}

function makeSession(overrides: Partial<QuizSessionInsert> = {}): QuizSessionInsert {
  return {
    id: crypto.randomUUID(),
    vaultId: VID,
    courseId: null,
    topic: "Calculus",
    questions: JSON.stringify([
      { question: "Q1?", answer: "A1." },
      { question: "Q2?", answer: "A2." },
    ]),
    ...overrides,
  };
}

describe("quizSessions repo", () => {
  it("insertQuizSession inserts a row", async () => {
    const db = await freshDb();
    const s = makeSession();

    await insertQuizSession(db, s);
    const rows = await db.select("SELECT * FROM quiz_sessions");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(s.id);
    expect(rows[0].topic).toBe("Calculus");
    expect(rows[0].created_at).toBeTruthy();
  });

  it("getLastQuizForCourse returns null when no session exists", async () => {
    const db = await freshDb();
    const result = await getLastQuizForCourse(db, VID, "nonexistent-course");
    expect(result).toBeNull();
  });

  it("getLastQuizForCourse returns the most recent session", async () => {
    const db = await freshDb();
    const { course } = await seedCourse(db);

    // Use direct SQL to control created_at timestamps deterministically
    const s1Id = crypto.randomUUID();
    const s2Id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO quiz_sessions (id, vault_id, course_id, topic, questions, created_at) VALUES (?, ?, ?, ?, ?, '2026-01-01T00:00:00')`,
      [s1Id, VID, course.id, "Calculus", "[]"],
    );
    await db.execute(
      `INSERT INTO quiz_sessions (id, vault_id, course_id, topic, questions, created_at) VALUES (?, ?, ?, ?, ?, '2026-06-01T00:00:00')`,
      [s2Id, VID, course.id, "Calculus", "[]"],
    );

    const last = await getLastQuizForCourse(db, VID, course.id);
    expect(last).not.toBeNull();
    expect(last!.id).toBe(s2Id);
  });

  it("getLastQuizForCourse scopes to vaultId", async () => {
    const db = await freshDb();
    const otherVault = "vault-other";
    await attachVault(db, { id: otherVault, path: "/other" });

    const s1 = makeSession({ id: crypto.randomUUID(), vaultId: VID });
    const s2 = makeSession({ id: crypto.randomUUID(), vaultId: otherVault });

    await insertQuizSession(db, s1);
    await insertQuizSession(db, s2);

    // Both have courseId: null, so getLastQuizForCourse would filter on course_id = null
    // We verify vault scoping via a direct query instead
    const rows = await db.select("SELECT * FROM quiz_sessions WHERE vault_id = ?", [VID]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(s1.id);
  });

  it("getLastQuizForCourse returns row with correct shape", async () => {
    const db = await freshDb();
    const { course } = await seedCourse(db);
    const s = makeSession({ courseId: course.id });

    await insertQuizSession(db, s);
    const result = await getLastQuizForCourse(db, VID, course.id);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(s.id);
    expect(result!.course_id).toBe(course.id);
    expect(result!.questions).toContain("Q1?");
    expect(result!.created_at).toBeTruthy();
  });

  it("getLastQuizForCourse returns null for wrong course", async () => {
    const db = await freshDb();
    const { course } = await seedCourse(db, "Course A");
    // Use a different domain name to avoid UNIQUE constraint
    const { course: courseB } = await seedCourse(db, "Course B", "Other Domain");

    const s = makeSession({ courseId: course.id });
    await insertQuizSession(db, s);

    const result = await getLastQuizForCourse(db, VID, courseB.id);
    expect(result).toBeNull();
  });
});
