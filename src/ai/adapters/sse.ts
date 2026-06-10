/**
 * Minimal SSE parser (Feature 016 — used by the OpenAI-compatible and Anthropic adapters). Reads
 * the `data:` lines from a server-sent-events stream and yields their payload strings. The vendors
 * we target send only `data:` events (no `event:` / `id:` / `retry:`), so the parser ignores the
 * rest. ~30 LOC; no dependencies; private to `src/ai/adapters/*` (research R3).
 *
 * Robust to any chunking the underlying `ReadableStream` produces — partial-chunk handling carries
 * the trailing fragment across `read()` boundaries. Verified at 1 / 7 / 100-byte slicings in tests.
 */

/** Yields each `data:` line payload as a string, in stream order. A `data: [DONE]` line is
 *  yielded as the literal string `"[DONE]"` — caller decides when to stop. */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) buf += decoder.decode(value, { stream: true });
      // SSE events are separated by a blank line ("\n\n" or "\r\n\r\n").
      // Normalize CRLF to LF first to keep the splitter simple.
      buf = buf.replace(/\r\n/g, "\n");
      let i: number;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        for (const line of block.split("\n")) {
          if (line.startsWith("data: ")) {
            yield line.slice(6);
          } else if (line.startsWith("data:")) {
            yield line.slice(5);
          }
        }
      }
      if (done) {
        // Flush any trailing block that lacked a final blank line.
        if (buf.trim().length > 0) {
          for (const line of buf.split("\n")) {
            if (line.startsWith("data: ")) yield line.slice(6);
            else if (line.startsWith("data:")) yield line.slice(5);
          }
        }
        return;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore — the stream may already be closed/cancelled
    }
  }
}
