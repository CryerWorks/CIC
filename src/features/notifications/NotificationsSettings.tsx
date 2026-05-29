import { Panel, Button } from "../../components/ui";
import { useReminderSettings } from "./useReminderSettings";

const FIELD = "rounded-sm border border-line bg-surface-sunken px-3 py-2 text-text";

/**
 * Notifications settings (Feature 014, US1): enable daily reminders (requesting OS permission),
 * pick a time, and send a test notification. Calm, cadence-only copy — reminders nudge you to show
 * up, never reveal answers or claim mastery (Constitution III). All OS access is via the injected
 * `Notifier` seam; persistence is the settings KV. The scheduled firing is owned app-wide by
 * `ReminderScheduler`, not this page.
 */
export function NotificationsSettings() {
  const { config, status, setEnabled, setTime, sendTest } = useReminderSettings();

  if (!config) return <p className="text-text-dim">Loading…</p>;

  const timeValue = `${String(config.time.hour).padStart(2, "0")}:${String(config.time.minute).padStart(2, "0")}`;

  return (
    <Panel title="Notifications">
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-text-dim">
          We'll remind you to practice when reviews or sessions are waiting — and stay quiet once
          you've shown up for the day.
        </p>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="Enable reminders"
            checked={config.enabled}
            onChange={(e) => void setEnabled(e.target.checked)}
          />
          <span className="font-medium text-text">Enable daily reminders</span>
        </label>

        {config.enabled && (
          <label className="flex flex-col gap-1">
            <span className="font-medium text-text">Reminder time</span>
            <input
              type="time"
              aria-label="Reminder time"
              value={timeValue}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map((p) => Number.parseInt(p, 10));
                if (Number.isFinite(h) && Number.isFinite(m)) void setTime(h, m);
              }}
              className={`${FIELD} w-32`}
            />
          </label>
        )}

        <div>
          <Button variant="secondary" onClick={() => void sendTest()}>
            Send test notification
          </Button>
        </div>

        {status && <p className="text-text-dim">{status}</p>}
      </div>
    </Panel>
  );
}
