// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "./adapters/node";
import { migrate } from "./migrate";
import { seedFullGraph } from "./test-fixtures";
import { selectParsed, upsert } from "./repositories/query";
import { DomainSchema } from "./models/domain";
import { CampaignSchema } from "./models/campaign";
import { CourseSchema } from "./models/course";
import { MilestoneSchema } from "./models/milestone";
import { ProjectSchema } from "./models/project";
import { SessionSchema } from "./models/session";
import { CardSchema } from "./models/card";
import { ReviewSchema } from "./models/review";
import { StreakSchema } from "./models/streak";
import { PretestResponseSchema } from "./models/pretestResponse";
import { ResourceSchema } from "./models/resource";
import {
  CourseResourceSchema,
  SessionAssignmentSchema,
  CardResourceSchema,
  ProjectMilestoneSchema,
  ProjectResourceSchema,
} from "./models/links";
import { VaultWriteSchema } from "./models/vaultWrite";

async function setup() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  const ids = await seedFullGraph(db);
  return { db, ids };
}

describe("one-of-every-entity round-trip (FR-002/FR-005/FR-009; SC-001)", () => {
  it("reads a valid row back, parsed through its model, for all 17 tables", async () => {
    const { db, ids } = await setup();
    const one = async <S extends Parameters<typeof selectParsed>[1]>(
      schema: S,
      sql: string,
      param: string,
    ) => (await selectParsed(db, schema, sql, [param]))[0];

    expect((await one(DomainSchema, "SELECT * FROM domains WHERE id = ?", ids.domainId)).name).toBe("Mathematics");
    expect((await one(CampaignSchema, "SELECT * FROM campaigns WHERE id = ?", ids.campaignId)).domain_id).toBe(ids.domainId);

    const course = await one(CourseSchema, "SELECT * FROM courses WHERE id = ?", ids.courseId);
    expect(course.campaign_id).toBe(ids.campaignId);
    expect(course.moc_path).toBe("Math/Real Analysis.md");

    expect((await one(MilestoneSchema, "SELECT * FROM milestones WHERE id = ?", ids.milestoneId)).status).toBe("todo");
    expect((await one(ProjectSchema, "SELECT * FROM projects WHERE id = ?", ids.projectId)).status).toBe("open");

    // boolean decoded from INTEGER 0/1
    const session = await one(SessionSchema, "SELECT * FROM sessions WHERE id = ?", ids.sessionId);
    expect(session.did_retrieval).toBe(true);

    // JSON column parsed to an object
    const card = await one(CardSchema, "SELECT * FROM cards WHERE id = ?", ids.cardId);
    expect(card.fsrs_state).toEqual({ stability: 1, difficulty: 5 });
    expect(card.project_id).toBe(ids.projectId);

    const review = await one(ReviewSchema, "SELECT * FROM reviews WHERE id = ?", ids.reviewId);
    expect(review.confidence).toBe(3);
    expect(review.rating).toBe("good");

    // JSON array column parsed
    const streak = await one(StreakSchema, "SELECT * FROM streaks WHERE date = ?", ids.streakDate);
    expect(streak.domains_touched).toEqual([ids.domainId]);

    expect((await one(PretestResponseSchema, "SELECT * FROM pretest_responses WHERE id = ?", ids.pretestId)).revealed_after).toBe(true);

    const resource = await one(ResourceSchema, "SELECT * FROM resources WHERE id = ?", ids.resourceId);
    expect(resource.metadata).toEqual({ author: "Rudin" });
    expect(resource.ingested_at).toBeNull();

    // M:N links resolve to the shared resource/milestone
    expect((await one(CourseResourceSchema, "SELECT * FROM course_resources WHERE course_id = ?", ids.courseId)).resource_id).toBe(ids.resourceId);
    expect((await one(SessionAssignmentSchema, "SELECT * FROM session_assignments WHERE id = ?", ids.assignmentId)).resource_id).toBe(ids.resourceId);
    expect((await one(CardResourceSchema, "SELECT * FROM card_resources WHERE card_id = ?", ids.cardId)).resource_id).toBe(ids.resourceId);
    expect((await one(ProjectMilestoneSchema, "SELECT * FROM project_milestones WHERE project_id = ?", ids.projectId)).milestone_id).toBe(ids.milestoneId);
    expect((await one(ProjectResourceSchema, "SELECT * FROM project_resources WHERE project_id = ?", ids.projectId)).resource_id).toBe(ids.resourceId);

    expect((await one(VaultWriteSchema, "SELECT * FROM vault_writes WHERE file_path = ?", ids.vaultPath)).app_hash).toBe("hash-v1");
  });

  it("re-records a vault_writes file_path as an in-place upsert, not a duplicate (FR-009)", async () => {
    const { db, ids } = await setup();

    await upsert(
      db,
      "vault_writes",
      { file_path: ids.vaultPath, app_mtime: "2026-05-28T00:00:00.000Z", app_hash: "hash-v2" },
      ["file_path"],
    );

    const rows = await selectParsed(
      db,
      VaultWriteSchema,
      "SELECT * FROM vault_writes WHERE file_path = ?",
      [ids.vaultPath],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].app_hash).toBe("hash-v2");
    expect(rows[0].app_mtime).toBe("2026-05-28T00:00:00.000Z");
  });
});
