# Contract: Error Taxonomy

**File**: `src/ai/errors.ts` (spine). The single error type adapters throw and the router routes on.

## TypeScript shape

```ts
export type ProviderErrorKind =
  | 'auth'          // missing / invalid / revoked key — surface re-auth (not retryable)
  | 'rate_limit'    // 429-style — retryable (backoff or fallback)
  | 'timeout'       // request exceeded deadline — retryable
  | 'offline'       // ECONNREFUSED / network unreachable — retryable
  | 'unsupported'   // capability absent / lockdown blocked — route elsewhere (retryable as a fallback trigger; the lockdown variant marks NOT retryable to stop the walk)
  | 'bad_response'  // vendor returned malformed / unparseable payload — not retryable
  | 'cancelled'     // caller aborted — not retryable (and surfaced quietly)
  | 'unknown';      // catch-all — not retryable, surface loudly

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly providerId: string;
  readonly retryable: boolean;
  readonly cause?: unknown;
  constructor(kind: ProviderErrorKind, providerId: string, message: string, retryable: boolean, cause?: unknown);
}

export function isRetryable(err: unknown): boolean;       // true iff err is a ProviderError with .retryable === true
export function isAuthFailure(err: unknown): boolean;     // true iff err.kind === 'auth'
export function isCancellation(err: unknown): boolean;    // true iff err.kind === 'cancelled'
```

## Mapping rules (adapter → ProviderError)

Each adapter MUST translate native failures using these rules. Tests assert the mapping per-adapter via the shared contract suite.

| Condition | Kind | Retryable | Notes |
|---|---|---|---|
| HTTP `401` / `403` | `auth` | **false** | Surface re-auth event. NEVER include the API key in the message. |
| HTTP `429` | `rate_limit` | true | `Retry-After` header MAY be parsed and surfaced on the error (`.cause`); the router currently ignores it but the test suite reads it. |
| HTTP `408` / fetch timeout / configured deadline | `timeout` | true | The adapter's deadline (env-configurable later; default 60 s for chat, 30 s for embed in v1). |
| `ECONNREFUSED` / `getaddrinfo ENOTFOUND` / `TypeError: Failed to fetch` (network error) | `offline` | true | For Ollama: the message MUST mention the baseUrl, so the user understands "is the runtime running?". |
| HTTP `404` on the model (Ollama-specific) OR vendor "model not found" | `unsupported` | true | Retryable so the router walks to the fallback. |
| Vendor returns valid HTTP but the body cannot be parsed (malformed SSE, missing fields, etc.) | `bad_response` | **false** | A data error — retrying won't help. |
| `DOMException` with `name === 'AbortError'` (signal aborted) | `cancelled` | **false** | The router stops the fallback walk. |
| Lockdown gate fires inside the router (not an adapter) | `unsupported` | **false** | Special-cased: this is the only `unsupported` that is NOT retryable, because retrying any provider still won't fix lockdown. |
| HTTP `500..599` | `unknown` | **false** in v1 | A vendor-server bug; retrying isn't safe without more info. (May be loosened to `retryable: true` in a future amendment if observed-in-practice transient.) |
| Anything else | `unknown` | **false** | Don't paper over surprises. |

## Construction discipline

- The `message` MUST be human-readable and SAFE TO LOG. It MUST NOT contain the API key, any header value beginning with `sk-` / `Bearer …` / `x-api-key`, or any request/response body whose generating call had `containsVaultContent: true`.
- `cause` MAY contain a raw Error (e.g., the original `TypeError` from fetch) BUT the adapter MUST scrub any header values before passing them. A test asserts `JSON.stringify(err)` contains no `apiKey` / `secret` / `Authorization` / `Bearer ` substrings.
- The constructor takes `retryable` explicitly so each call site documents the intent at the throw site — no implicit "lookup table" indirection.

## Router consumption (forward-reference)

The router walks the fallback chain (see [router.md](router.md) §"Resolution & dispatch") according to these rules:

- `retryable === true` → walk to `RoleTarget.fallback` and retry the call.
- `retryable === false` → surface to the caller. Emit an `ai:auth-failed` app event if `kind === 'auth'` (FR-021).
- `kind === 'cancelled'` → surface without emitting any event.

## Test surface (`src/ai/errors.test.ts`)

- Constructor sets all five fields correctly.
- `isRetryable` / `isAuthFailure` / `isCancellation` predicates return correctly for each kind.
- Serializing (`JSON.stringify`, `.toString()`) does NOT leak `.cause` if `.cause` was constructed with a "tainted" object — i.e., test that we use a redaction helper before assigning to `.cause`.
- Each adapter's mapping is verified by the shared contract suite, not here.
