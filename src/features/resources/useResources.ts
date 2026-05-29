import { useCallback, useEffect, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import { useVault, useActiveVaultId } from "../../app/providers/VaultProvider";
import {
  listResources,
  registerResource,
  updateResource,
  deleteResource,
  linkResourceToCourse,
  listCourses,
  type Resource,
  type Course,
  type ResourceKind,
  type ResourceMetadata,
} from "../../db";

export interface ResourceInput {
  title: string;
  kind: ResourceKind;
  filePath?: string | null;
  url?: string | null;
  metadata?: ResourceMetadata;
  /** Optional: link the new Resource to this Course (role "reference"). */
  linkCourseId?: string | null;
}

/**
 * Resource-registry screen state (Feature 010, US4). Loads the active vault's Resources + its
 * Courses (for the link dropdown), keyed on the vault so a switch re-scopes (FR-020). Register /
 * edit / delete + link-to-Course. Used only under a ready vault.
 */
export function useResources() {
  const db = useDb();
  useVault();
  const vaultId = useActiveVaultId();
  const [resources, setResources] = useState<Resource[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!vaultId) return;
    const [r, c] = await Promise.all([listResources(db, vaultId), listCourses(db, vaultId)]);
    setResources(r);
    setCourses(c);
  }, [db, vaultId]);

  useEffect(() => {
    if (!vaultId) return;
    let active = true;
    setLoading(true);
    load().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load, vaultId]);

  const add = useCallback(
    async (input: ResourceInput) => {
      if (!vaultId) return;
      const r = await registerResource(db, vaultId, {
        title: input.title,
        kind: input.kind,
        filePath: input.filePath ?? null,
        url: input.url ?? null,
        metadata: input.metadata,
      });
      if (input.linkCourseId) {
        await linkResourceToCourse(db, { courseId: input.linkCourseId, resourceId: r.id, role: "reference" });
      }
      await load();
    },
    [db, vaultId, load],
  );

  const edit = useCallback(
    async (id: string, input: ResourceInput) => {
      await updateResource(db, id, {
        title: input.title,
        kind: input.kind,
        filePath: input.filePath ?? null,
        url: input.url ?? null,
        metadata: input.metadata,
      });
      await load();
    },
    [db, load],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteResource(db, id);
      await load();
    },
    [db, load],
  );

  return { loading, resources, courses, add, edit, remove };
}
