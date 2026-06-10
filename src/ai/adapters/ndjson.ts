/**
 * Minimal NDJSON parser (Feature 016 — used by the Ollama adapter). Reads newline-delimited JSON
 * from a `ReadableStream<Uint8Array>` and yields each parsed object. Private to
 * `src/ai/adapters/*`. Partial-chunk safe (research R3).
 *
 * A malformed line throws — the caller (adapter) translates to `ProviderError('bad_response', …)`.
 */

export async function* parseNdjsonStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) buf += decoder.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line.length === 0) continue;
        yield JSON.parse(line);
      }
      if (done) {
        const trailing = buf.trim();
        if (trailing.length > 0) {
          yield JSON.parse(trailing);
        }
        return;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}
