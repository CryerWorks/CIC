import { Panel } from "../../../components/ui";

/**
 * Local-only lockdown switch (Feature 016, FR-011/FR-012/FR-013). When ON, the router refuses to
 * send vault content to any non-local provider — at every step of the fallback walk (per-step
 * gating, Constitution II).
 */
export function LockdownToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (next: boolean) => Promise<void>;
}) {
  return (
    <Panel title="Local-only lockdown">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label="Local-only lockdown"
          checked={enabled}
          onChange={(e) => void onChange(e.target.checked)}
          className="mt-0.5"
        />
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-text">
            Block vault content from reaching remote providers
          </span>
          <span className="text-text-dim">
            When on, vault note text and RAG context can never reach a remote AI provider. Local
            providers (Ollama, LM Studio, llama.cpp on this machine) still work normally. A
            fallback chain like <span className="font-mono text-text">remote → local</span> still
            works under lockdown: the router skips the remote step and lands on the local one.
          </span>
        </div>
      </label>
    </Panel>
  );
}
