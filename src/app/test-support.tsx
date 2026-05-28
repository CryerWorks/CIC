import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DbProvider } from "./providers/DbProvider";
import { VaultProvider } from "./providers/VaultProvider";
import { AppRoutes } from "./router";
import { migrate, type SqlExecutor, type SqlValue } from "../db";
import { NodeSqlExecutor } from "../db/adapters/node";

// Test support (not a test file). Renders the real route tree under a MemoryRouter wrapped in a
// DbProvider, with an injected in-memory node:sqlite executor — so UI tests exercise real
// persistence (research R2) without the Tauri runtime.

export async function makeReadyDb(): Promise<SqlExecutor> {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  return db;
}

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
} = {}) {
  return render(
    <DbProvider initialize={opts.initialize ?? makeReadyDb}>
      <VaultProvider>
        <MemoryRouter initialEntries={opts.initialEntries ?? ["/"]}>
          <AppRoutes />
        </MemoryRouter>
      </VaultProvider>
    </DbProvider>,
  );
}
