import { useState } from "react";
import { Panel, Button, Tag } from "../../../components/ui";
import type { ProviderConfig } from "../../../ai/config";
import type { ProbeResult } from "./useAIConfig";
import { isLocalHost, isLanHost } from "../../../ai/classification";

/**
 * Provider list (Feature 016, US1/US2). Each tile shows label · type · local/remote/remote (LAN)
 * + actions: Test connection, Edit, Remove. Remote tiles flagged for re-auth (US2) get a
 * "Re-enter API key" affordance.
 */
export function ProviderList({
  providers,
  probes,
  reAuthRequired,
  onTest,
  onEdit,
  onRemove,
}: {
  providers: ProviderConfig[];
  probes: Record<string, ProbeResult | undefined>;
  reAuthRequired: ReadonlySet<string>;
  onTest: (id: string) => Promise<ProbeResult>;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Panel title={`Providers (${providers.length})`}>
      {providers.length === 0 ? (
        <p className="text-sm text-text-dim">
          No providers configured yet — add one to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {providers.map((p) => (
            <li key={p.id}>
              <ProviderTile
                provider={p}
                probe={probes[p.id]}
                reAuthRequired={reAuthRequired.has(p.id)}
                onTest={() => onTest(p.id)}
                onEdit={() => onEdit(p.id)}
                onRemove={() => onRemove(p.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ProviderTile({
  provider,
  probe,
  reAuthRequired,
  onTest,
  onEdit,
  onRemove,
}: {
  provider: ProviderConfig;
  probe: ProbeResult | undefined;
  reAuthRequired: boolean;
  onTest: () => Promise<ProbeResult>;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const localTag = classificationFor(provider);

  const handleTest = async () => {
    setTesting(true);
    try {
      await onTest();
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-sm border border-line bg-panel p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-text">{provider.label}</p>
          <p className="truncate text-xs text-text-dim">
            {provider.type}
            {provider.baseUrl && <span> · {provider.baseUrl}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span title={localTag.tooltip}>
            <Tag tone={localTag.tone}>{localTag.label}</Tag>
          </span>
          {reAuthRequired && (
            <span title="The provider returned an authentication error">
              <Tag tone="warn">Re-enter API key</Tag>
            </span>
          )}
          <Button size="sm" variant="ghost" disabled={testing} onClick={() => void handleTest()}>
            {testing ? "Testing…" : "Test connection"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
      {probe && <ProbeResultBadge probe={probe} />}
    </div>
  );
}

function ProbeResultBadge({ probe }: { probe: ProbeResult }) {
  if ("error" in probe) {
    return <p className="mt-2 text-xs text-danger">{probe.error}</p>;
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-dim">
      <span className="font-medium text-brand">
        ✓ reachable <span className="text-text-dim">· {probe.latencyMs} ms</span>
      </span>
      <span className="flex flex-wrap items-center gap-1">
        {probe.chat && <Tag tone="neutral">chat</Tag>}
        {probe.embeddings && <Tag tone="neutral">embeddings</Tag>}
        {probe.streaming && <Tag tone="neutral">streaming</Tag>}
      </span>
    </div>
  );
}

function classificationFor(p: ProviderConfig): {
  label: string;
  tone: "brand" | "warn" | "neutral";
  tooltip: string;
} {
  if (p.type === "anthropic") {
    return { label: "remote", tone: "neutral", tooltip: "Anthropic is always remote." };
  }
  if (!p.baseUrl) return { label: "remote", tone: "neutral", tooltip: "" };
  if (isLocalHost(p.baseUrl)) {
    return { label: "local", tone: "brand", tooltip: "Fully on this machine." };
  }
  if (isLanHost(p.baseUrl)) {
    return {
      label: "remote (LAN)",
      tone: "warn",
      tooltip:
        "On your LAN — but lockdown still treats this as non-local (we can't verify a LAN box's egress posture).",
    };
  }
  return { label: "remote", tone: "neutral", tooltip: "" };
}
