/**
 * Adapter test helper (Feature 016, research R6). Builds a `fetch`-shaped function that returns
 * controllable `Response` objects backed by `ReadableStream`s. Production adapters use
 * `globalThis.fetch`; tests inject this fake. No network, no MSW dep — about 80 LOC of inline
 * stream construction.
 *
 * Lives at `src/ai/testing/` (deep), exported only for tests. Test files outside this directory
 * may import these helpers freely.
 */

import type { SecretStore } from "../secrets";

/** Single-call expectation for the fake. */
export interface FakeFetchSpec {
  /** Optional URL matcher. Strict equality (with trailing slash normalization) for strings,
   *  RegExp test for regexes. If omitted, any URL matches. */
  expectUrl?: string | RegExp;
  /** Optional method matcher. Defaults to no check. */
  expectMethod?: "GET" | "POST";
  /** Optional header matcher. Each key MUST match (case-insensitive); regex values regex-match. */
  expectHeaders?: Record<string, string | RegExp>;
  /** Optional body matcher (after JSON.parse for application/json bodies). */
  expectBody?: (body: unknown) => void;
  /** Either a complete response or a streamed body builder. */
  response?:
    | { status?: number; body?: string | object; headers?: Record<string, string> }
    | { status?: number; stream: AsyncIterable<Uint8Array>; headers?: Record<string, string> };
  /** If set, fetch rejects with the corresponding error type. */
  reject?: "AbortError" | "TypeError" | Error;
}

/** Returns a fetch-shaped function honoring the provided spec(s). Each call advances through
 *  the spec list (in order); calls past the end throw. */
export function fakeFetch(specs: FakeFetchSpec | FakeFetchSpec[]): typeof fetch {
  const queue = Array.isArray(specs) ? [...specs] : [specs];
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const spec = queue.shift();
    if (!spec) throw new Error("fakeFetch: unexpected extra call");

    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = normalizeHeaders(init?.headers);

    // Match URL
    if (typeof spec.expectUrl === "string") {
      if (stripTrailingSlash(url) !== stripTrailingSlash(spec.expectUrl)) {
        throw new Error(`fakeFetch: URL mismatch (got ${url}, expected ${spec.expectUrl})`);
      }
    } else if (spec.expectUrl instanceof RegExp) {
      if (!spec.expectUrl.test(url)) {
        throw new Error(`fakeFetch: URL did not match ${spec.expectUrl} (got ${url})`);
      }
    }
    if (spec.expectMethod && method !== spec.expectMethod) {
      throw new Error(`fakeFetch: method mismatch (got ${method}, expected ${spec.expectMethod})`);
    }
    if (spec.expectHeaders) {
      for (const [k, v] of Object.entries(spec.expectHeaders)) {
        const got = headers[k.toLowerCase()];
        if (got === undefined) throw new Error(`fakeFetch: missing header ${k}`);
        if (v instanceof RegExp) {
          if (!v.test(got)) throw new Error(`fakeFetch: header ${k} mismatch (got ${got}, expected ${v})`);
        } else if (got !== v) {
          throw new Error(`fakeFetch: header ${k} mismatch (got ${got}, expected ${v})`);
        }
      }
    }
    if (spec.expectBody) {
      const raw = init?.body;
      let parsed: unknown = raw;
      if (typeof raw === "string") {
        try {
          parsed = JSON.parse(raw);
        } catch {
          // leave as string
        }
      }
      spec.expectBody(parsed);
    }

    // Wire AbortSignal: if pre-aborted, reject immediately.
    if (init?.signal?.aborted) {
      throw makeAbortError();
    }

    if (spec.reject) {
      if (spec.reject === "AbortError") throw makeAbortError();
      if (spec.reject === "TypeError") throw new TypeError("Failed to fetch");
      throw spec.reject;
    }

    const r = spec.response ?? { status: 200 };
    const status = r.status ?? 200;
    const respHeaders = r.headers ?? { "content-type": "application/json" };

    if ("stream" in r && r.stream) {
      const body = streamFromAsyncIterable(r.stream, init?.signal);
      return new Response(body, { status, headers: respHeaders });
    }
    if ("body" in r) {
      const bodyText = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
      return new Response(bodyText, { status, headers: respHeaders });
    }
    return new Response(null, { status, headers: respHeaders });
  }) as typeof fetch;
}

/** Builds a `ReadableStream<Uint8Array>` from a sequence of chunks. */
export function streamChunks(
  chunks: ReadonlyArray<Uint8Array | string>,
  gapMs = 0,
): AsyncIterable<Uint8Array> {
  return (async function* () {
    for (const chunk of chunks) {
      if (gapMs > 0) await new Promise((resolve) => setTimeout(resolve, gapMs));
      yield typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    }
  })();
}

/** Slices a string into N-byte Uint8Array chunks for partial-chunk testing. */
export function sliceBytes(s: string, n: number): Uint8Array[] {
  const buf = new TextEncoder().encode(s);
  const out: Uint8Array[] = [];
  for (let i = 0; i < buf.length; i += n) {
    out.push(buf.slice(i, i + n));
  }
  return out;
}

// ────────────────────────── helpers ──────────────────────────

function normalizeHeaders(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (h instanceof Headers) {
    h.forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
  } else if (Array.isArray(h)) {
    for (const [k, v] of h) out[k.toLowerCase()] = v;
  } else {
    for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
  }
  return out;
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

function makeAbortError(): Error {
  // Replicate the shape native fetch produces on AbortSignal.abort().
  const e = new Error("The user aborted a request.");
  e.name = "AbortError";
  return e;
}

/** Wraps an AsyncIterable<Uint8Array> as a ReadableStream<Uint8Array>, honoring AbortSignal. */
function streamFromAsyncIterable(
  iter: AsyncIterable<Uint8Array>,
  signal?: AbortSignal | null,
): ReadableStream<Uint8Array> {
  const it = iter[Symbol.asyncIterator]();
  let aborted = false;
  const onAbort = () => {
    aborted = true;
  };
  if (signal && !signal.aborted) signal.addEventListener("abort", onAbort, { once: true });

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (aborted || signal?.aborted) {
        controller.error(makeAbortError());
        return;
      }
      try {
        const { value, done } = await it.next();
        if (aborted || signal?.aborted) {
          controller.error(makeAbortError());
          return;
        }
        if (done) {
          controller.close();
        } else if (value) {
          controller.enqueue(value);
        }
      } catch (e) {
        controller.error(e);
      }
    },
    cancel() {
      aborted = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      void it.return?.();
    },
  });
}

// ────────────────────────── re-exports ──────────────────────────

// A convenience type re-export so tests can import SecretStore + the in-memory store from a
// single location.
export type { SecretStore };
export { InMemorySecretStore } from "../secrets";
