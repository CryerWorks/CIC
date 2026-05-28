import { Panel } from "../../components/ui";
import type { DomainAllocation as DomainAllocationData } from "../../db";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Per-Domain allocation: each Domain in its own color with course/milestone counts and a bar
 *  proportional to its course count. Domains with zero Courses are still shown (FR-003). */
export function DomainAllocation({ allocation }: { allocation: DomainAllocationData[] }) {
  if (allocation.length === 0) return null;
  const maxCourses = Math.max(1, ...allocation.map((d) => d.courseCount));

  return (
    <Panel title="Allocation">
      <ul className="flex flex-col gap-3">
        {allocation.map((d) => (
          <li key={d.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-text">
                <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name}
              </span>
              <span className="text-text-dim">
                {plural(d.courseCount, "course")} · {plural(d.milestoneCount, "milestone")}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-surface-sunken">
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${(d.courseCount / maxCourses) * 100}%`, backgroundColor: d.color }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
