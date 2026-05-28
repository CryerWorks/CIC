import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui";
import type { Domain, Campaign } from "../../db";
import { MilestonesEditor } from "./MilestonesEditor";
import type { CourseInput, MilestoneInput, CampaignChoice } from "./useCourses";

interface Props {
  domains: Domain[];
  campaignsFor: (domainId: string) => Promise<Campaign[]>;
  onSubmit: (input: CourseInput) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel: () => void;
}

const fieldCx =
  "rounded-sm border border-line-bright bg-surface-sunken px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

type CampaignMode = "none" | "existing" | "new";

/** Create a Course: title, required Domain, optional Campaign (existing or inline-new),
 *  Capability paragraph, and Milestones. */
export function CourseForm({ domains, campaignsFor, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [domainId, setDomainId] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignMode, setCampaignMode] = useState<CampaignMode>("none");
  const [campaignId, setCampaignId] = useState("");
  const [newCampaign, setNewCampaign] = useState("");
  const [capability, setCapability] = useState("");
  const [milestones, setMilestones] = useState<MilestoneInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const titleFieldId = useId();
  const domainFieldId = useId();
  const capFieldId = useId();
  const errorId = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Load campaigns for the chosen domain; reset the campaign choice when the domain changes.
  useEffect(() => {
    setCampaignMode("none");
    setCampaignId("");
    if (!domainId) {
      setCampaigns([]);
      return;
    }
    let active = true;
    campaignsFor(domainId).then((cs) => active && setCampaigns(cs));
    return () => {
      active = false;
    };
  }, [domainId, campaignsFor]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!domainId) {
      setError("Choose a domain");
      return;
    }
    const campaign: CampaignChoice =
      campaignMode === "existing" && campaignId
        ? { kind: "existing", id: campaignId }
        : campaignMode === "new" && newCampaign.trim()
          ? { kind: "new", title: newCampaign.trim() }
          : { kind: "none" };

    setBusy(true);
    const result = await onSubmit({ title, domainId, campaign, capability, milestones });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      titleRef.current?.focus();
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor={titleFieldId} className="text-sm font-semibold text-text">
          Title
        </label>
        <input
          id={titleFieldId}
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={fieldCx}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={domainFieldId} className="text-sm font-semibold text-text">
          Domain
        </label>
        <select
          id={domainFieldId}
          value={domainId}
          onChange={(e) => setDomainId(e.target.value)}
          className={fieldCx}
        >
          <option value="">Select a domain…</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-semibold text-text">Campaign (optional)</legend>
        <div className="flex flex-wrap items-center gap-3 text-sm text-text">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="campaign-mode"
              checked={campaignMode === "none"}
              onChange={() => setCampaignMode("none")}
            />
            None
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="campaign-mode"
              checked={campaignMode === "existing"}
              onChange={() => setCampaignMode("existing")}
              disabled={campaigns.length === 0}
            />
            Existing
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="campaign-mode"
              checked={campaignMode === "new"}
              onChange={() => setCampaignMode("new")}
              disabled={!domainId}
            />
            New
          </label>
        </div>
        {campaignMode === "existing" && (
          <select
            aria-label="Existing campaign"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className={fieldCx}
          >
            <option value="">Select a campaign…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
        {campaignMode === "new" && (
          <input
            aria-label="New campaign title"
            value={newCampaign}
            onChange={(e) => setNewCampaign(e.target.value)}
            placeholder="Campaign title"
            className={fieldCx}
          />
        )}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor={capFieldId} className="text-sm font-semibold text-text">
          Capability
        </label>
        <textarea
          id={capFieldId}
          value={capability}
          onChange={(e) => setCapability(e.target.value)}
          rows={3}
          placeholder="What does completing this Course prove you can do?"
          className={fieldCx}
        />
      </div>

      <MilestonesEditor value={milestones} onChange={setMilestones} />

      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Create course
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
