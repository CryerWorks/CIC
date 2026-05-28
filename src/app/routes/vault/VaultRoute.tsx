import { Panel, Callout, Button } from "../../../components/ui";
import {
  useVaultState,
  useVaultActions,
  useVaultError,
} from "../../providers/VaultProvider";

/**
 * The Vault configuration screen (Feature 006): first-run onboarding (`unset`), connected status
 * with the note count (`ready`), graceful recovery (`unavailable`), and the change affordance.
 * No vault writes — the count is a read-only reachability signal.
 */
export function VaultRoute() {
  const state = useVaultState();
  const { chooseVault, changeVault, retry } = useVaultActions();
  const actionError = useVaultError();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-text">Vault</h1>

      {state.status === "checking" && (
        <Panel title="Checking your vault…">
          <p className="text-text-dim">One moment.</p>
        </Panel>
      )}

      {state.status === "unset" && (
        <Panel title="Connect your Obsidian vault">
          <div className="flex flex-col gap-3">
            <p className="text-text-dim">
              Choose the folder that is your Obsidian vault. CIC reads and writes your notes there
              as plain Markdown — nothing leaves your machine.
            </p>
            <div>
              <Button onClick={() => void chooseVault()}>Choose folder…</Button>
            </div>
          </div>
        </Panel>
      )}

      {state.status === "ready" && (
        <Panel
          title="Vault connected"
          headerRight={
            <Button variant="ghost" onClick={() => void changeVault()}>
              Change vault…
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            <p className="text-text-dim">Your vault is connected and reachable.</p>
            <p className="break-all font-mono text-sm text-text">{state.path}</p>
            <p className="text-text-dim">
              {state.noteCount} Markdown {state.noteCount === 1 ? "note" : "notes"} found.
            </p>
          </div>
        </Panel>
      )}

      {state.status === "unavailable" && (
        <Callout variant="danger" title="Vault unavailable">
          <div className="flex flex-col gap-3">
            <p>The configured vault folder cannot be reached right now:</p>
            <p className="break-all font-mono text-sm">{state.path || "(unknown)"}</p>
            <p className="text-text-dim">{state.error.message}</p>
            <div className="flex gap-2">
              <Button onClick={() => void retry()}>Retry</Button>
              <Button variant="ghost" onClick={() => void chooseVault()}>
                Choose a different folder…
              </Button>
            </div>
          </div>
        </Callout>
      )}

      {actionError && (
        <Callout variant="warn" title="Could not connect that folder">
          {actionError.message}
        </Callout>
      )}
    </div>
  );
}
