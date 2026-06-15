/**
 * Materializer — converts a CourseBlueprint into vault MOC + SQLite rows.
 *
 * The materializer is the bridge between the Blueprint IR and the existing
 * course synchronization layer. It:
 * 1. Resolves or creates the domain (findOrCreateDomainByName)
 * 2. Creates the course row (createCourse)
 * 3. Creates milestone rows (createMilestone)
 * 4. Creates suggested cards with blank backs (createCard)
 * 5. Renders and writes the MOC via the existing materializeCourse
 *
 * See FR-011 through FR-014: vault write + SQLite inserts + suggested cards + idempotent.
 */

import type { SqlExecutor } from "../../../db";
import type { Vault } from "../../../vault";
import { findOrCreateDomainByName, createCourse, createMilestone, createCard } from "../../../db";
import { materializeCourse } from "../../../features/courses/sync/materialize";
import type { MocModel } from "../../../features/courses/moc";
import type { CourseBlueprint } from "./types";

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
 * 5. Build a MocModel and write/merge the MOC document
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

    // 3. Create milestones (in order)
    const mocMilestones: MocModel["milestones"] = [];
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
    }

    // 4. Create suggested cards (front only, blank back)
    let cardCount = 0;
    for (const cs of blueprint.cardSeeds) {
      await createCard(db, {
        courseId: course.id,
        front: cs.front,
        back: "", // Scaffold-only: blank backs (FR-015)
      });
      cardCount++;
    }

    // 5. Build MocModel and write MOC
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
    };
  } catch (e) {
    if (e instanceof MaterializationError) throw e;
    throw new MaterializationError(
      `Materialization failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      e,
    );
  }
}
