import { useCallback, useEffect, useRef, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import { useVault, useActiveVaultId } from "../../app/providers/VaultProvider";
import {
  getCourse,
  listMilestonesByCourse,
  listResources,
  createProject,
  getProject,
  listCourseProjects,
  getProjectMilestoneIds,
  listProjectResources,
  setProjectMilestones,
  setProjectResources,
  setProjectTitleCapability,
  markProjectInProgress,
  closeProject,
  type Project,
  type Milestone,
  type Resource,
} from "../../db";
import type { ProjectDocModel } from "./doc";
import {
  materializeNewProject,
  updateProjectFrontmatter,
  closeProjectFile,
  reapplyProject,
  type MaterializeProjectResult,
} from "./sync/materialize";
import { rescanProjects } from "./sync/rescan";
import {
  removeProject,
  type DeleteProjectMode,
  type RemoveProjectResult,
  type RemoveProjectOptions,
} from "./sync/delete";

/**
 * Projects state for the Course-detail screen (Feature 015). Mirrors `useCourses`: persist to SQLite
 * then materialize the vault file; stash the attempted model on a never-clobber drift so the UI can
 * offer "Reload & reapply". Used only inside a vault-`ready` subtree. The body is learner-owned, so
 * edits/status changes only ever rewrite the frontmatter (close also appends the reflection).
 */

export interface ResourceRefInput {
  resourceId: string;
  locator: string | null;
}

export interface CreateProjectFormInput {
  title: string;
  capability: string;
  milestoneIds: string[];
  template: string | null;
  /** Woven into the new file's Problem section once (M1). */
  framing?: string;
  resources: ResourceRefInput[];
}

export interface ProjectEditData {
  title: string;
  capability: string;
  milestoneIds: string[];
  template: string | null;
  resources: ResourceRefInput[];
}

export interface CloseFormInput {
  outcome: "complete" | "abandoned";
  reflection: string;
  cards: { front: string; back: string }[];
  citeResourceIds: string[];
}

export type CreateResult =
  | { ok: true; materialize: MaterializeProjectResult }
  | { ok: false; error: string };

const msgOf = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

export function useProjects(courseId: string) {
  const db = useDb();
  const vault = useVault();
  const vaultId = useActiveVaultId() ?? "";
  const [courseTitle, setCourseTitle] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingReapply, setPendingReapply] = useState<ProjectDocModel | null>(null);

  const load = useCallback(async () => {
    const [course, ps, ms, rs] = await Promise.all([
      getCourse(db, courseId),
      listCourseProjects(db, courseId),
      listMilestonesByCourse(db, courseId),
      listResources(db, vaultId),
    ]);
    setCourseTitle(course?.title ?? "");
    setProjects(ps);
    setMilestones(ms);
    setResources(rs);
  }, [db, courseId, vaultId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  // Build the document model for a Project row + its current Milestone links.
  const modelFor = useCallback(
    (project: Project, milestoneIds: string[]): ProjectDocModel => ({
      id: project.id,
      courseId,
      title: project.title,
      courseTitle,
      capability: project.capability,
      status: project.status,
      milestoneIds,
      openedDate: day(project.opened_at) ?? new Date().toISOString().slice(0, 10),
      closedDate: day(project.closed_at),
      template: project.template,
    }),
    [courseId, courseTitle],
  );

  const finishWrite = useCallback(
    async (result: MaterializeProjectResult, model: ProjectDocModel): Promise<MaterializeProjectResult> => {
      setPendingReapply(result.status === "conflict" ? model : null);
      await load();
      return result;
    },
    [load],
  );

  const create = useCallback(
    async (input: CreateProjectFormInput): Promise<CreateResult> => {
      if (!input.title.trim()) return { ok: false, error: "A project title is required." };
      if (!input.capability.trim()) return { ok: false, error: "A capability statement is required." };
      if (input.milestoneIds.length === 0) return { ok: false, error: "Link at least one Milestone." };
      try {
        const project = await createProject(db, {
          courseId,
          title: input.title,
          capability: input.capability,
          milestoneIds: input.milestoneIds,
          template: input.template,
          resources: input.resources.map((r) => ({ resource_id: r.resourceId, locator: r.locator })),
        });
        const model = modelFor(project, input.milestoneIds);
        return { ok: true, materialize: await finishWrite(await materializeNewProject({ vault, db }, model, input.framing), model) };
      } catch (e) {
        return { ok: false, error: msgOf(e, "Failed to create the project") };
      }
    },
    [db, vault, courseId, modelFor, finishWrite],
  );

  const loadProjectForEdit = useCallback(
    async (projectId: string): Promise<ProjectEditData | null> => {
      const project = await getProject(db, projectId);
      if (!project) return null;
      const [milestoneIds, refs] = await Promise.all([
        getProjectMilestoneIds(db, projectId),
        listProjectResources(db, projectId),
      ]);
      return {
        title: project.title,
        capability: project.capability,
        milestoneIds,
        template: project.template,
        resources: refs.map((r) => ({ resourceId: r.resource_id, locator: r.locator })),
      };
    },
    [db],
  );

  const edit = useCallback(
    async (projectId: string, input: CreateProjectFormInput): Promise<CreateResult> => {
      if (!input.title.trim()) return { ok: false, error: "A project title is required." };
      if (!input.capability.trim()) return { ok: false, error: "A capability statement is required." };
      if (input.milestoneIds.length === 0) return { ok: false, error: "Link at least one Milestone." };
      try {
        await setProjectTitleCapability(db, projectId, {
          title: input.title,
          capability: input.capability,
          template: input.template,
        });
        await setProjectMilestones(db, projectId, input.milestoneIds);
        await setProjectResources(db, projectId, input.resources.map((r) => ({ resource_id: r.resourceId, locator: r.locator })));
        const project = await getProject(db, projectId);
        if (!project) return { ok: false, error: "Project not found" };
        const model = modelFor(project, input.milestoneIds);
        return { ok: true, materialize: await finishWrite(await updateProjectFrontmatter({ vault, db }, model), model) };
      } catch (e) {
        return { ok: false, error: msgOf(e, "Failed to update the project") };
      }
    },
    [db, vault, modelFor, finishWrite],
  );

  const markInProgress = useCallback(
    async (projectId: string): Promise<void> => {
      await markProjectInProgress(db, projectId);
      const project = await getProject(db, projectId);
      if (project) {
        const milestoneIds = await getProjectMilestoneIds(db, projectId);
        await finishWrite(await updateProjectFrontmatter({ vault, db }, modelFor(project, milestoneIds)), modelFor(project, milestoneIds));
      }
    },
    [db, vault, modelFor, finishWrite],
  );

  const close = useCallback(
    async (projectId: string, input: CloseFormInput): Promise<MaterializeProjectResult> => {
      const { project } = await closeProject(db, {
        projectId,
        outcome: input.outcome,
        cards: input.cards.filter((c) => c.front.trim()),
        citeResourceIds: input.citeResourceIds,
      });
      const milestoneIds = await getProjectMilestoneIds(db, projectId);
      const model = modelFor(project, milestoneIds);
      return finishWrite(await closeProjectFile({ vault, db }, model, input.reflection), model);
    },
    [db, vault, modelFor, finishWrite],
  );

  const remove = useCallback(
    async (projectId: string, mode: DeleteProjectMode, opts: RemoveProjectOptions = {}): Promise<RemoveProjectResult> => {
      const result = await removeProject({ vault, db }, projectId, mode, opts);
      if (result.status === "removed") await load();
      return result;
    },
    [db, vault, load],
  );

  const rescan = useCallback(async (): Promise<void> => {
    if (!vaultId) return;
    await rescanProjects({ vault, db }, vaultId);
    await load();
  }, [vault, db, vaultId, load]);

  const resolveDrift = useCallback(async (): Promise<MaterializeProjectResult | null> => {
    if (!pendingReapply) return null;
    const result = await reapplyProject({ vault, db }, pendingReapply);
    setPendingReapply(null);
    await load();
    return result;
  }, [pendingReapply, vault, db, load]);

  // Read-back on first mount: reconcile vault Projects into SQLite (the vault is ready here).
  const didBoot = useRef(false);
  useEffect(() => {
    if (didBoot.current || !vaultId) return;
    didBoot.current = true;
    rescanProjects({ vault, db }, vaultId)
      .then(() => load())
      .catch(() => {});
  }, [vault, db, vaultId, load]);

  return {
    loading,
    projects,
    milestones,
    resources,
    create,
    loadProjectForEdit,
    edit,
    markInProgress,
    close,
    remove,
    rescan,
    resolveDrift,
    hasPendingReapply: pendingReapply !== null,
    refresh: load,
  };
}
