import { describe, it, expect } from "vitest";
import { parseNdjsonStream } from "./ndjson";
import { streamChunks, sliceBytes } from "../testing/fakeFetch";

const SAMPLE =
  '{"model":"llama3.2","message":{"role":"assistant","content":"He"},"done":false}\n' +
  '{"model":"llama3.2","message":{"role":"assistant","content":"llo"},"done":false}\n' +
  '{"model":"llama3.2","done":true}\n';

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
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

describe("parseNdjsonStream", () => {
  it("yields parsed objects in order", async () => {
    const stream = toStream(sliceBytes(SAMPLE, SAMPLE.length));
    const objs = (await collect(parseNdjsonStream(stream))) as Array<{
      done: boolean;
      message?: { content: string };
    }>;
    expect(objs).toHaveLength(3);
    expect(objs[0].message?.content).toBe("He");
    expect(objs[2].done).toBe(true);
  });

  it("handles partial-chunk slicing at 1-byte boundaries", async () => {
    const stream = toStream(sliceBytes(SAMPLE, 1));
    const objs = await collect(parseNdjsonStream(stream));
    expect(objs).toHaveLength(3);
  });

  it("handles partial-chunk slicing at 7-byte boundaries", async () => {
    const stream = toStream(sliceBytes(SAMPLE, 7));
    const objs = await collect(parseNdjsonStream(stream));
    expect(objs).toHaveLength(3);
  });

  it("handles partial-chunk slicing at 100-byte boundaries", async () => {
    const stream = toStream(sliceBytes(SAMPLE, 100));
    const objs = await collect(parseNdjsonStream(stream));
    expect(objs).toHaveLength(3);
  });

  it("flushes a trailing object lacking a final newline", async () => {
    const noTrailingNewline = '{"a":1}\n{"b":2}';
    const stream = toStream(sliceBytes(noTrailingNewline, 5));
    const objs = await collect(parseNdjsonStream(stream));
    expect(objs).toHaveLength(2);
    expect(objs[1]).toEqual({ b: 2 });
  });

  it("malformed line throws (adapter translates to bad_response)", async () => {
    const bad = '{"ok":1}\n{not json}\n';
    const stream = toStream(sliceBytes(bad, 20));
    await expect(collect(parseNdjsonStream(stream))).rejects.toThrow(/JSON/);
  });

  it("skips empty lines", async () => {
    const padded = '\n{"x":1}\n\n\n{"y":2}\n\n';
    const stream = toStream(sliceBytes(padded, 3));
    const objs = await collect(parseNdjsonStream(stream));
    expect(objs).toHaveLength(2);
    expect(objs).toEqual([{ x: 1 }, { y: 2 }]);
  });
});
