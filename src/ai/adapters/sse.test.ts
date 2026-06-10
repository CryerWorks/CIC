import { describe, it, expect } from "vitest";
import { parseSseStream } from "./sse";
import { streamChunks, sliceBytes } from "../testing/fakeFetch";

const SAMPLE =
  'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
  'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
  "data: [DONE]\n\n";

async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const x of it) out.push(x);
  return out;
}

function toStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  const it = streamChunks(chunks)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await it.next();
      if (done) controller.close();
      else if (value) controller.enqueue(value);
    },
  });
}

describe("parseSseStream", () => {
  it("yields data: payloads in order", async () => {
    const stream = toStream(sliceBytes(SAMPLE, SAMPLE.length));
    const lines = await collect(parseSseStream(stream));
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0])).toEqual({ choices: [{ delta: { content: "Hel" } }] });
    expect(lines[2]).toBe("[DONE]");
  });

  it("handles partial-chunk slicing at 1-byte boundaries", async () => {
    const stream = toStream(sliceBytes(SAMPLE, 1));
    const lines = await collect(parseSseStream(stream));
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("[DONE]");
  });

  it("handles partial-chunk slicing at 7-byte boundaries", async () => {
    const stream = toStream(sliceBytes(SAMPLE, 7));
    const lines = await collect(parseSseStream(stream));
    expect(lines).toHaveLength(3);
  });

  it("handles partial-chunk slicing at 100-byte boundaries", async () => {
    const stream = toStream(sliceBytes(SAMPLE, 100));
    const lines = await collect(parseSseStream(stream));
    expect(lines).toHaveLength(3);
  });

  it("normalizes CRLF to LF", async () => {
    const crlf = SAMPLE.replace(/\n/g, "\r\n");
    const stream = toStream(sliceBytes(crlf, 7));
    const lines = await collect(parseSseStream(stream));
    expect(lines).toHaveLength(3);
  });

  it("ignores non-`data:` lines (event:, id:, retry:, comments)", async () => {
    const noisy =
      "event: foo\n" +
      'data: {"a":1}\n' +
      "\n" +
      ": this is a comment\n" +
      'data: {"b":2}\n' +
      "\n";
    const stream = toStream(sliceBytes(noisy, 5));
    const lines = await collect(parseSseStream(stream));
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0])).toEqual({ a: 1 });
    expect(JSON.parse(lines[1])).toEqual({ b: 2 });
  });

  it("flushes a trailing block that lacked a final blank line", async () => {
    const tail = 'data: {"x":1}\n\ndata: {"y":2}\n';
    const stream = toStream(sliceBytes(tail, tail.length));
    const lines = await collect(parseSseStream(stream));
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1])).toEqual({ y: 2 });
  });
});
