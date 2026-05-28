import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { useDb } from "../../app/providers/DbProvider";
import { useVault } from "../../app/providers/VaultProvider";
import {
  listCourses,
  listDomains,
  listCampaignsByDomain,
  createCampaign,
  createCourse,
  createMilestone,
  type Course,
  type Domain,
  type Campaign,
  type MilestoneStatus,
} from "../../db";
import { materializeCourse, type MaterializeResult } from "./sync/materialize";
import type { MocModel } from "./moc";

/**
 * Courses screen state. Loads Domains + Courses, and drives the create flow: persist the Course
 * + Milestones (+ optional inline Campaign) to SQLite, then materialize the MOC into the vault.
 * Used only inside a vault-`ready` subtree (it calls `useVault()`), so the screen gates first.
 */

export type CampaignChoice =
  | { kind: "none" }
  | { kind: "existing"; id: string }
  | { kind: "new"; title: string };

export interface MilestoneInput {
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

export type CreateResult =
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
  const [domains, setDomains] = useState<Domain[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [d, c] = await Promise.all([listDomains(db), listCourses(db)]);
    setDomains(d);
    setCourses(c);
  }, [db]);

  useEffect(() => {
    let active = true;
    Promise.all([listDomains(db), listCourses(db)])
      .then(([d, c]) => {
        if (!active) return;
        setDomains(d);
        setCourses(c);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [db]);

  const campaignsFor = useCallback(
    (domainId: string): Promise<Campaign[]> => listCampaignsByDomain(db, domainId),
    [db],
  );

  const create = useCallback(
    async (input: CourseInput): Promise<CreateResult> => {
      const parsed = titleSchema.safeParse(input.title);
      if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
      if (!input.domainId) return { ok: false, error: "Choose a domain" };

      try {
        let campaignId: string | null = null;
        let campaignTitle: string | null = null;
        if (input.campaign.kind === "existing") {
          campaignId = input.campaign.id;
          const list = await listCampaignsByDomain(db, input.domainId);
          campaignTitle = list.find((c) => c.id === campaignId)?.title ?? null;
        } else if (input.campaign.kind === "new" && input.campaign.title.trim()) {
          const created = await createCampaign(db, {
            title: input.campaign.title.trim(),
            domainId: input.domainId,
          });
          campaignId = created.id;
          campaignTitle = created.title;
        }

        const course = await createCourse(db, {
          title: parsed.data,
          domainId: input.domainId,
          campaignId,
        });

        const milestones: MocModel["milestones"] = [];
        let order = 0;
        for (const m of input.milestones) {
          const capability = m.capability.trim();
          if (!capability) continue;
          const saved = await createMilestone(db, {
            courseId: course.id,
            capability,
            orderIndex: order,
            status: m.status,
          });
          milestones.push({ id: saved.id, capability: saved.capability, status: saved.status });
          order += 1;
        }

        const domainName = domains.find((d) => d.id === input.domainId)?.name ?? "";
        const model: MocModel = {
          id: course.id,
          title: parsed.data,
          domain: domainName,
          campaign: campaignTitle,
          capability: input.capability.trim(),
          milestones,
        };

        const materialize = await materializeCourse({ vault, db }, model);
        await refresh();
        return { ok: true, materialize };
      } catch (e) {
        return { ok: false, error: msgOf(e, "Failed to create the course") };
      }
    },
    [db, vault, domains, refresh],
  );

  const groups: DomainGroup[] = domains.map((domain) => ({
    domain,
    courses: courses.filter((c) => c.domain_id === domain.id),
  }));

  return { loading, domains, courses, groups, campaignsFor, create, refresh };
}
