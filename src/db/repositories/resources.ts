import type { SqlExecutor } from "../executor";
import { ResourceSchema, type Resource } from "../models/resource";
import type { ResourceKind, ResourceRole } from "../models/enums";
import { metadataSchemaFor, type ResourceMetadata } from "../models/resourceMetadata";
import { insert, selectParsed, update, upsert } from "./query";

/**
 * Resource registry (Feature 010, US4). Resources are vault-scoped via `resources.vault_id`
 * (migration m0004) — a Resource is a parallel entity, not under the Domain cascade, so it carries
 * its own vault link (research R6). Per-kind `metadata` is validated against the kind's schema
 * (R13). The registry is the registration half of the broader Resources feature; assignments +
 * AI ingestion come later.
 */

export async function getResource(db: SqlExecutor, id: string): Promise<Resource | null> {
  const rows = await selectParsed(db, ResourceSchema, "SELECT * FROM resources WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function registerResource(
  db: SqlExecutor,
  vaultId: string,
  input: {
    title: string;
    kind: ResourceKind;
    filePath?: string | null;
    url?: string | null;
    metadata?: ResourceMetadata;
  },
): Promise<Resource> {
  const metadata = metadataSchemaFor(input.kind).parse(input.metadata ?? {});
  const id = crypto.randomUUID();
  await insert(db, "resources", {
    id,
    vault_id: vaultId,
    title: input.title,
    kind: input.kind,
    file_path: input.filePath ?? null,
    url: input.url ?? null,
    metadata,
    ingested_at: null,
    added_at: new Date().toISOString(),
  });
  const created = await getResource(db, id);
  if (!created) throw new Error("Resource insert failed");
  return created;
}

/** Claim any pre-feature, unscoped Resources for the first vault attached (mirrors 009 adoption;
 *  a no-op in practice — Resources are introduced by this feature). */
export async function attachResources(db: SqlExecutor, vaultId: string): Promise<void> {
  await db.execute("UPDATE resources SET vault_id = ? WHERE vault_id IS NULL", [vaultId]);
}

export async function listResources(db: SqlExecutor, vaultId: string): Promise<Resource[]> {
  return selectParsed(
    db,
    ResourceSchema,
    "SELECT * FROM resources WHERE vault_id = ? ORDER BY title",
    [vaultId],
  );
}

export async function updateResource(
  db: SqlExecutor,
  id: string,
  patch: {
    title?: string;
    kind?: ResourceKind;
    filePath?: string | null;
    url?: string | null;
    metadata?: ResourceMetadata;
  },
): Promise<Resource> {
  const existing = await getResource(db, id);
  if (!existing) throw new Error(`Resource ${id} not found`);
  const set: Record<string, unknown> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.filePath !== undefined) set.file_path = patch.filePath;
  if (patch.url !== undefined) set.url = patch.url;
  if (patch.metadata !== undefined) {
    set.metadata = metadataSchemaFor(patch.kind ?? existing.kind).parse(patch.metadata);
  }
  if (Object.keys(set).length > 0) await update(db, "resources", set, { id });
  const updated = await getResource(db, id);
  if (!updated) throw new Error(`Resource ${id} vanished`);
  return updated;
}

/** Delete a Resource. `ON DELETE CASCADE` removes its course/card/session/project links — cards
 *  themselves are untouched (only the citation link rows go). */
export async function deleteResource(db: SqlExecutor, id: string): Promise<void> {
  await db.execute("DELETE FROM resources WHERE id = ?", [id]);
}

export async function linkResourceToCourse(
  db: SqlExecutor,
  input: { courseId: string; resourceId: string; role: ResourceRole },
): Promise<void> {
  await upsert(
    db,
    "course_resources",
    { course_id: input.courseId, resource_id: input.resourceId, role: input.role },
    ["course_id", "resource_id"],
  );
}

export async function unlinkResourceFromCourse(
  db: SqlExecutor,
  courseId: string,
  resourceId: string,
): Promise<void> {
  await db.execute("DELETE FROM course_resources WHERE course_id = ? AND resource_id = ?", [
    courseId,
    resourceId,
  ]);
}

export async function listCourseResources(db: SqlExecutor, courseId: string): Promise<Resource[]> {
  return selectParsed(
    db,
    ResourceSchema,
    `SELECT r.* FROM resources r
     JOIN course_resources cr ON cr.resource_id = r.id
     WHERE cr.course_id = ?
     ORDER BY r.title`,
    [courseId],
  );
}
