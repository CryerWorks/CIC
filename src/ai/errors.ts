/**
 * Provider error taxonomy (Feature 016 / Constitution II). The single error class adapters throw
 * and the router routes on. Drives the router's fallback walk (`retryable`) and the auth-failed
 * UI surfacing.
 *
 * Spine file. Full mapping rules in
 * [specs/016-ai-provider-layer/contracts/errors.md](../../specs/016-ai-provider-layer/contracts/errors.md).
 */

export type ProviderErrorKind =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "offline"
  | "unsupported"
  | "bad_response"
  | "cancelled"
  | "unknown";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly providerId: string;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    kind: ProviderErrorKind,
    providerId: string,
    message: string,
    retryable: boolean,
    cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.providerId = providerId;
    this.retryable = retryable;
    if (cause !== undefined) this.cause = cause;
  }
}

export function isProviderError(err: unknown): err is ProviderError {
  return err instanceof ProviderError;
}

export function isRetryable(err: unknown): boolean {
  return isProviderError(err) && err.retryable;
}

export function isAuthFailure(err: unknown): boolean {
  return isProviderError(err) && err.kind === "auth";
}

export function isCancellation(err: unknown): boolean {
  return isProviderError(err) && err.kind === "cancelled";
}
