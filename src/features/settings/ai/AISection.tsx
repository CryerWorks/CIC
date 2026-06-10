import { useState } from "react";
import { Panel, Button, Callout } from "../../../components/ui";
import { useAIConfig } from "./useAIConfig";
import { ProviderForm } from "./ProviderForm";
import { ProviderList } from "./ProviderList";
import { RoleRoutingEditor } from "./RoleRoutingEditor";
import { LockdownToggle } from "./LockdownToggle";
import type { ProviderConfig } from "../../../ai/config";

/**
 * AI Providers section — mounted in the /settings page (Feature 016). Composed of:
 *   - The corruption-recovery callout (when `loadError` is set, FR-003).
 *   - The provider list + add/edit form.
 *   - The role routing editor (US1 primary + US3 fallback chain).
 *   - The lockdown toggle (US1 / Constitution II).
 *
 * Mirrors the 014 NotificationsSettings host pattern (one Panel per concern). All state lives in
 * `useAIConfig`. No adapter classes are imported here — Constitution II / FR-024 / FR-025.
 */
export function AISection() {
  const {
    config,
    loadError,
    probes,
    reAuthRequired,
    addProvider,
    editProvider,
    removeProvider,
    testConnection,
    setRoleTarget,
    addFallback,
    removeFallback,
    setLockdown,
    resetToDefaults,
  } = useAIConfig();

  type Editor =
    | { mode: "new" }
    | { mode: "edit"; provider: ProviderConfig }
    | null;
  const [editor, setEditor] = useState<Editor>(null);
  const [confirmRemove, setConfirmRemove] = useState<ProviderConfig | null>(null);

  if (loadError) {
    return (
      <Callout variant="warn" title="Your AI configuration could not be loaded">
        <div className="flex flex-col gap-2">
          <span>
            The on-disk config is corrupt or doesn't match the expected shape. Resetting will
            replace it with an empty configuration — you can re-add your providers afterward.
          </span>
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                if (confirm("Reset AI configuration to defaults? Your providers will be removed (the keychain entries remain).")) {
                  void resetToDefaults();
                }
              }}
            >
              Reset to defaults
            </Button>
          </div>
        </div>
      </Callout>
    );
  }

  const onSubmit = async (input: Parameters<typeof addProvider>[0]) => {
    if (editor === null) return { ok: false, error: "no editor open" };
    if (editor.mode === "edit") {
      const result = await editProvider(editor.provider.id, input);
      if (result.ok) setEditor(null);
      return result;
    }
    const result = await addProvider(input);
    if (result.ok) setEditor(null);
    return result;
  };

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Panel title="AI Providers">
        <div className="flex flex-col gap-3">
          {editor === null && (
            <div>
              <Button onClick={() => setEditor({ mode: "new" })}>+ Add provider</Button>
            </div>
          )}
          {editor && (
            <div className="rounded-sm border border-line bg-surface-sunken p-3">
              <ProviderForm
                initial={editor.mode === "edit" ? editor.provider : undefined}
                submitLabel={editor.mode === "edit" ? "Save provider" : "Add provider"}
                onSubmit={onSubmit}
                onCancel={() => setEditor(null)}
              />
            </div>
          )}
        </div>
      </Panel>

      <ProviderList
        providers={config.providers}
        probes={probes}
        reAuthRequired={reAuthRequired}
        onTest={testConnection}
        onEdit={(id) => {
          const p = config.providers.find((x) => x.id === id);
          if (p) setEditor({ mode: "edit", provider: p });
        }}
        onRemove={(id) => {
          const p = config.providers.find((x) => x.id === id);
          if (p) setConfirmRemove(p);
        }}
      />

      <RoleRoutingEditor
        config={config}
        onSetTarget={setRoleTarget}
        onAddFallback={addFallback}
        onRemoveFallback={removeFallback}
      />

      <LockdownToggle enabled={config.lockdown} onChange={setLockdown} />

      {confirmRemove && (
        <Callout variant="warn" title={`Remove "${confirmRemove.label}"?`}>
          <div className="flex flex-col gap-2">
            <span>
              {affectedRoles(config, confirmRemove.id).length > 0 ? (
                <>
                  This provider is assigned to {affectedRoles(config, confirmRemove.id).join(", ")}.
                  Removing it will unassign those roles. Its keychain entry will also be removed.
                </>
              ) : (
                <>Its keychain entry will also be removed.</>
              )}
            </span>
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={async () => {
                  await removeProvider(confirmRemove.id);
                  setConfirmRemove(null);
                }}
              >
                Remove
              </Button>
              <Button variant="ghost" onClick={() => setConfirmRemove(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Callout>
      )}
    </div>
  );
}

function affectedRoles(config: ReturnType<typeof useAIConfig>["config"], providerId: string): string[] {
  const out: string[] = [];
  for (const role of ["reasoning", "drafting", "embeddings"] as const) {
    let cur = config.routing[role];
    while (cur) {
      if (cur.providerId === providerId) {
        out.push(role);
        break;
      }
      cur = cur.fallback ?? null;
    }
  }
  return out;
}
