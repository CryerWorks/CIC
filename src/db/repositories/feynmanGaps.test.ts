// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain } from "./domains";
import { createCourse } from "./courses";
import {
  insertGaps,
  listOpenGaps,
  getOpenGapCountByCourse,
  countOpenGaps,
  reconcileCompleted,
} from "./feynmanGaps";
import type { FeynmanGapInsert } from "./feynmanGaps";

const VID = "vault-feynman";

async function freshDb() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: VID, path: "/vault-feynman-test" });
  return db;
}

async function seedCourse(db: NodeSqlExecutor, domainName = "Math", courseTitle = "Real Analysis") {
  const domain = await createDomain(db, VID, { name: domainName, color: "#ff0000" });
  const course = await createCourse(db, { title: courseTitle, domainId: domain.id });
  return { domain, course };
}

function makeGap(overrides: Partial<FeynmanGapInsert> = {}): FeynmanGapInsert {
  return {
    id: crypto.randomUUID(),
    vaultId: VID,
    courseId: null,
    notePath: "feynman-gaps.md",
    text: "Needs to understand the epsilon-delta definition",
    ...overrides,
  };
}

describe("feynmanGaps repo", () => {
  it("insertGaps inserts rows and listOpenGaps retrieves them", async () => {
    const db = await freshDb();
    const gap = makeGap();

    await insertGaps(db, [gap]);
    const open = await listOpenGaps(db, VID);

    expect(open).toHaveLength(1);
    expect(open[0].id).toBe(gap.id);
    expect(open[0].text).toBe(gap.text);
    expect(open[0].status).toBe("open");
    expect(open[0].course_id).toBeNull();
    expect(open[0].note_path).toBe("feynman-gaps.md");
    expect(open[0].created_at).toBeTruthy();
  });

  it("insertGaps batch-inserts multiple gaps", async () => {
    const db = await freshDb();
    const gaps = [makeGap({ text: "Gap A" }), makeGap({ text: "Gap B" }), makeGap({ text: "Gap C" })];

    await insertGaps(db, gaps);
    const open = await listOpenGaps(db, VID);

    expect(open).toHaveLength(3);
    expect(open.map((g) => g.text).sort()).toEqual(["Gap A", "Gap B", "Gap C"]);
  });

  it("listOpenGaps returns only open gaps, ordered by created_at", async () => {
    const db = await freshDb();
    const g1Id = crypto.randomUUID();
    const g2Id = crypto.randomUUID();
    const completedId = crypto.randomUUID();

    await db.execute(
      `INSERT INTO feynman_gaps (id, vault_id, course_id, note_path, text, status, created_at)
       VALUES (?, ?, NULL, ?, ?, 'open', '2026-01-01T00:00:00')`,
      [g1Id, VID, "note.md", "Old gap"],
    );
    await db.execute(
      `INSERT INTO feynman_gaps (id, vault_id, course_id, note_path, text, status, created_at)
       VALUES (?, ?, NULL, ?, ?, 'open', '2026-06-01T00:00:00')`,
      [g2Id, VID, "note.md", "New gap"],
    );
    await db.execute(
      `INSERT INTO feynman_gaps (id, vault_id, course_id, note_path, text, status, created_at)
       VALUES (?, ?, NULL, ?, ?, 'completed', '2026-03-01T00:00:00')`,
      [completedId, VID, "note.md", "Completed gap"],
    );

    const open = await listOpenGaps(db, VID);
    expect(open).toHaveLength(2);
    expect(open[0].text).toBe("New gap");
    expect(open[1].text).toBe("Old gap");
  });

  it("listOpenGaps scopes to vaultId", async () => {
    const db = await freshDb();
    const otherVault = "vault-other";
    await attachVault(db, { id: otherVault, path: "/other" });

    await insertGaps(db, [makeGap({ vaultId: VID, text: "Vault 1 gap" })]);
    await insertGaps(db, [makeGap({ vaultId: otherVault, text: "Vault 2 gap" })]);

    expect(await listOpenGaps(db, VID)).toHaveLength(1);
    expect(await listOpenGaps(db, otherVault)).toHaveLength(1);
  });

  it("getOpenGapCountByCourse groups gaps by course with title", async () => {
    const db = await freshDb();
    const { course } = await seedCourse(db);

    await insertGaps(db, [
      makeGap({ courseId: course.id, text: "Gap in course" }),
      makeGap({ courseId: course.id, text: "Another gap in course" }),
      makeGap({ courseId: null, text: "Gap without course" }),
    ]);

    const counts = await getOpenGapCountByCourse(db, VID);

    expect(counts).toHaveLength(2);

    const courseCount = counts.find((c) => c.courseId === course.id);
    expect(courseCount).toBeTruthy();
    expect(courseCount!.count).toBe(2);
    expect(courseCount!.courseTitle).toBe("Real Analysis");

    const nullCount = counts.find((c) => c.courseId === null);
    expect(nullCount).toBeTruthy();
    expect(nullCount!.count).toBe(1);
  });

  it("getOpenGapCountByCourse returns empty array when no gaps", async () => {
    const db = await freshDb();
    const counts = await getOpenGapCountByCourse(db, VID);
    expect(counts).toEqual([]);
  });

  it("countOpenGaps returns total open gap count", async () => {
    const db = await freshDb();
    expect(await countOpenGaps(db, VID)).toBe(0);

    await insertGaps(db, [makeGap(), makeGap()]);
    expect(await countOpenGaps(db, VID)).toBe(2);
  });

  it("countOpenGaps scopes to vault", async () => {
    const db = await freshDb();
    const otherVault = "vault-other";
    await attachVault(db, { id: otherVault, path: "/other" });

    await insertGaps(db, [makeGap({ vaultId: VID })]);
    await insertGaps(db, [makeGap({ vaultId: otherVault })]);

    expect(await countOpenGaps(db, VID)).toBe(1);
    expect(await countOpenGaps(db, otherVault)).toBe(1);
  });

  it("reconcileCompleted returns 0 when no open gaps", async () => {
    const db = await freshDb();
    const readBody: (p: string) => Promise<string | null> = () => Promise.resolve(null);
    expect(await reconcileCompleted(db, VID, readBody)).toBe(0);
  });

  it("reconcileCompleted marks gaps as completed when checklist items found", async () => {
    const db = await freshDb();
    await insertGaps(db, [
      makeGap({ id: "g1", notePath: "math.md", text: "Epsilon-delta definition" }),
      makeGap({ id: "g2", notePath: "math.md", text: "Continuity" }),
      makeGap({ id: "g3", notePath: "physics.md", text: "Newton's laws" }),
    ]);

    const bodies = new Map<string, string>([
      [
        "math.md",
        [
          "## Gaps from Feynman",
          "- [x] Epsilon-delta definition",
          "- [ ] Continuity",
          "- [x] Something not in gaps",
        ].join("\n"),
      ],
      [
        "physics.md",
        [
          "## Gaps from Feynman",
          "- [x] Newton's laws",
        ].join("\n"),
      ],
    ]);
    const readBody: (p: string) => Promise<string | null> = async (p) => bodies.get(p) ?? null;

    expect(await reconcileCompleted(db, VID, readBody)).toBe(2);

    // g1 and g3 should be completed; g2 stays open
    const remaining = await listOpenGaps(db, VID);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("g2");
  });

  it("reconcileCompleted skips gaps whose file cannot be read", async () => {
    const db = await freshDb();
    await insertGaps(db, [
      makeGap({ id: "g1", notePath: "missing.md", text: "Lost gap" }),
    ]);

    const readBody: (p: string) => Promise<string | null> = async () => null; // always fails
    expect(await reconcileCompleted(db, VID, readBody)).toBe(0);

    const open = await listOpenGaps(db, VID);
    expect(open).toHaveLength(1);
  });

  it("reconcileCompleted ignores completed items outside the Gaps section", async () => {
    const db = await freshDb();
    await insertGaps(db, [
      makeGap({ id: "g1", notePath: "math.md", text: "Limit theorem" }),
    ]);

    const bodies = new Map<string, string>([
      [
        "math.md",
        [
          "## Different Section",
          "- [x] Limit theorem", // completed but in wrong section → should NOT match
          "## Gaps from Feynman",
          "- [ ] Limit theorem",
        ].join("\n"),
      ],
    ]);
    const readBody: (p: string) => Promise<string | null> = async (p) => bodies.get(p) ?? null;

    expect(await reconcileCompleted(db, VID, readBody)).toBe(0);

    const open = await listOpenGaps(db, VID);
    expect(open).toHaveLength(1); // still open
  });

  it("reconcileCompleted handles multiple gaps in same file", async () => {
    const db = await freshDb();
    await insertGaps(db, [
      makeGap({ id: "g1", notePath: "gaps.md", text: "Gap A" }),
      makeGap({ id: "g2", notePath: "gaps.md", text: "Gap B" }),
      makeGap({ id: "g3", notePath: "gaps.md", text: "Gap C" }),
    ]);

    const bodies = new Map<string, string>([
      [
        "gaps.md",
        [
          "## Gaps from Feynman",
          "- [x] Gap A",
          "- [x] Gap C",
        ].join("\n"),
      ],
    ]);
    const readBody: (p: string) => Promise<string | null> = async (p) => bodies.get(p) ?? null;

    expect(await reconcileCompleted(db, VID, readBody)).toBe(2);

    const open = await listOpenGaps(db, VID);
    expect(open).toHaveLength(1);
    expect(open[0].text).toBe("Gap B");
  });

  it("reconcileCompleted scopes to vault", async () => {
    const db = await freshDb();
    const otherVault = "vault-other";
    await attachVault(db, { id: otherVault, path: "/other" });

    await insertGaps(db, [makeGap({ vaultId: VID, id: "g1", notePath: "n.md", text: "My gap" })]);
    await insertGaps(db, [makeGap({ vaultId: otherVault, id: "g2", notePath: "n.md", text: "Other gap" })]);

    const bodies = new Map<string, string>([
      ["n.md", "## Gaps from Feynman\n- [x] My gap\n- [x] Other gap\n"],
    ]);
    const readBody: (p: string) => Promise<string | null> = async (p) => bodies.get(p) ?? null;

    expect(await reconcileCompleted(db, VID, readBody)).toBe(1); // only My gap
    expect(await listOpenGaps(db, VID)).toHaveLength(0);
    expect(await listOpenGaps(db, otherVault)).toHaveLength(1); // Other gap still open
  });

  it("insertGaps with empty array is a no-op", async () => {
    const db = await freshDb();
    await insertGaps(db, []);
    expect(await countOpenGaps(db, VID)).toBe(0);
  });
});
