import { useEffect, useState } from "react";
import { Panel, Button, Tag } from "../../../components/ui";
import type { AIConfig, AIRole, ProviderConfig, RoleTarget } from "../../../ai/config";
import { isLocalHost } from "../../../ai/classification";

const ROLES: { role: AIRole; label: string }[] = [
  { role: "reasoning", label: "Reasoning" },
  { role: "drafting", label: "Drafting" },
  { role: "embeddings", label: "Embeddings" },
];

const FIELD = "rounded-sm border border-line bg-surface-sunken px-2 py-1 text-sm text-text";

/**
 * Role routing editor (Feature 016, US1 + US3). Per role: a primary provider+model selector + a
 * fallback chain (US3). When lockdown is ON, remote-targeted steps render a "vault content
 * blocked by lockdown" badge so the privacy implication is obvious (FR-013).
 */
export function RoleRoutingEditor({
  config,
  onSetTarget,
  onAddFallback,
  onRemoveFallback,
}: {
  config: AIConfig;
  onSetTarget: (role: AIRole, target: RoleTarget | null) => Promise<void>;
  onAddFallback: (role: AIRole, providerId: string, model: string) => Promise<void>;
  onRemoveFallback: (role: AIRole, index: number) => Promise<void>;
}) {
  const providers = config.providers;

  return (
    <Panel title="Role routing">
      {providers.length === 0 ? (
        <p className="text-sm text-text-dim">Add a provider above before assigning roles.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {ROLES.map(({ role, label }) => (
            <RoleRow
              key={role}
              role={role}
              label={label}
              providers={providers}
              target={config.routing[role]}
              lockdown={config.lockdown}
              onSetTarget={onSetTarget}
              onAddFallback={onAddFallback}
              onRemoveFallback={onRemoveFallback}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function RoleRow({
  role,
  label,
  providers,
  target,
  lockdown,
  onSetTarget,
  onAddFallback,
  onRemoveFallback,
}: {
  role: AIRole;
  label: string;
  providers: ProviderConfig[];
  target: RoleTarget | null;
  lockdown: boolean;
  onSetTarget: (role: AIRole, target: RoleTarget | null) => Promise<void>;
  onAddFallback: (role: AIRole, providerId: string, model: string) => Promise<void>;
  onRemoveFallback: (role: AIRole, index: number) => Promise<void>;
}) {
  const [addingFallback, setAddingFallback] = useState(false);

  const steps = chainToSteps(target);

  const setPrimary = (providerId: string, model: string) => {
    if (!providerId) {
      void onSetTarget(role, null);
      return;
    }
    if (target === null) {
      void onSetTarget(role, { providerId, model });
      return;
    }
    void onSetTarget(role, { ...target, providerId, model });
  };

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-line p-3">
      <p className="text-sm font-semibold text-text">{label}</p>
      {steps.length === 0 ? (
        <StepEditor
          role={role}
          providers={providers}
          step={{ providerId: "", model: "" }}
          lockdown={lockdown}
          onChange={(p, m) => setPrimary(p, m)}
          onRemove={undefined}
          stepIndex={0}
        />
      ) : (
        steps.map((step, i) => {
          const stepLabel = i === 0 ? null : `Fallback ${i}`;
          return (
            <div key={i} className="flex flex-col gap-1">
              {stepLabel && (
                <span className="text-xs font-medium text-text-dim">{stepLabel}</span>
              )}
              <StepEditor
                role={role}
                providers={providers}
                step={step}
                lockdown={lockdown}
                onChange={(p, m) => {
                  if (i === 0) setPrimary(p, m);
                  else {
                    // Replace fallback step in place by remove + re-add. Simpler: rebuild chain.
                    const next = steps.map((s, j) => (j === i ? { providerId: p, model: m } : s));
                    void onSetTarget(role, stepsToChain(next));
                  }
                }}
                onRemove={
                  i === 0
                    ? () => void onSetTarget(role, null)
                    : () => void onRemoveFallback(role, i)
                }
                stepIndex={i}
              />
            </div>
          );
        })
      )}

      {steps.length > 0 && !addingFallback && (
        <div>
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Add fallback to ${label}`}
            onClick={() => setAddingFallback(true)}
          >
            + Add fallback
          </Button>
        </div>
      )}

      {addingFallback && (
        <AddFallbackRow
          providers={providers}
          excludeIds={new Set(steps.map((s) => s.providerId))}
          onCancel={() => setAddingFallback(false)}
          onConfirm={async (providerId, model) => {
            await onAddFallback(role, providerId, model);
            setAddingFallback(false);
          }}
        />
      )}
    </div>
  );
}

function StepEditor({
  role,
  providers,
  step,
  lockdown,
  onChange,
  onRemove,
  stepIndex,
}: {
  role: AIRole;
  providers: ProviderConfig[];
  step: { providerId: string; model: string };
  lockdown: boolean;
  onChange: (providerId: string, model: string) => void;
  onRemove: (() => void) | undefined;
  stepIndex: number;
}) {
  // Local, editable state. The persisted `step` is only the seed. We commit back via `onChange`
  // ONLY for a complete selection (provider + non-empty model) — never per-keystroke (which would
  // round-trip every character through SQLite + zod + reload) and never with an empty model (which
  // `RoleTargetSchema.model = z.string().min(1)` rejects → the save silently fails and the dropdown
  // appears to "stick" on — none —). This mirrors AddFallbackRow's local-state pattern.
  const [providerId, setProviderId] = useState(step.providerId);
  const [model, setModel] = useState(step.model);

  // Re-seed when the persisted step changes underneath us (post-save reload, a referenced provider
  // being removed, or reset-to-defaults). In steady state local === persisted, so this is a no-op.
  useEffect(() => {
    setProviderId(step.providerId);
    setModel(step.model);
  }, [step.providerId, step.model]);

  const provider = providers.find((p) => p.id === providerId);
  const blocked = lockdown && provider !== undefined && !isLocalHost(provider.baseUrl ?? "");

  const handleProvider = (nextId: string) => {
    setProviderId(nextId);
    if (nextId === "") {
      // Explicit clear — the parent maps an empty providerId to `onSetTarget(role, null)`.
      setModel("");
      onChange("", "");
      return;
    }
    // Prefill the provider's default model when the user hasn't typed one yet, so a single dropdown
    // pick yields a complete, persistable target. If there's no default, hold the selection locally
    // until the user types a model (committed on blur) — we never persist an empty model.
    const picked = providers.find((p) => p.id === nextId);
    const nextModel = model.trim() === "" && picked?.defaultModel ? picked.defaultModel : model;
    setModel(nextModel);
    if (nextModel.trim() !== "") onChange(nextId, nextModel.trim());
  };

  const commitModel = () => {
    if (providerId !== "" && model.trim() !== "") onChange(providerId, model.trim());
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={`Provider for ${role}${stepIndex > 0 ? ` fallback ${stepIndex}` : ""}`}
        value={providerId}
        onChange={(e) => handleProvider(e.target.value)}
        className={FIELD}
      >
        <option value="">— none —</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <input
        aria-label={`Model for ${role}${stepIndex > 0 ? ` fallback ${stepIndex}` : ""}`}
        value={model}
        onChange={(e) => setModel(e.target.value)}
        onBlur={commitModel}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitModel();
        }}
        placeholder="model"
        className={FIELD}
      />
      {blocked && (
        <span
          title="When lockdown is on, vault content is never sent to remote providers. The router will skip this step on vault-bearing calls."
        >
          <Tag tone="warn">vault content blocked by lockdown</Tag>
        </span>
      )}
      {onRemove && providerId && (
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      )}
    </div>
  );
}

function AddFallbackRow({
  providers,
  excludeIds,
  onCancel,
  onConfirm,
}: {
  providers: ProviderConfig[];
  excludeIds: ReadonlySet<string>;
  onCancel: () => void;
  onConfirm: (providerId: string, model: string) => Promise<void>;
}) {
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const available = providers.filter((p) => !excludeIds.has(p.id));
  const canAdd = providerId !== "" && model.trim() !== "";

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
      <select
        aria-label="Fallback provider"
        value={providerId}
        onChange={(e) => {
          setProviderId(e.target.value);
          const p = available.find((x) => x.id === e.target.value);
          if (p?.defaultModel && !model) setModel(p.defaultModel);
        }}
        className={FIELD}
      >
        <option value="">— pick a provider —</option>
        {available.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <input
        aria-label="Fallback model"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder="model"
        className={FIELD}
      />
      <Button size="sm" disabled={!canAdd} onClick={() => void onConfirm(providerId, model.trim())}>
        Add
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function chainToSteps(target: RoleTarget | null): Array<{ providerId: string; model: string }> {
  if (target === null) return [];
  const out: Array<{ providerId: string; model: string }> = [];
  let cur: RoleTarget | undefined = target;
  while (cur) {
    out.push({ providerId: cur.providerId, model: cur.model });
    cur = cur.fallback;
  }
  return out;
}

function stepsToChain(steps: Array<{ providerId: string; model: string }>): RoleTarget | null {
  if (steps.length === 0) return null;
  let acc: RoleTarget | undefined;
  for (let i = steps.length - 1; i >= 0; i--) {
    acc = { ...steps[i], fallback: acc };
  }
  return acc ?? null;
}
