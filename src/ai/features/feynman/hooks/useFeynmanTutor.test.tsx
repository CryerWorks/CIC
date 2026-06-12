// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { useFeynmanTutor } from "./useFeynmanTutor";
import { DbProvider } from "../../../../app/providers/DbProvider";
import { AIProvider } from "../../../../app/providers/AIProvider";
import { VaultProvider } from "../../../../app/providers/VaultProvider";
import { RAGProvider } from "../../../../app/providers/RAGProvider";
import { noopVectorStore } from "../../../../app/providers/rag-test";
import { InMemorySecretStore } from "../../../../ai/secrets";
import { createProvider } from "../../../../ai/adapters";
import { migrate, type SqlExecutor } from "../../../../db";
import { NodeSqlExecutor } from "../../../../db/adapters/node";

async function makeReadyDb(): Promise<SqlExecutor> {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  return db;
}

function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <DbProvider initialize={makeReadyDb}>
        <AIProvider secretStore={new InMemorySecretStore()} createProviderFn={createProvider}>
          <VaultProvider>
            <RAGProvider store={noopVectorStore}>
              {children}
            </RAGProvider>
          </VaultProvider>
        </AIProvider>
      </DbProvider>
    );
  };
}

describe("useFeynmanTutor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns initial empty state", () => {
    const { result } = renderHook(() => useFeynmanTutor(), {
      wrapper: createWrapper(),
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isActive).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sendMessage without vault sets error", async () => {
    const { result } = renderHook(() => useFeynmanTutor(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.error).toContain("vault");
  });

  it("reset clears messages and error", () => {
    const { result } = renderHook(() => useFeynmanTutor(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });

  it("summarizeGaps returns empty when no conversation", async () => {
    const { result } = renderHook(() => useFeynmanTutor(), {
      wrapper: createWrapper(),
    });

    const gaps = await act(async () => result.current.summarizeGaps());
    expect(gaps).toHaveLength(0);
  });

  it("saveGaps returns 0 when no vault", async () => {
    const { result } = renderHook(() => useFeynmanTutor(), {
      wrapper: createWrapper(),
    });

    const count = await act(async () =>
      result.current.saveGaps([{ text: "Test gap" }], {
        type: "session-writeup",
        notePath: "session.md",
      }),
    );
    expect(count).toBe(0);
  });

  it("isActive reflects tutor state", () => {
    const { result } = renderHook(() => useFeynmanTutor(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isActive).toBe(false);
  });
});
