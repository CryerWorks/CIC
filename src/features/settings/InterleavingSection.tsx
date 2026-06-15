import { useState, useEffect, useCallback } from "react";
import { Panel, Button } from "../../components/ui";
import { useDb } from "../../app/providers/DbProvider";
import { getSetting, setSetting } from "../../db";
import { INTERLEAVING_COLD_DAYS_KEY, DEFAULT_COLD_DAYS } from "../interleaving/scheduler";

/**
 * Interleaving Scheduler settings section (Feature 021 / F6). Lets the user configure
 * the cold-domain threshold (number of days without activity before a domain is flagged
 * as "cold" on the dashboard). Saved to the KV settings store.
 */
export function InterleavingSection() {
  const db = useDb();
  const [coldDays, setColdDays] = useState(DEFAULT_COLD_DAYS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const raw = await getSetting(db, INTERLEAVING_COLD_DAYS_KEY);
      const n = raw === null ? NaN : Number.parseInt(raw, 10);
      if (Number.isFinite(n)) setColdDays(n);
      setLoading(false);
    })();
  }, [db]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    await setSetting(db, INTERLEAVING_COLD_DAYS_KEY, String(coldDays));
    setDirty(false);
    setSaving(false);
  }, [db, coldDays]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number.parseInt(e.target.value, 10);
    if (Number.isFinite(v) && v >= 1 && v <= 365) {
      setColdDays(v);
      setDirty(true);
    }
  }, []);

  if (loading) return null;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Panel title="Interleaving Scheduler">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-text">Cold-domain threshold (days)</span>
            <span className="text-xs text-text-dim">
              Domains with no completed session within this many days are flagged as "cold" on the
              dashboard.
            </span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={365}
                value={coldDays}
                onChange={handleChange}
                className="w-20 rounded-sm border border-line bg-surface-sunken px-2 py-1 text-sm text-text"
              />
              <span className="text-xs text-text-dim">days</span>
            </div>
          </label>
          {dirty && (
            <div>
              <Button onClick={handleSave} disabled={saving} variant="primary">
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
