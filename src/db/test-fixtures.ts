import type { SqlExecutor } from "./executor";
import { insert } from "./repositories/query";

/**
 * Test support (not a test file — no `.test.` suffix, so Vitest ignores it). Seeds exactly one
 * valid row in every one of the 17 tables, with all FKs and M:N links satisfied, and returns
 * the generated ids. Shared by the round-trip and cascade integrity tests.
 */

export interface SeededGraph {
  domainId: string;
  campaignId: string;
  courseId: string;
  milestoneId: string;
  projectId: string;
  sessionId: string;
  cardId: string;
  reviewId: string;
  resourceId: string;
  assignmentId: string;
  pretestId: string;
  streakDate: string;
  vaultPath: string;
}

const NOW = "2026-05-27T10:00:00.000Z";
const TODAY = "2026-05-27";

export async function seedFullGraph(db: SqlExecutor): Promise<SeededGraph> {
  const ids: SeededGraph = {
    domainId: crypto.randomUUID(),
    campaignId: crypto.randomUUID(),
    courseId: crypto.randomUUID(),
    milestoneId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    cardId: crypto.randomUUID(),
    reviewId: crypto.randomUUID(),
    resourceId: crypto.randomUUID(),
    assignmentId: crypto.randomUUID(),
    pretestId: crypto.randomUUID(),
    streakDate: TODAY,
    vaultPath: "Math/Real Analysis.md",
  };

  await insert(db, "domains", { id: ids.domainId, name: "Mathematics", color: "#8b6cef" });
  await insert(db, "campaigns", { id: ids.campaignId, title: "Analysis Track", domain_id: ids.domainId });
  await insert(db, "courses", {
    id: ids.courseId,
    title: "Real Analysis",
    domain_id: ids.domainId,
    campaign_id: ids.campaignId,
    moc_path: "Math/Real Analysis.md",
  });
  await insert(db, "milestones", {
    id: ids.milestoneId,
    course_id: ids.courseId,
    capability: "Prove continuity",
    status: "todo",
    order_index: 0,
  });
  await insert(db, "projects", {
    id: ids.projectId,
    course_id: ids.courseId,
    capability: "Build an ε–δ checker",
    status: "open",
    opened_at: NOW,
    closed_at: null,
    project_path: "Math/Projects/checker.md",
    template: null,
  });
  await insert(db, "sessions", {
    id: ids.sessionId,
    course_id: ids.courseId,
    project_id: ids.projectId,
    date: TODAY,
    objective: "Limits",
    minutes: 30,
    did_retrieval: true,
    writeup_path: "Math/Sessions/2026-05-27.md",
  });
  await insert(db, "cards", {
    id: ids.cardId,
    course_id: ids.courseId,
    project_id: ids.projectId,
    note_path: "Math/Notes/limit.md",
    front: "Define a limit",
    back: "∀ε ∃δ …",
    fsrs_state: { stability: 1, difficulty: 5 },
    due_at: NOW,
    last_reviewed: null,
    created_at: NOW,
  });
  await insert(db, "reviews", {
    id: ids.reviewId,
    card_id: ids.cardId,
    rating: "good",
    confidence: 3,
    reviewed_at: NOW,
    elapsed_ms: 4200,
  });
  await insert(db, "streaks", { date: ids.streakDate, minutes: 30, domains_touched: [ids.domainId] });
  await insert(db, "pretest_responses", {
    id: ids.pretestId,
    session_id: ids.sessionId,
    question: "What is a limit?",
    user_response: "not sure yet",
    revealed_after: true,
  });
  await insert(db, "resources", {
    id: ids.resourceId,
    title: "Principles of Mathematical Analysis",
    kind: "book",
    file_path: null,
    url: null,
    metadata: { author: "Rudin" },
    ingested_at: null,
    added_at: NOW,
  });
  await insert(db, "course_resources", {
    course_id: ids.courseId,
    resource_id: ids.resourceId,
    role: "primary",
  });
  await insert(db, "session_assignments", {
    id: ids.assignmentId,
    session_id: ids.sessionId,
    resource_id: ids.resourceId,
    locator: "pp. 1-20",
    assignment_kind: "read",
  });
  await insert(db, "card_resources", {
    card_id: ids.cardId,
    resource_id: ids.resourceId,
    locator: "p. 5",
  });
  await insert(db, "project_milestones", {
    project_id: ids.projectId,
    milestone_id: ids.milestoneId,
  });
  await insert(db, "project_resources", {
    project_id: ids.projectId,
    resource_id: ids.resourceId,
    locator: null,
  });
  await insert(db, "vault_writes", { file_path: ids.vaultPath, app_mtime: NOW, app_hash: "hash-v1" });

  return ids;
}
