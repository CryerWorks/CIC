import { Outlet } from "react-router-dom";
import { useDbState } from "../providers/DbProvider";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Panel, Callout } from "../../components/ui";

/**
 * The shell + store-health gate (FR-003/SC-003). Reads the store lifecycle and renders:
 *   loading → a centered panel; error → a danger Callout with the message (no routed content);
 *   ready → sidebar + topbar + the routed screen. Never a blank or frozen window.
 */
export function AppShell() {
  const state = useDbState();

  if (state.status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-surface p-6">
        <Panel title="Opening your local store…">
          <p className="text-text-dim">One moment while your data loads.</p>
        </Panel>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="grid min-h-screen place-items-center bg-surface p-6">
        <div className="w-full max-w-md">
          <Callout variant="danger" title="Couldn't open your local store">
            {state.error.message}
          </Callout>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
