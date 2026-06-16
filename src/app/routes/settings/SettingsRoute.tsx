import { NotificationsSettings } from "../../../features/notifications/NotificationsSettings";
import { AISection } from "../../../features/settings/ai/AISection";
import { InterleavingSection } from "../../../features/settings/InterleavingSection";
import { useAIState } from "../../providers/AIProvider";

/**
 * App-level settings (Feature 014, extended in 016). Not vault-gated — preferences like reminders
 * can be configured without a connected vault (the reminder simply finds no pending work).
 * Hosts: Notifications (014), AI Providers + Role routing + Lockdown (016), Interleaving (021).
 */
export function SettingsRoute() {
  const ai = useAIState();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold text-text">Settings</h1>
      <NotificationsSettings />
      <InterleavingSection />
      {ai.status === "error" ? (
        <p className="mt-6 text-sm text-danger">AI layer failed to load: {ai.error.message}</p>
      ) : (
        // AIProvider renders eagerly as "ready" with an empty config and then re-rerenders with the
        // real config once it loads; AISection handles the brief flash gracefully.
        <AISection />
      )}
    </div>
  );
}
