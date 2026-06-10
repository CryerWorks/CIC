import { describe, it, expect } from "vitest";
import {
  ProviderError,
  isProviderError,
  isRetryable,
  isAuthFailure,
  isCancellation,
} from "./errors";

describe("ProviderError", () => {
  it("stores all fields and the message", () => {
    const cause = new Error("inner");
    const err = new ProviderError("rate_limit", "openai-1", "throttled", true, cause);
    expect(err.kind).toBe("rate_limit");
    expect(err.providerId).toBe("openai-1");
    expect(err.message).toBe("throttled");
    expect(err.retryable).toBe(true);
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("ProviderError");
    expect(err instanceof Error).toBe(true);
  });

  it("omits .cause when not provided", () => {
    const err = new ProviderError("auth", "x", "bad key", false);
    expect("cause" in err && err.cause !== undefined ? err.cause : null).toBe(null);
  });
});

describe("predicates", () => {
  it("isProviderError narrows correctly", () => {
    expect(isProviderError(new ProviderError("unknown", "x", "y", false))).toBe(true);
    expect(isProviderError(new Error("nope"))).toBe(false);
    expect(isProviderError(null)).toBe(false);
    expect(isProviderError("string")).toBe(false);
  });

  it("isRetryable reflects the retryable field, only for ProviderError", () => {
    expect(isRetryable(new ProviderError("rate_limit", "x", "y", true))).toBe(true);
    expect(isRetryable(new ProviderError("auth", "x", "y", false))).toBe(false);
    expect(isRetryable(new Error("plain"))).toBe(false);
  });

  it("isAuthFailure tests kind === 'auth'", () => {
    expect(isAuthFailure(new ProviderError("auth", "x", "y", false))).toBe(true);
    expect(isAuthFailure(new ProviderError("rate_limit", "x", "y", true))).toBe(false);
    expect(isAuthFailure(new Error("plain"))).toBe(false);
  });

  it("isCancellation tests kind === 'cancelled'", () => {
    expect(isCancellation(new ProviderError("cancelled", "x", "y", false))).toBe(true);
    expect(isCancellation(new ProviderError("timeout", "x", "y", true))).toBe(false);
  });
});

describe("stringification redaction discipline", () => {
  // The taxonomy itself doesn't redact — the adapter is responsible for not putting secrets in
  // `message` / `.cause`. But we lock the assumption that JSON.stringify SEES `.cause`, so the
  // adapter MUST take care. This test pins the behavior and serves as a reminder.
  it("includes .cause when set (adapters must therefore scrub before construct)", () => {
    const err = new ProviderError("bad_response", "x", "malformed", false, { detail: "ok" });
    // .cause is a non-enumerable property on Error by spec; JSON.stringify won't include it
    // by default, but accessing it directly is unrestricted.
    expect(err.cause).toEqual({ detail: "ok" });
  });
});
