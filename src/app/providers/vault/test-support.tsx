import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { DbProvider } from "../DbProvider";
import { VaultProvider } from "../VaultProvider";
import type { FolderPicker } from "./picker";
import type { VaultConnector, ConnectResult } from "./connect";
import { makeReadyDb } from "../../test-support";
import type { SqlExecutor } from "../../../db";
import type { Vault } from "../../../vault";
import { VaultReader } from "../../../vault/reader";
import { VaultWriter } from "../../../vault/writer";
import { NodeVaultFs } from "../../../vault/adapters/node";
import { InMemoryWriteLog } from "../../../vault/test-support";

// Test support (not a test file) for the vault-config feature. Wires a real NodeSqlExecutor
// (so persistence is real) with injectable fake picker/connector — Tauri-free.

/** A real-but-inert Vault handle for fakes — built without touching the filesystem (the
 *  constructors only store fields); tests never invoke its reader/writer. */
export function stubVault(): Vault {
  const fs = new NodeVaultFs();
  return {
    reader: new VaultReader(fs, "/__stub__"),
    writer: new VaultWriter(fs, "/__stub__", new InMemoryWriteLog()),
  };
}

export function readyResult(noteCount = 0): ConnectResult {
  return { ok: true, vault: stubVault(), noteCount };
}

export function unavailableResult(message = "vault unavailable"): ConnectResult {
  return { ok: false, error: new Error(message) };
}

/** A connector you control: map specific paths → results, with a fallback for the rest. */
export function fakeConnector(
  opts: { results?: Record<string, ConnectResult>; fallback?: ConnectResult } = {},
): VaultConnector {
  return (path) => Promise.resolve(opts.results?.[path] ?? opts.fallback ?? readyResult(0));
}

/** A picker that returns a fixed path (or `null` to simulate cancel). */
export function fakePicker(path: string | null): FolderPicker {
  return () => Promise.resolve(path);
}

export interface RenderVaultOptions {
  children: ReactNode;
  picker?: FolderPicker;
  connect?: VaultConnector;
  /** How to obtain the (migrated) store. Default: a fresh in-memory one. Pass a pre-seeded
   *  executor (e.g. with `vault.path` already set) to simulate a restart. */
  initialize?: () => Promise<SqlExecutor>;
  initialEntries?: string[];
}

export function renderWithVault({
  children,
  picker,
  connect,
  initialize = makeReadyDb,
  initialEntries = ["/"],
}: RenderVaultOptions) {
  return render(
    <DbProvider initialize={initialize}>
      <VaultProvider picker={picker} connect={connect}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </VaultProvider>
    </DbProvider>,
  );
}
