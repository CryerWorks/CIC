import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DbProvider } from "./providers/DbProvider";
import { VaultProvider } from "./providers/VaultProvider";
import { AIProvider } from "./providers/AIProvider";
import { SourceFilesProvider } from "../features/resources/SourceFilesProvider";
import type { SourceFiles } from "../features/resources/sourceFiles";
import { NotifierProvider } from "../notifications/NotifierProvider";
import type { Notifier } from "../notifications/notifier";
import { RAGProvider } from "./providers/RAGProvider";
import type { VectorStore } from "../ai/rag/vectorStore";
import { noopVectorStore } from "./providers/rag-test";
import type { FolderPicker } from "./providers/vault/picker";
import type { VaultConnector } from "./providers/vault/connect";
import { AppRoutes } from "./router";
import { migrate, type SqlExecutor, type SqlValue } from "../db";
import { NodeSqlExecutor } from "../db/adapters/node";
import { InMemorySecretStore, type SecretStore } from "../ai/secrets";
import { createProvider } from "../ai/adapters";

// Test support (not a test file). Renders the real route tree under a MemoryRouter wrapped in a
// DbProvider, with an injected in-memory node:sqlite executor — so UI tests exercise real
// persistence (research R2) without the Tauri runtime.

export async function makeReadyDb(): Promise<SqlExecutor> {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  return db;
}

/** A benign default `SourceFiles` for tests that don't exercise file import — `pickFile` cancels,
 *  `importFile` returns a deterministic fake path, `removeFiles` is a no-op (so the native dialog +
 *  `invoke` never run under jsdom). Tests that drive the picker pass their own via `sourceFiles`. */
const noopSourceFiles: SourceFiles = {
  pickFile: () => Promise.resolve(null),
  importFile: ({ resourceId, filename }) => Promise.resolve(`/store/resources/${resourceId}/${filename}`),
  removeFiles: () => Promise.resolve(),
};

/** A benign default `Notifier` for tests that don't exercise notifications — permission granted,
 *  `notify` a no-op. Tests that assert notification behavior pass their own via `notifier`. The
 *  app-wide `ReminderScheduler` is deliberately NOT mounted here (it's tested in isolation), so it
 *  never fires during unrelated component tests. */
const noopNotifier: Notifier = {
  isPermissionGranted: () => Promise.resolve(true),
  requestPermission: () => Promise.resolve("granted"),
  notify: () => Promise.resolve(),
};

/** Wrap an executor so `execute` rejects when the SQL matches `failOn` — to test optimistic
 *  reconcile (revert-on-failure). Reads still work. */
export function failingOn(db: SqlExecutor, failOn: RegExp): SqlExecutor {
  return {
    execute: (sql: string, params?: SqlValue[]) =>
      failOn.test(sql)
        ? Promise.reject(new Error("simulated write failure"))
        : db.execute(sql, params),
    select: (sql: string, params?: SqlValue[]) => db.select(sql, params),
    transaction: (fn) => db.transaction(fn),
  };
}

export function renderApp(opts: {
  initialEntries?: string[];
  initialize?: () => Promise<SqlExecutor>;
  /** Test seams forwarded to VaultProvider so a screen that gates on a ready vault (Domains,
   *  Dashboard, Courses) can be driven without the Tauri runtime. */
  connect?: VaultConnector;
  picker?: FolderPicker;
  /** Test seam for Feature 011 file import; defaults to a benign no-op fake. */
  sourceFiles?: SourceFiles;
  /** Test seam for Feature 014 notifications; defaults to a benign granted/no-op fake. */
  notifier?: Notifier;
  /** Test seams for Feature 016 AI layer. Defaults are network-free in-memory: the
   *  `InMemorySecretStore` (no OS keychain) + the real `createProvider` (will never be invoked
   *  unless a test seeds a config — the AI section is the only route that mounts AI consumers). */
  secretStore?: SecretStore;
  createProviderFn?: typeof createProvider;
  /** Test seam for Feature 017 RAG pipeline. Defaults to a no-op fake. */
  vectorStore?: VectorStore;
} = {}) {
  return render(
    <DbProvider initialize={opts.initialize ?? makeReadyDb}>
      <AIProvider
        secretStore={opts.secretStore ?? new InMemorySecretStore()}
        createProviderFn={opts.createProviderFn ?? createProvider}
      >
        <VaultProvider connect={opts.connect} picker={opts.picker}>
            <SourceFilesProvider sourceFiles={opts.sourceFiles ?? noopSourceFiles}>
              <NotifierProvider notifier={opts.notifier ?? noopNotifier}>
                <RAGProvider store={opts.vectorStore ?? noopVectorStore}>
                  <MemoryRouter initialEntries={opts.initialEntries ?? ["/"]}>
                    <AppRoutes />
                  </MemoryRouter>
                </RAGProvider>
            </NotifierProvider>
          </SourceFilesProvider>
        </VaultProvider>
      </AIProvider>
    </DbProvider>,
  );
}
