import { Button } from "../../components/ui";
import { MILESTONE_STATUS, type MilestoneStatus } from "../../db";
import type { MilestoneInput } from "./useCourses";

interface Props {
  value: MilestoneInput[];
  onChange: (next: MilestoneInput[]) => void;
}

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  todo: "To do",
  "in-progress": "In progress",
  done: "Done",
};

const inputCx =
  "rounded-sm border border-line-bright bg-surface-sunken px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/** Add / edit / remove the ordered Milestones of a Course (order = list position). Reorder is a
 *  later increment (US2). Controlled — owns no state. */
export function MilestonesEditor({ value, onChange }: Props) {
  const patch = (i: number, p: Partial<MilestoneInput>) =>
    onChange(value.map((m, idx) => (idx === i ? { ...m, ...p } : m)));
  const add = () => onChange([...value, { capability: "", status: "todo" }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-text">Milestones</legend>
      {value.length === 0 && (
        <p className="text-sm text-text-dim">No milestones yet — add the capabilities this Course proves.</p>
      )}
      {value.map((m, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            aria-label={`Milestone ${i + 1} capability`}
            value={m.capability}
            onChange={(e) => patch(i, { capability: e.target.value })}
            placeholder="Be able to…"
            className={`flex-1 ${inputCx}`}
          />
          <select
            aria-label={`Milestone ${i + 1} status`}
            value={m.status}
            onChange={(e) => patch(i, { status: e.target.value as MilestoneStatus })}
            className={inputCx}
          >
            {MILESTONE_STATUS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => move(i, -1)}
            disabled={i === 0}
            aria-label={`Move milestone ${i + 1} up`}
          >
            ↑
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => move(i, 1)}
            disabled={i === value.length - 1}
            aria-label={`Move milestone ${i + 1} down`}
          >
            ↓
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => remove(i)}
            aria-label={`Remove milestone ${i + 1}`}
          >
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" size="sm" variant="secondary" onClick={add}>
          Add milestone
        </Button>
      </div>
    </fieldset>
  );
}
