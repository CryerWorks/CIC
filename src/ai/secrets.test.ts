import { describe, it, expect } from "vitest";
import { InMemorySecretStore } from "./secrets";

describe("InMemorySecretStore", () => {
  it("round-trips set→get", async () => {
    const s = new InMemorySecretStore();
    await s.set("openai", "sk-test-abc");
    expect(await s.get("openai")).toBe("sk-test-abc");
  });

  it("overwrites by default on set", async () => {
    const s = new InMemorySecretStore();
    await s.set("openai", "old");
    await s.set("openai", "new");
    expect(await s.get("openai")).toBe("new");
  });

  it("get returns null for missing ref (not undefined, not a throw)", async () => {
    const s = new InMemorySecretStore();
    expect(await s.get("nonexistent")).toBe(null);
  });

  it("delete is idempotent for missing ref", async () => {
    const s = new InMemorySecretStore();
    await expect(s.delete("nonexistent")).resolves.toBeUndefined();
  });

  it("delete removes the entry", async () => {
    const s = new InMemorySecretStore();
    await s.set("openai", "sk-test");
    await s.delete("openai");
    expect(await s.get("openai")).toBe(null);
  });

  it("rejects empty ref or empty secret on set", async () => {
    const s = new InMemorySecretStore();
    await expect(s.set("", "secret")).rejects.toThrow();
    await expect(s.set("ref", "")).rejects.toThrow();
  });
});
