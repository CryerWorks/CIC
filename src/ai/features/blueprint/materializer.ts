/**
 * Materializer — converts a CourseBlueprint into vault MOC + SQLite rows.
 *
 * The materializer is the bridge between the Blueprint IR and the existing
 * course synchronization layer. It:
 * 1. Resolves or creates the domain (findOrCreateDomainByName)
 * 2. Creates the course row (createCourse)
 * 3. Creates milestone rows (createMilestone)
 * 4. Creates suggested memory cards with Q+A pairs (createCard)
 * 5. (V2) Creates sessions with per-source cards and projects per milestone
 * 6. Renders and writes the MOC via the existing materializeCourse
 *
 * See FR-011 through FR-014: vault write + SQLite inserts + suggested cards + idempotent.
 */

import type { SqlExecutor } from "../../../db";
import type { Vault } from "../../../vault";
import { findOrCreateDomainByName, createCourse, createMilestone, createCard, insert } from "../../../db";
import { materializeCourse } from "../../../features/courses/sync/materialize";
import type { MocModel } from "../../../features/courses/moc";
import type { CourseBlueprint, MilestoneSeed } from "./types";

export interface MaterializerDeps {
  db: SqlExecutor;
  vault: Vault;
  vaultId: string;
}

export interface MaterializeCourseResult {
  status: "materialized";
  courseId: string;
  mocPath: string;
  milestoneCount: number;
  cardCount: number;
  sessionCount: number;
  projectCount: number;
}

export class MaterializationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "MaterializationError";
  }
}

/**
 * Materialize a CourseBlueprint into the vault + SQLite.
 *
 * Steps:
 * 1. Resolve the domain (create if needed)
 * 2. Create the course row
 * 3. Create milestone rows in order
 * 4. Create suggested card rows (front only, blank back)
 * 5. Create sessions with per-source cards and projects per milestone (V2)
 * 6. Build a MocModel and write/merge the MOC document
 *
 * This is NOT idempotent per-se — each call creates new rows. The caller
 * should use the review UI to confirm before materializing (FR-016).
 * An idempotent update path is deferred (FR-014 covers re-materializing
 * which is handled by the existing course update flow).
 */
export async function materializeBlueprint(
  deps: MaterializerDeps,
  blueprint: CourseBlueprint,
): Promise<MaterializeCourseResult> {
  const { db, vault, vaultId } = deps;

  try {
    // 1. Resolve domain
    const domain = await findOrCreateDomainByName(db, vaultId, blueprint.domain);

    // 2. Create the course
    const course = await createCourse(db, {
      title: blueprint.title,
      domainId: domain.id,
    });

    // 3. Create milestones (in order) — collect IDs for session/project linking
    const mocMilestones: MocModel["milestones"] = [];
    let cardCount = 0;
    let sessionCount = 0;
    let projectCount = 0;

    for (const ms of blueprint.milestones) {
      const saved = await createMilestone(db, {
        courseId: course.id,
        capability: ms.capability,
        orderIndex: ms.order,
        status: "todo",
      });
      mocMilestones.push({
        id: saved.id,
        capability: saved.capability,
        status: saved.status,
      });

      // 4a. Create sessions for this milestone (V2)
      const { sessionIds, sessionCardCount } = await materializeSessions(db, ms, course.id, saved.id);
      sessionCount += sessionIds.length;
      cardCount += sessionCardCount;

      // 4b. Create projects for this milestone (V2)
      const projectIds = await materializeProjects(db, ms, course.id, saved.id, sessionIds);
      projectCount += projectIds.length;
    }

    // 5. Create suggested cards (memory Q+A pairs)
    for (const cs of blueprint.cardSeeds) {
      await createCard(db, {
        courseId: course.id,
        front: cs.front,
        back: cs.back,
      });
      cardCount++;
    }

    // 6. Build MocModel and write MOC
    // Use the capability from the first milestone as the overall capability statement
    const capability = blueprint.milestones.length > 0
      ? blueprint.milestones[0].capability
      : "";

    const mocModel: MocModel = {
      id: course.id,
      title: blueprint.title,
      domain: blueprint.domain,
      campaign: null, // Campaigns deferred in v1
      capability,
      milestones: mocMilestones,
    };

    const mocResult = await materializeCourse({ vault, db }, mocModel);

    if (mocResult.status === "conflict") {
      throw new MaterializationError(
        `MOC conflict: ${mocResult.reason} — the vault file may have been edited externally. ` +
          "Use 'Reload & Reapply' to resolve.",
      );
    }

    return {
      status: "materialized",
      courseId: course.id,
      mocPath: mocResult.mocPath,
      milestoneCount: mocMilestones.length,
      cardCount,
      sessionCount,
      projectCount,
    };
  } catch (e) {
    if (e instanceof MaterializationError) throw e;
    throw new MaterializationError(
      `Materialization failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      e,
    );
  }
}

// ────────────────────────── V2 Helpers ──────────────────────────

/**
 * Materialize all sessions for a milestone. Creates session rows, inserts
 * session_sources, and creates per-source cards. Returns the created session IDs
 * in order (index 0 = first session) and the count of per-source cards created.
 */
async function materializeSessions(
  db: SqlExecutor,
  milestone: MilestoneSeed,
  courseId: string,
  milestoneId: string,
): Promise<{ sessionIds: string[]; sessionCardCount: number }> {
  const sessions = milestone.sessions ?? [];
  if (sessions.length === 0) return { sessionIds: [], sessionCardCount: 0 };

  const sessionIds: string[] = [];
  let sessionCardCount = 0;

  for (let si = 0; si < sessions.length; si++) {
    const session = sessions[si];
    const sessionId = crypto.randomUUID();

    // Create the session row (planned status)
    await insert(db, "sessions", {
      id: sessionId,
      course_id: courseId,
      project_id: null,
      date: new Date().toISOString(),
      objective: session.objective,
      minutes: 0,
      did_retrieval: 0,
      writeup_path: null,
      status: "planned",
      completed_at: null,
      milestone_id: milestoneId,
      order_index: si,
    });

    // Insert session_sources rows
    for (let sri = 0; sri < session.sources.length; sri++) {
      const source = session.sources[sri];
      await insert(db, "session_sources", {
        id: crypto.randomUUID(),
        session_id: sessionId,
        resource_id: null, // Not ingested yet — will be set in v2.1
        title: source.title,
        url: source.url,
        type: source.type,
        estimated_minutes: source.estimatedMinutes,
        ordering: sri,
      });
    }

    // Create per-source cards (card_resources linking deferred to v2.1)
    for (const sc of session.cards) {
      await createCard(db, {
        courseId,
        front: sc.front,
        back: sc.back,
      });
      sessionCardCount++;
    }

    sessionIds.push(sessionId);
  }

  return { sessionIds, sessionCardCount };
}

/**
 * Materialize all projects for a milestone. Creates project rows linked to the
 * milestone. Returns the created project IDs.
 */
async function materializeProjects(
  db: SqlExecutor,
  milestone: MilestoneSeed,
  courseId: string,
  milestoneId: string,
  _sessionIds: string[],
): Promise<string[]> {
  void _sessionIds; // Reserved for per-project session linking in v2.1
  const projects = milestone.projects ?? [];
  if (projects.length === 0) return [];

  const projectIds: string[] = [];

  for (const proj of projects) {
    const projectId = crypto.randomUUID();

    // Create the project row
    await insert(db, "projects", {
      id: projectId,
      course_id: courseId,
      title: proj.title,
      capability: proj.description, // Use description as the capability statement
      status: "open",
      opened_at: new Date().toISOString(),
      closed_at: null,
      project_path: null,
      template: null,
    });

    // Link to the milestone via project_milestones
    await insert(db, "project_milestones", {
      project_id: projectId,
      milestone_id: milestoneId,
    });

    projectIds.push(projectId);
  }

  return projectIds;
}
