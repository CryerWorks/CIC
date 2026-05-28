# Data Model: App Shell, Navigation & Domains Management

**Feature**: 004-app-shell-domains · **Date**: 2026-05-27

This feature adds **no persisted tables** — Domains already exist in the Feature 003 schema. What it introduces is **UI/state models** and **additive repository functions**. Validation happens at the form boundary (zod) before the optimistic apply (research R4); the 003 layer re-validates on its own read/write path.

## Persisted entity (reference — owned by Feature 003, unchanged)

**`Domain`** — a user-defined top-level subject area.
- `id: string` (UUID, app-generated) · `name: string` (required, unique) · `color: string` (hex)
- Schema: `DomainSchema` in `src/db/models/domain.ts`. **No change** to the table or model in this feature.

## UI / state models (new, not persisted)

### `DbState` — the store lifecycle the UI observes
A discriminated union exposed by `DbProvider` via `useDb()` / context:

| Variant | Shape | Meaning |
|---|---|---|
| loading | `{ status: "loading" }` | store opening/migrating |
| error | `{ status: "error"; error: Error }` | open/migrate failed — show the message |
| ready | `{ status: "ready"; db: SqlExecutor }` | usable; screens render |

- Transitions: `loading → ready` (success) or `loading → error` (failure). Terminal once resolved (no retry path in this feature; a reload re-runs init).
- `AppShell` renders the loading/error gate; child routes only mount under `ready` (FR-003 / SC-003).

### `DomainFormInput` — create/edit form value
- `name: string` — trimmed; **required**, non-empty/non-whitespace; max length **60**; **unique** among existing Domains (case-insensitive compare to avoid near-dupes), excluding the row being edited.
- `color: string` — must be one of the five palette hexes (`--color-domain-1..5`); defaults to the first palette color on a new Domain.

**Validation rules (zod, at the form boundary):**
- `name`: `z.string().trim().min(1, "Name is required").max(60, "Name is too long")`, plus a uniqueness check against the current list (not expressible in zod alone — enforced in `useDomains` before persist; the 003 `domains.name UNIQUE` constraint is the backstop).
- `color`: `z.enum([...palette hexes])`.
- A rejected validation **never** mutates the list and shows an inline, field-associated message (FR-008/FR-012).

### `NavDestination` — a sidebar entry (static config)
- `path: string` · `label: string` · `icon?` · `implemented: boolean`.
- Drives the sidebar and the route table. Initial set: Dashboard (`/`), Domains (`/domains`, implemented), Courses (`/courses`), Review (`/review`), and Style guide (`/style`, the existing reference). Only Domains is implemented; others render `Placeholder`.

## Repository additions (Feature 003 `src/db/repositories/domains.ts` — additive, no schema change)

| Function | Signature | Notes |
|---|---|---|
| `updateDomain` | `(db, id: string, patch: { name: string; color: string }) => Promise<Domain>` | UPDATE name/color by id; returns the parsed row. Duplicate name → the `UNIQUE` constraint rejects (surfaced as a validation error). |
| `deleteDomain` | `(db, id: string) => Promise<void>` | DELETE by id. The schema's `ON DELETE CASCADE` removes the Domain's campaigns/courses (and their descendants) — the UI confirms this first (FR-010). |

Existing `createDomain` / `getDomain` / `listDomains` are reused as-is.

## State transitions

- **Domain lifecycle (this feature):** *created* → *edited\** → *deleted*. No status field on a Domain; these are plain CRUD operations, each optimistic with revert-on-failure (R4).
- **DbState:** as above — `loading` → `ready | error`.

## Not in this feature

No new tables, no migration (the 003 schema already has `domains`). No vault/MOC linkage, no campaigns/courses screens (only the cascade *warning* references them). No persisted UI state (active route lives in the URL hash; nothing about navigation is stored).
