/**
 * NewCourseEntry — Entry point for the Course Generation Engine.
 *
 * Two paths: "Design with AI" (Mode A) and "Generate from Resources" (Mode B).
 * Manages the full lifecycle: target-setting → generation → review → materialize.
 *
 * Placed inline in the CoursesRoute as an overlay or panel.
 */

import { useEffect, useState } from "react";
import { useDb } from "../../app/providers/DbProvider";
import { useActiveVaultId } from "../../app/providers/VaultProvider";
import { listResources, type Resource } from "../../db";
import { useBlueprint } from "./useBlueprint";
import { TargetDialog } from "./TargetDialog";
import { BlueprintReview } from "./BlueprintReview";
import { Button } from "../../components/ui";
import type { GenerationMode, BlueprintTarget } from "../../ai/features/blueprint/types";

interface Props {
  onClose: () => void;
}

export function NewCourseEntry({ onClose }: Props) {
  const db = useDb();
  const vaultId = useActiveVaultId();
  const {
    phase,
    mode,
    blueprint,
    messages,
    isStreaming,
    materializeResult,
    error,
    startModeA,
    startModeB,
    sendMessage,
    finalizeBlueprint,
    updateBlueprint,
    materialize,
    reset,
    dismissError,
  } = useBlueprint();

  const [resources, setResources] = useState<Resource[]>([]);
  const [input, setInput] = useState("");

  // Load resources for Mode B
  useEffect(() => {
    if (!db || !vaultId) return;
    listResources(db, vaultId).then((r) => setResources(r)).catch(() => {});
  }, [db, vaultId]);

  // Phase: idle — show nothing (caller decides when to open)
  if (phase === "idle") {
    return null;
  }

  // Phase: setting-target
  if (phase === "setting-target") {
    return (
      <TargetDialog
        ready={!!db && !!vaultId}
        resources={resources.map((r) => ({ id: r.id, title: r.title }))}
        onStart={(mode: GenerationMode, target: BlueprintTarget) => {
          if (mode === "a") {
            startModeA(target);
          } else {
            startModeB(target);
          }
        }}
        onCancel={() => {
          reset();
          onClose();
        }}
      />
    );
  }

  // Phase: generating (Mode A — conversational)
  if (phase === "generating" && mode === "a") {
    const handleSend = async () => {
      const trimmed = input.trim();
      if (!trimmed || isStreaming) return;
      setInput("");
      await sendMessage(trimmed);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="flex h-[500px] w-[480px] flex-col rounded-lg border border-line bg-panel shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-text">Campaign Architect</h2>
            <button
              onClick={() => {
                reset();
                onClose();
              }}
              className="rounded-sm px-2 py-1 text-xs text-text-dim hover:bg-panel-raised hover:text-text transition-colors"
              aria-label="Close"
            >
              Close
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-text-dim">
                  Tell the Campaign Architect what you want to learn.
                </p>
                <p className="text-xs text-text-dim">
                  Ask for adjustments, then say "looks good" to finalize.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`rounded-sm px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "ml-8 bg-brand/10 text-text"
                      : "mr-8 bg-panel-raised text-text"
                  }`}
                >
                  {msg.content}
                </div>
              ))}
              {isStreaming && (
                <div className="mr-8 animate-pulse rounded-sm bg-panel-raised px-3 py-2 text-sm text-text-dim">
                  Thinking…
                </div>
              )}
            </div>
          </div>

          {/* Input area */}
          <div className="border-t border-line p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Tell the AI what you want to learn…"
                disabled={isStreaming}
                className="flex-1 rounded-sm border border-line-bright bg-surface-sunken px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
              />
              <Button type="submit" disabled={isStreaming || !input.trim()}>
                Send
              </Button>
            </form>
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={messages.length === 0 || isStreaming}
                onClick={finalizeBlueprint}
              >
                Finalize &amp; Review
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Phase: generating (Mode B — synthesis in progress)
  if (phase === "generating" && mode === "b") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="flex h-[200px] w-[400px] flex-col items-center justify-center gap-4 rounded-lg border border-line bg-panel shadow-xl">
          <div className="inline-block size-8 animate-spin rounded-full border-2 border-ai border-t-transparent" />
          <p className="text-sm text-text-dim">
            Synthesizing course from resources…
          </p>
        </div>
      </div>
    );
  }

  // Phase: reviewing or materializing or done (BlueprintReview handles all three)
  if ((phase === "reviewing" || phase === "materializing" || phase === "done") && blueprint) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40">
        <div className="mx-auto my-8 max-w-2xl">
          <BlueprintReview
            blueprint={blueprint}
            materializing={phase === "materializing"}
            onUpdate={updateBlueprint}
            onMaterialize={materialize}
            onBack={() => {
              reset();
              onClose();
            }}
            result={materializeResult}
          />
        </div>
      </div>
    );
  }

  // Phase: error
  if (phase === "error") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-md rounded-lg border border-line bg-panel p-6 shadow-xl">
          <h3 className="mb-2 text-sm font-semibold text-danger">Error</h3>
          <p className="mb-4 text-sm text-text-dim">{error}</p>
          <div className="flex gap-2">
            <Button onClick={dismissError}>Dismiss</Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
