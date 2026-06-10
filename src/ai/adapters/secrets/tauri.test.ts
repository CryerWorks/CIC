import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the @tauri-apps/api/core module BEFORE importing the adapter. `vi.hoisted` runs the
// factory at the top of the file so the mock fn is available when the mock factory executes.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { TauriKeychainSecretStore, SecretStoreError } from "./tauri";

beforeEach(() => {
  invokeMock.mockReset();
});

describe("TauriKeychainSecretStore", () => {
  it("set calls ai_keychain_set with { reference, secret }", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const store = new TauriKeychainSecretStore();
    await store.set("openai-1", "sk-test-abc");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("ai_keychain_set", { reference: "openai-1", secret: "sk-test-abc" });
  });

  it("get calls ai_keychain_get and returns the result", async () => {
    invokeMock.mockResolvedValueOnce("sk-test-abc");
    const store = new TauriKeychainSecretStore();
    const result = await store.get("openai-1");
    expect(result).toBe("sk-test-abc");
    expect(invokeMock).toHaveBeenCalledWith("ai_keychain_get", { reference: "openai-1" });
  });

  it("get returns null when the Rust side returns null", async () => {
    invokeMock.mockResolvedValueOnce(null);
    const store = new TauriKeychainSecretStore();
    expect(await store.get("missing")).toBe(null);
  });

  it("delete calls ai_keychain_delete", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const store = new TauriKeychainSecretStore();
    await store.delete("openai-1");
    expect(invokeMock).toHaveBeenCalledWith("ai_keychain_delete", { reference: "openai-1" });
  });

  it("set rejects empty ref or empty secret", async () => {
    const store = new TauriKeychainSecretStore();
    await expect(store.set("", "secret")).rejects.toThrow(SecretStoreError);
    await expect(store.set("ref", "")).rejects.toThrow(SecretStoreError);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("surfaces an invoke error as a SecretStoreError without leaking the secret", async () => {
    invokeMock.mockRejectedValueOnce("keychain locked");
    const store = new TauriKeychainSecretStore();
    let thrown: unknown = null;
    try {
      await store.set("openai-1", "sk-LEAKY-VALUE");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(SecretStoreError);
    // The error message MUST NOT contain the secret value (Constitution II / FR-016).
    expect((thrown as Error).message).not.toContain("sk-LEAKY-VALUE");
    expect((thrown as Error).message).toMatch(/keychain set failed/);
  });
});
