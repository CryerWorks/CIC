import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useDb } from "../../app/providers/DbProvider";
import { useVault, useActiveVaultId } from "../../app/providers/VaultProvider";
import {
  listCourses,
  listDomains,
  listCampaignsByDomain,
  createCampaign,
  createCourse,
  updateCourse,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  getCourse,
  listMilestonesByCourse,
  type Course,
  type Domain,
  type Campaign,
  type MilestoneStatus,
} from "../../db";
import { materializeCourse, reapplyCourse, type MaterializeResult } from "./sync/materialize";
import { rescanCourses, type RescanReport } from "./sync/rescan";
import {
  removeCourse,
  type DeleteCourseMode,
  type RemoveCourseResult,
  type RemoveCourseOptions,
} from "./sync/delete";
import { parseMocBody, MocParseError, type MocModel } from "./moc";

/**
 * Courses screen state. Drives create + edit: persist the Course / Milestones / Campaign to
 * SQLite, then materialize the MOC into the vault. On a never-clobber drift conflict it stashes
 * the attempted model so the UI can offer "Reload & reapply" (`resolveDrift`). Used only inside a
 * vault-`ready` subtree (it calls `useVault()`).
 */

export type CampaignChoice =
  | { kind: "none" }
  | { kind: "existing"; id: string }
  | { kind: "new"; title: string };

export interface MilestoneInput {
  /** Present → an existing milestone (update); absent → a new one (insert). */
  id?: string;
  capability: string;
  status: MilestoneStatus;
}

export interface CourseInput {
  title: string;
  domainId: string;
  campaign: CampaignChoice;
  capability: string;
  milestones: MilestoneInput[];
}

/** Pre-fill shape for the edit form (capability is read back from the MOC). */
export interface CourseEditData {
  title: string;
  domainId: string;
  campaign: CampaignChoice;
  capability: string;
  milestones: MilestoneInput[];
}

export type SaveResult =
  | { ok: true; materialize: MaterializeResult }
  | { ok: false; error: string };

export interface DomainGroup {
  domain: Domain;
  courses: Course[];
}

const titleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(120, "Title is too long (120 characters max)");

const msgOf = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function useCourses() {
  const db = useDb();
  const vault = useVault();
  // The screen is vault-gated (it calls useVault()), so a vault is always ready here and the id is
  // non-null; keyed on it so a vault switch re-scopes the list (FR-007).
  const vaultId = useActiveVaultId();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingReapply, setPendingReapply] = useState<MocModel | null>(null);

  const refresh = useCallback(async () => {
    if (!vaultId) return;
    const [d, c] = await Promise.all([listDomains(db, vaultId), listCourses(db, vaultId)]);
    setDomains(d);
    setCourses(c);
  }, [db, vaultId]);

  useEffect(() => {
    if (!vaultId) return;
    let active = true;
    Promise.all([listDomains(db, vaultId), listCourses(db, vaultId)])
      .then(([d, c]) => {
        if (!active) return;
        setDomains(d);
        setCourses(c);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [db, vaultId]);

  const campaignsFor = useCallback(
    (domainId: string): Promise<Campaign[]> => listCampaignsByDomain(db, domainId),
    [db],
  );

  const resolveCampaign = useCallback(
    async (domainId: string, choice: CampaignChoice): Promise<{ id: string | null; title: string | null }> => {
      if (choice.kind === "existing") {
        const list = await listCampaignsByDomain(db, domainId);
        return { id: choice.id, title: list.find((c) => c.id === choice.id)?.title ?? null };
      }
      if (choice.kind === "new" && choice.title.trim()) {
        const created = await createCampaign(db, { title: choice.title.trim(), domainId });
        return { id: created.id, title: created.title };
      }
      return { id: null, title: null };
    },
    [db],
  );

  /** Materialize, stash the model on drift, refresh. */
  const finish = useCallback(
    async (model: MocModel): Promise<MaterializeResult> => {
      const result = await materializeCourse({ vault, db }, model);
      setPendingReapply(result.status === "conflict" ? model : null);
      await refresh();
      return result;
    },
    [vault, db, refresh],
  );

  const create = useCallback(
    async (input: CourseInput): Promise<SaveResult> => {
      const parsed = titleSchema.safeParse(input.title);
      if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
      if (!input.domainId) return { ok: false, error: "Choose a domain" };
      try {
        const campaign = await resolveCampaign(input.domainId, input.campaign);
        const course = await createCourse(db, {
          title: parsed.data,
          domainId: input.domainId,
          campaignId: campaign.id,
        });
        const milestones = await insertMilestones(course.id, input.milestones);
        const domainName = domains.find((d) => d.id === input.domainId)?.name ?? "";
        const model: MocModel = {
          id: course.id,
          title: parsed.data,
          domain: domainName,
          campaign: campaign.title,
          capability: input.capability.trim(),
          milestones,
        };
        return { ok: true, materialize: await finish(model) };
      } catch (e) {
        return { ok: false, error: msgOf(e, "Failed to create the course") };
      }
    },
    [db, domains, resolveCampaign, finish],
  );

  // Insert milestones (create path) in order; returns the model milestone list with real ids.
  const insertMilestones = useCallback(
    async (courseId: string, inputs: MilestoneInput[]): Promise<MocModel["milestones"]> => {
      const out: MocModel["milestones"] = [];
      let order = 0;
      for (const m of inputs) {
        const capability = m.capability.trim();
        if (!capability) continue;
        const saved = await createMilestone(db, { courseId, capability, orderIndex: order, status: m.status });
        out.push({ id: saved.id, capability: saved.capability, status: saved.status });
        order += 1;
      }
      return out;
    },
    [db],
  );

  const loadCourseForEdit = useCallback(
    async (courseId: string): Promise<CourseEditData | null> => {
      const course = await getCourse(db, courseId);
      if (!course) return null;
      const ms = await listMilestonesByCourse(db, courseId);

      let capability = "";
      if (course.moc_path) {
        try {
          const note = await vault.reader.readNote(course.moc_path);
          const parsed = parseMocBody(note.body);
          if (!(parsed instanceof MocParseError)) capability = parsed.capability;
        } catch {
          // MOC missing/unreadable → start from an empty capability
        }
      }

      return {
        title: course.title,
        domainId: course.domain_id,
        campaign: course.campaign_id ? { kind: "existing", id: course.campaign_id } : { kind: "none" },
        capability,
        milestones: ms.map((m) => ({ id: m.id, capability: m.capability, status: m.status })),
      };
    },
    [db, vault],
  );

  const edit = useCallback(
    async (courseId: string, input: CourseInput): Promise<SaveResult> => {
      const parsed = titleSchema.safeParse(input.title);
      if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
      try {
        const existing = await getCourse(db, courseId);
        if (!existing) return { ok: false, error: "Course not found" };

        const campaign = await resolveCampaign(existing.domain_id, input.campaign);
        await updateCourse(db, courseId, { title: parsed.data, campaignId: campaign.id });

        // Reconcile milestones: keep ids still present (non-empty), delete the rest, in order.
        const keptIds = new Set(
          input.milestones.filter((m) => m.id && m.capability.trim()).map((m) => m.id as string),
        );
        for (const c of await listMilestonesByCourse(db, courseId)) {
          if (!keptIds.has(c.id)) await deleteMilestone(db, c.id);
        }
        const milestones: MocModel["milestones"] = [];
        let order = 0;
        for (const m of input.milestones) {
          const capability = m.capability.trim();
          if (!capability) continue;
          const saved = m.id
            ? await updateMilestone(db, m.id, { capability, status: m.status, orderIndex: order })
            : await createMilestone(db, { courseId, capability, orderIndex: order, status: m.status });
          milestones.push({ id: saved.id, capability: saved.capability, status: saved.status });
          order += 1;
        }

        const domainName = domains.find((d) => d.id === existing.domain_id)?.name ?? "";
        const model: MocModel = {
          id: courseId,
          title: parsed.data,
          domain: domainName,
          campaign: campaign.title,
          capability: input.capability.trim(),
          milestones,
        };
        return { ok: true, materialize: await finish(model) };
      } catch (e) {
        return { ok: false, error: msgOf(e, "Failed to update the course") };
      }
    },
    [db, domains, resolveCampaign, finish],
  );

  const resolveDrift = useCallback(async (): Promise<MaterializeResult | null> => {
    if (!pendingReapply) return null;
    const result = await reapplyCourse({ vault, db }, pendingReapply);
    setPendingReapply(null);
    await refresh();
    return result;
  }, [pendingReapply, vault, db, refresh]);

  const rescan = useCallback(async (): Promise<RescanReport> => {
    if (!vaultId) return { results: [], imported: 0, updated: 0, skipped: 0 };
    const report = await rescanCourses({ vault, db }, vaultId);
    await refresh();
    return report;
  }, [vault, db, vaultId, refresh]);

  const remove = useCallback(
    async (
      courseId: string,
      mode: DeleteCourseMode,
      opts: RemoveCourseOptions = {},
    ): Promise<RemoveCourseResult> => {
      const result = await removeCourse({ vault, db }, courseId, mode, opts);
      if (result.status === "removed") await refresh();
      return result;
    },
    [vault, db, refresh],
  );

  // Read-back on app open: reconcile the vault into SQLite once when the screen first mounts
  // (the vault is already `ready` here). A manual `rescan()` covers later changes.
  const didBoot = useRef(false);
  useEffect(() => {
    if (didBoot.current || !vaultId) return;
    didBoot.current = true;
    rescanCourses({ vault, db }, vaultId)
      .then(() => refresh())
      .catch(() => {
        /* a bad file is reported per-file; a total failure simply leaves the list as-is */
      });
  }, [vault, db, vaultId, refresh]);

  const groups: DomainGroup[] = domains.map((domain) => ({
    domain,
    courses: courses.filter((c) => c.domain_id === domain.id),
  }));

  return {
    loading,
    domains,
    courses,
    groups,
    campaignsFor,
    create,
    edit,
    remove,
    loadCourseForEdit,
    resolveDrift,
    rescan,
    hasPendingReapply: pendingReapply !== null,
  };
}
