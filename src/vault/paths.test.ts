import { describe, it, expect } from "vitest";
import { resolveVaultPath } from "./paths";
import { VaultPathError } from "./errors";

const VAULT = "/home/user/vault";

describe("resolveVaultPath — path safety (US3 · FR-011/012 · SC-006)", () => {
  it("resolves a valid nested subfolder path to an absolute path inside the vault", () => {
    expect(resolveVaultPath(VAULT, "Math/Real Analysis.md")).toBe(
      "/home/user/vault/Math/Real Analysis.md",
    );
  });

  it("collapses '.' and empty segments; '' resolves to the vault root", () => {
    expect(resolveVaultPath(VAULT, "")).toBe(VAULT);
    expect(resolveVaultPath(VAULT, "./Math//b.md")).toBe("/home/user/vault/Math/b.md");
  });

  it("tolerates Windows separators and a trailing separator on the root", () => {
    expect(resolveVaultPath("C:\\Users\\me\\vault", "Math\\b.md")).toBe(
      "C:\\Users\\me\\vault/Math/b.md",
    );
    expect(resolveVaultPath("/home/user/vault/", "a.md")).toBe("/home/user/vault/a.md");
  });

  it("rejects traversal (..) — even when it would stay in-vault", () => {
    expect(() => resolveVaultPath(VAULT, "../secrets.md")).toThrow(VaultPathError);
    expect(() => resolveVaultPath(VAULT, "Math/../../etc/passwd")).toThrow(VaultPathError);
    expect(() => resolveVaultPath(VAULT, "a/../b.md")).toThrow(VaultPathError);
  });

  it("rejects absolute paths (POSIX, Windows drive, UNC)", () => {
    expect(() => resolveVaultPath(VAULT, "/etc/passwd")).toThrow(VaultPathError);
    expect(() => resolveVaultPath(VAULT, "C:\\Windows\\system32")).toThrow(VaultPathError);
    expect(() => resolveVaultPath(VAULT, "\\\\server\\share")).toThrow(VaultPathError);
  });

  it("rejects anything under .obsidian/", () => {
    expect(() => resolveVaultPath(VAULT, ".obsidian/app.json")).toThrow(VaultPathError);
    expect(() => resolveVaultPath(VAULT, "Math/.obsidian/workspace")).toThrow(VaultPathError);
  });

  it("carries a typed rejection reason", () => {
    expect.assertions(2);
    try {
      resolveVaultPath(VAULT, "../x");
    } catch (e) {
      expect(e).toBeInstanceOf(VaultPathError);
      expect((e as VaultPathError).reason).toBe("escapes-vault");
    }
  });
});
