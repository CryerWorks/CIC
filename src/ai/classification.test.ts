import { describe, it, expect } from "vitest";
import { isLocalHost, isLanHost } from "./classification";

describe("isLocalHost", () => {
  it.each([
    ["http://localhost:11434", true],
    ["http://localhost", true],
    ["https://localhost:8080/v1", true],
    ["http://127.0.0.1:11434", true],
    ["http://127.0.0.1", true],
    ["http://[::1]:11434", true],
    ["http://[::1]", true],
    // Case-insensitive
    ["http://Localhost", true],
  ])("loopback %s → true", (url, expected) => {
    expect(isLocalHost(url)).toBe(expected);
  });

  it.each([
    "http://192.168.1.50",
    "http://10.0.0.1",
    "http://172.16.0.5",
    "http://172.31.0.5",
    "https://api.openai.com",
    "https://api.anthropic.com",
    "https://openrouter.ai/api/v1",
    "http://example.com",
  ])("non-loopback %s → false", (url) => {
    expect(isLocalHost(url)).toBe(false);
  });

  it.each(["not a url", "", "javascript:alert(1)"])("malformed URL %s → false (no throw)", (s) => {
    expect(isLocalHost(s)).toBe(false);
  });
});

describe("isLanHost", () => {
  it.each([
    ["http://192.168.1.50:11434", true],
    ["http://192.168.0.1", true],
    ["http://10.0.0.1", true],
    ["http://10.255.255.255", true],
    ["http://172.16.0.1", true],
    ["http://172.31.0.1", true],
    ["http://172.31.255.255", true],
  ])("RFC1918 %s → true", (url, expected) => {
    expect(isLanHost(url)).toBe(expected);
  });

  it.each([
    "http://localhost",
    "http://127.0.0.1",
    "http://[::1]",
    "http://172.15.0.1",
    "http://172.32.0.1",
    "https://api.openai.com",
  ])("non-LAN %s → false", (url) => {
    expect(isLanHost(url)).toBe(false);
  });

  it("malformed URL → false", () => {
    expect(isLanHost("nope")).toBe(false);
  });
});

describe("classification matrix", () => {
  // The settings UI distinguishes three buckets: local / remote (LAN) / remote.
  it("loopback is local-not-LAN", () => {
    expect(isLocalHost("http://localhost")).toBe(true);
    expect(isLanHost("http://localhost")).toBe(false);
  });
  it("RFC1918 is remote-and-LAN", () => {
    expect(isLocalHost("http://192.168.1.50")).toBe(false);
    expect(isLanHost("http://192.168.1.50")).toBe(true);
  });
  it("public host is remote-not-LAN", () => {
    expect(isLocalHost("https://api.openai.com")).toBe(false);
    expect(isLanHost("https://api.openai.com")).toBe(false);
  });
});
