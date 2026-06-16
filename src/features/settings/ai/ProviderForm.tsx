import { useState } from "react";
import { Button } from "../../../components/ui";
import type { ProviderType } from "../../../ai/config";
import type { ProviderFormInput } from "./useAIConfig";

const FIELD = "w-full rounded-sm border border-line bg-surface-sunken px-3 py-2 text-text";

const TYPE_LABELS: Record<ProviderType, string> = {
  ollama: "Ollama (local)",
  "openai-compatible": "OpenAI-compatible (LM Studio, llama.cpp, vLLM, OpenAI, OpenRouter, …)",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  gemini: "Google Gemini",
  voyage: "Voyage AI (embeddings)",
};

const DEFAULT_OLLAMA_URL = "http://localhost:11434";

interface ProviderEditData {
  id: string;
  type: ProviderType;
  label: string;
  baseUrl?: string;
  defaultModel?: string;
  embedModel?: string;
}

/**
 * Add or edit a provider (Feature 016, contracts/ui-settings.md). Kind-driven fields: Ollama
 * needs only baseUrl; OpenAI-compatible needs baseUrl + apiKey; Anthropic needs apiKey only.
 * In edit mode, the API key field shows `••••••••` as a placeholder — leaving it blank means
 * "don't change the secret" (US2 acceptance).
 */
export function ProviderForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ProviderEditData;
  submitLabel: string;
  onSubmit: (input: ProviderFormInput) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
}) {
  const editing = initial !== undefined;
  const [id, setId] = useState(initial?.id ?? "");
  const [type, setType] = useState<ProviderType>(initial?.type ?? "ollama");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? (initial ? "" : DEFAULT_OLLAMA_URL));
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [defaultModel, setDefaultModel] = useState(initial?.defaultModel ?? "");
  const [embedModel, setEmbedModel] = useState(initial?.embedModel ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsBaseUrl = type === "ollama" || type === "openai-compatible";
  // The API-key field is SHOWN for both openai-compatible and anthropic, but only REQUIRED for
  // anthropic. openai-compatible accepts a blank key — that's the LM Studio / llama.cpp path.
  const showApiKeyField = type === "openai-compatible" || type === "anthropic" || type === "deepseek" || type === "gemini" || type === "voyage";
  const apiKeyRequired = type === "anthropic" || type === "deepseek" || type === "gemini" || type === "voyage";
  const showEmbedModel = type === "ollama" || type === "openai-compatible" || type === "deepseek" || type === "gemini" || type === "voyage";

  const canSave =
    id.trim() !== "" &&
    label.trim() !== "" &&
    (!needsBaseUrl || baseUrl.trim() !== "") &&
    (editing || !apiKeyRequired || apiKey.trim() !== "");

  const onSubmitForm = async () => {
    if (!canSave) {
      setError("Fill in the required fields.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await onSubmit({
        id: id.trim(),
        type,
        label: label.trim(),
        baseUrl: needsBaseUrl ? baseUrl.trim() : undefined,
        // Send the apiKey only when the user actually typed one — both for new providers and
        // edits. For openai-compatible without a key, apiKey stays undefined and the new
        // ProviderConfig will not carry an apiKeyRef (keyless local-server path).
        apiKey: showApiKeyField && apiKey.trim() !== "" ? apiKey.trim() : undefined,
        defaultModel: defaultModel.trim() || undefined,
        embedModel: showEmbedModel ? embedModel.trim() || undefined : undefined,
      });
      if (!result.ok) setError(result.error ?? "Could not save the provider.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the provider.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      {!editing && (
        <label className="flex flex-col gap-1">
          <span className="font-medium text-text">Id</span>
          <input
            aria-label="Provider id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="local-ollama"
            className={FIELD}
          />
          <span className="text-xs text-text-dim">Lowercase, kebab-case. Used as the keychain entry name.</span>
        </label>
      )}

      {!editing && (
        <label className="flex flex-col gap-1">
          <span className="font-medium text-text">Type</span>
          <select
            aria-label="Provider type"
            value={type}
            onChange={(e) => setType(e.target.value as ProviderType)}
            className={FIELD}
          >
            {(Object.keys(TYPE_LABELS) as ProviderType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="font-medium text-text">Label</span>
        <input
          aria-label="Provider label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Local Ollama"
          className={FIELD}
        />
      </label>

      {needsBaseUrl && (
        <label className="flex flex-col gap-1">
          <span className="font-medium text-text">Base URL</span>
          <input
            aria-label="Base URL"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={type === "ollama" ? DEFAULT_OLLAMA_URL : "https://api.example.com"}
            className={FIELD}
          />
        </label>
      )}

      {showApiKeyField && (
        <label className="flex flex-col gap-1">
          <span className="font-medium text-text">
            API key{apiKeyRequired ? "" : " (optional)"}
          </span>
          <div className="flex gap-2">
            <input
              aria-label="API key"
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={editing ? "••••••••" : "sk-…"}
              className={FIELD}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={showApiKey ? "Hide key" : "Show key"}
              onClick={() => setShowApiKey((s) => !s)}
            >
              {showApiKey ? "Hide" : "Show"}
            </Button>
          </div>
          {!apiKeyRequired && !editing && (
            <span className="text-xs text-text-dim">
              Leave blank for local keyless servers (LM Studio, llama.cpp, vLLM). Required for OpenAI, OpenRouter, etc.
            </span>
          )}
          {editing && (
            <span className="text-xs text-text-dim">
              Leave blank to keep the existing key. Paste a new value to replace it.
            </span>
          )}
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="font-medium text-text">Default model (optional)</span>
        <input
          aria-label="Default model"
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
          placeholder={
            type === "anthropic" ? "claude-3-5-sonnet-20241022" : type === "ollama" ? "llama3.2:3b" : "gpt-4o"
          }
          className={FIELD}
        />
      </label>

      {showEmbedModel && (
        <label className="flex flex-col gap-1">
          <span className="font-medium text-text">Embeddings model (optional)</span>
          <input
            aria-label="Embeddings model"
            value={embedModel}
            onChange={(e) => setEmbedModel(e.target.value)}
            placeholder={type === "ollama" ? "nomic-embed-text" : "text-embedding-3-small"}
            className={FIELD}
          />
        </label>
      )}

      {error && <p className="text-danger">{error}</p>}
      <div className="flex gap-2 border-t border-line pt-3">
        <Button disabled={busy || !canSave} onClick={() => void onSubmitForm()}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
