# Contract: DbProvider, useDb(), and the Route Table

**Feature**: 004-app-shell-domains · **Date**: 2026-05-27

The UI-layer surface this feature exposes. Screens (this feature and 005+) depend on **this**, never on `initDatabase`, the adapters, or raw SQL. Constitution IV: the provider is the React-tree composition root; the hook is the thin accessor.

## `DbProvider` — `src/app/providers/DbProvider.tsx`

```ts
export type DbState =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "ready"; db: SqlExecutor };

export interface DbProviderProps {
  children: React.ReactNode;
  /** Test seam: how to obtain a (migrated) executor. Defaults to the 003 initDatabase. */
  initialize?: () => Promise<SqlExecutor>;
}

export function DbProvider(props: DbProviderProps): JSX.Element;
```

- On mount: state = `loading`; awaits `initialize()` (default `initDatabase` from `src/db`); resolves to `ready` (with the executor) or `error` (with the thrown error). Errors are **surfaced, never swallowed** (FR-003).
- Provides `DbState` over React context. Production wraps the whole app; tests wrap the subtree under test and inject `initialize` returning a `NodeSqlExecutor` (migrated) — keeps Tauri out of jsdom and lets tests drive each state (R2/R3).

## `useDb()` — accessor hook

```ts
/** Returns the live executor. MUST be called only under a ready provider (i.e. from a screen
 *  rendered inside AppShell's ready gate). Throws if the provider is missing or not ready. */
export function useDb(): SqlExecutor;

/** Lower-level: the raw state, for the gate component (AppShell) that renders loading/error. */
export function useDbState(): DbState;
```

- `useDb()` throwing outside `ready` keeps its return type non-nullable, so screen code never null-checks the executor. `AppShell` uses `useDbState()` to render the gate; screens use `useDb()`.

## `AppShell` gate — `src/app/layout/AppShell.tsx`

- `loading` → a centered loading Panel ("Opening your local store…").
- `error` → an error Panel/Callout(danger) with `error.message` (no stack, no secrets) and guidance; **no routed content** renders.
- `ready` → sidebar + topbar + `<Outlet/>`.

## Route table — `src/app/router.tsx` (HashRouter)

| Path | Screen | Implemented | Nav label |
|---|---|---|---|
| `/` | `DashboardRoute` | placeholder | Dashboard |
| `/domains` | `DomainsRoute` | ✅ this feature | Domains |
| `/courses` | `CoursesRoute` | placeholder | Courses |
| `/review` | `ReviewRoute` | placeholder | Review |
| `/style` | `StyleGuide` (existing) | ✅ (design ref) | Style guide |
| `*` | redirect → `/` | — | — |

- All routes are children of the `AppShell` layout route, so the shell + DB gate wrap every screen.
- Placeholders render the shared `Placeholder` ("Coming in a later feature") so the IA is real and navigable now (FR-004).
- Tests mount the route tree under `MemoryRouter` at a chosen `initialEntries` to assert the correct screen renders per path.

## Stability

`DbState`, the `DbProvider` props (incl. the `initialize` seam), `useDb()`/`useDbState()`, and the route paths are the public surface. Adding a route or a destination is additive; changing `DbState`'s shape or `useDb()`'s contract is breaking.
