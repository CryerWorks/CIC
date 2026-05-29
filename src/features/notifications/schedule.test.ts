import { describe, it, expect } from "vitest";
import { decideReminder, dayKey, type ReminderSignals } from "./schedule";
import type { ReminderConfig } from "./config";

const base: ReminderConfig = { enabled: true, time: { hour: 9, minute: 0 }, lastFired: null };
const at = (h: number, m = 0) => new Date(2026, 4, 29, h, m, 0); // local 2026-05-29
const sig = (o: Partial<ReminderSignals> = {}): ReminderSignals => ({
  dueCount: 0,
  plannedCount: 0,
  practicedToday: false,
  ...o,
});

describe("decideReminder (Feature 014, US2/US3)", () => {
  it("does not fire when disabled", () => {
    expect(decideReminder(at(10), { ...base, enabled: false }, sig({ dueCount: 3 }))).toBeNull();
  });

  it("does not fire when already fired today", () => {
    expect(decideReminder(at(10), { ...base, lastFired: dayKey(at(10)) }, sig({ dueCount: 3 }))).toBeNull();
  });

  it("does not fire before the configured time", () => {
    expect(decideReminder(at(8), base, sig({ dueCount: 3 }))).toBeNull();
  });

  it("does not fire when nothing is pending (FR-006/SC-004)", () => {
    expect(decideReminder(at(10), base, sig())).toBeNull();
  });

  it("does not fire when already practiced today (FR-010/SC-003)", () => {
    expect(decideReminder(at(10), base, sig({ dueCount: 3, practicedToday: true }))).toBeNull();
  });

  it("fires with a both-sides summary when eligible", () => {
    const r = decideReminder(at(9), base, sig({ dueCount: 3, plannedCount: 2 }));
    expect(r?.body).toBe("3 reviews due · 2 sessions planned");
  });

  it("omits the zero side of the summary (and singularizes)", () => {
    expect(decideReminder(at(10), base, sig({ dueCount: 1 }))?.body).toBe("1 review due");
    expect(decideReminder(at(10), base, sig({ plannedCount: 1 }))?.body).toBe("1 session planned");
  });

  it("catches up when the app is past the time on a not-yet-fired day", () => {
    expect(decideReminder(at(23), base, sig({ dueCount: 1 }))).not.toBeNull();
  });

  it("uses calm, cadence-only copy — never a mastery claim (Constitution III)", () => {
    const r = decideReminder(at(9), base, sig({ dueCount: 2, plannedCount: 1 }));
    const text = `${r?.title} ${r?.body}`.toLowerCase();
    expect(text).not.toMatch(/master|learned|streak/);
  });
});
