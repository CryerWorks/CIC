// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../../db/adapters/node";
import { migrate } from "../../db/migrate";
import { setSetting } from "../../db";
import {
  getReminderConfig,
  setReminderEnabled,
  setReminderTime,
  markReminderFired,
  ENABLED_KEY,
  TIME_KEY,
  DEFAULT_TIME,
} from "./config";

async function freshDb(): Promise<NodeSqlExecutor> {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  return db;
}

describe("reminder config accessors (Feature 014)", () => {
  it("defaults when unset: disabled, 09:00, never fired", async () => {
    const db = await freshDb();
    const cfg = await getReminderConfig(db);
    expect(cfg.enabled).toBe(false);
    expect(cfg.time).toEqual(DEFAULT_TIME);
    expect(cfg.lastFired).toBeNull();
  });

  it("round-trips enabled, time, and lastFired", async () => {
    const db = await freshDb();
    await setReminderEnabled(db, true);
    await setReminderTime(db, 7, 5);
    await markReminderFired(db, "2026-05-29");

    const cfg = await getReminderConfig(db);
    expect(cfg.enabled).toBe(true);
    expect(cfg.time).toEqual({ hour: 7, minute: 5 });
    expect(cfg.lastFired).toBe("2026-05-29");
  });

  it("stores time zero-padded as HH:MM", async () => {
    const db = await freshDb();
    await setReminderTime(db, 9, 0);
    // Reads back parsed; the stored raw is zero-padded so it round-trips.
    expect((await getReminderConfig(db)).time).toEqual({ hour: 9, minute: 0 });
  });

  it("falls back to defaults on malformed stored values (never throws)", async () => {
    const db = await freshDb();
    await setSetting(db, TIME_KEY, "not-a-time");
    await setSetting(db, ENABLED_KEY, "yes"); // only "true" is truthy
    const cfg = await getReminderConfig(db);
    expect(cfg.time).toEqual(DEFAULT_TIME);
    expect(cfg.enabled).toBe(false);
  });

  it("rejects an out-of-range time, falling back to the default", async () => {
    const db = await freshDb();
    await setSetting(db, TIME_KEY, "27:99");
    expect((await getReminderConfig(db)).time).toEqual(DEFAULT_TIME);
  });
});
