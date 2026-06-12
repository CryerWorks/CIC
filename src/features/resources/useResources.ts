import { useCallback, useEffect, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import { useVault, useActiveVaultId } from "../../app/providers/VaultProvider";
import {
  listResources,
  registerResource,
  updateResource,
  deleteResource,
  linkResourceToCourse,
  unlinkResourceFromCourse,
  listResourceCourseLinks,
  listCourses,
  listDomains,
  type Resource,
  type Course,
  type Domain,
  type ResourceKind,
  type ResourceMetadata,
} from "../../db";
import { useSourceFiles } from "./SourceFilesProvider";
import { isFileKind, basename } from "./sourceFiles";

export interface ResourceInput {
  title: string;
  kind: ResourceKind;
  filePath?: string | null;
  /** A newly-picked source file (absolute path) to internalize on save; undefined = no change. */
  pickedFilePath?: string | null;
  url?: string | null;
  metadata?: ResourceMetadata;
  /** Optional home Domain (FR-012); null = unfiled. */
  domainId?: string | null;
  /** Courses this Resource should be linked to (role "reference"). The full desired set — `edit`
   *  diffs it against the current links to add/remove. */
  linkCourseIds?: string[];
}

/**
 * Resource-registry screen state (Feature 010, US4). Loads the active vault's Resources, its
 * Courses (for the link control), and the current Course↔Resource links, keyed on the vault so a
 * switch re-scopes (FR-020). Register / edit / delete + manage Course links (on create *and* edit).
 * Used only under a ready vault.
 */
export function useResources() {
  const db = useDb();
  useVault();
  const vaultId = useActiveVaultId();
  const sourceFiles = useSourceFiles();
  const [resources, setResources] = useState<Resource[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [links, setLinks] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!vaultId) return;
    const [r, c, dom, l] = await Promise.all([
      listResources(db, vaultId),
      listCourses(db, vaultId),
      listDomains(db, vaultId),
      listResourceCourseLinks(db, vaultId),
    ]);
    setResources(r);
    setCourses(c);
    setDomains(dom);
    const map = new Map<string, string[]>();
    for (const { resource_id, course_id } of l) {
      map.set(resource_id, [...(map.get(resource_id) ?? []), course_id]);
    }
    setLinks(map);
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

  // If a file-kind Resource has a freshly-picked file, internalize it and record the stored path.
  // Rejection propagates so the form surfaces it; `file_path` is only set on a successful copy
  // (all-or-nothing — FR-011/SC-002).
  const internalizePicked = useCallback(
    async (resourceId: string, input: ResourceInput) => {
      if (!isFileKind(input.kind) || !input.pickedFilePath) return;
      const internal = await sourceFiles.importFile({
        sourcePath: input.pickedFilePath,
        resourceId,
        filename: basename(input.pickedFilePath),
      });
      await updateResource(db, resourceId, { filePath: internal });
    },
    [db, sourceFiles],
  );

  const add = useCallback(
    async (input: ResourceInput) => {
      if (!vaultId) return;
      const r = await registerResource(db, vaultId, {
        title: input.title,
        kind: input.kind,
        filePath: input.filePath ?? null,
        url: input.url ?? null,
        metadata: input.metadata,
        domainId: input.domainId ?? null,
      });
      await internalizePicked(r.id, input);
      for (const courseId of input.linkCourseIds ?? []) {
        await linkResourceToCourse(db, { courseId, resourceId: r.id, role: "reference" });
      }
      await load();
    },
    [db, vaultId, load, internalizePicked],
  );

  const edit = useCallback(
    async (id: string, input: ResourceInput) => {
      await updateResource(db, id, {
        title: input.title,
        kind: input.kind,
        filePath: input.filePath ?? null,
        url: input.url ?? null,
        metadata: input.metadata,
        domainId: input.domainId ?? null,
      });
      await internalizePicked(id, input);
      // Reconcile Course links: link the newly-checked, unlink the newly-unchecked.
      const current = links.get(id) ?? [];
      const desired = input.linkCourseIds ?? [];
      for (const courseId of desired.filter((c) => !current.includes(c))) {
        await linkResourceToCourse(db, { courseId, resourceId: id, role: "reference" });
      }
      for (const courseId of current.filter((c) => !desired.includes(c))) {
        await unlinkResourceFromCourse(db, id, courseId);
      }
      await load();
    },
    [db, links, load, internalizePicked],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteResource(db, id);
      // Reclaim the internalized file copy (best-effort — a failure here must not block the
      // already-completed row delete; FR-009).
      try {
        await sourceFiles.removeFiles(id);
      } catch {
        /* ignore: the DB row is gone; an orphaned file is recoverable, a blocked delete is not */
      }
      await load();
    },
    [db, load, sourceFiles],
  );

  return { loading, resources, courses, domains, links, add, edit, remove, reload: load };
}
