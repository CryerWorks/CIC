# Implementation Report — Phase 6 (Polish): Vault Rescan Gap Reconciliation

## Summary

Implemented T031 (vault rescan gap reconciliation) and T032 ("Refresh gaps" button) for the Feynman/Socratic Tutor feature. This completes Phase 6 — the Feynman gaps table can now be reconciled against the user's vault notes when checklist items are marked `- [x]` in Obsidian.

## Files Changed

| File | Change | Lines Added | Lines Removed |
|------|--------|-------------|---------------|
| `src/db/repositories/feynmanGaps.ts` | Implemented `reconcileCompleted()` with vault scanning logic + `extractCompletedChecklistItems()` helper | +96 | -11 |
| `src/db/repositories/feynmanGaps.test.ts` | Replaced placeholder test with 5 new tests covering reconciliation scenarios | +141 | -5 |
| `src/features/dashboard/GapsTile.tsx` | Added `onRefresh` callback prop + small refresh button | +12 | -4 |
| `src/features/dashboard/useDashboard.ts` | Added optional `refreshKey` parameter to trigger re-fetch | +2 | -1 |
| `src/features/dashboard/DashboardRoute.tsx` | Added refresh handler wiring VaultReader to `reconcileCompleted` + `refreshKey` state | +22 | -3 |

**Total: 5 files changed, ~273 lines added, ~24 lines removed**

## T031 — reconcileCompleted Implementation

### Design

The `reconcileCompleted` function in `feynmanGaps.ts` was changed from a placeholder returning 0 to a fully implemented vault-scanner. Key design decisions:

1. **Callback-based vault decoupling**: The function accepts a `readNoteBody: (notePath: string) => Promise<string | null>` callback instead of depending on VaultReader directly. This keeps the DB repository layer cleanly separated from the vault layer (Constitution IV).

2. **File grouping**: Open gaps are grouped by `note_path` to read each vault file at most once, avoiding redundant I/O.

3. **Section-scoped matching**: The `extractCompletedChecklistItems()` helper finds the `## Gaps from Feynman` section in the note body, then extracts `- [x]` checklist item text. Items outside this section are ignored — preventing false matches from unrelated checkboxes.

4. **Safe failure**: If a file can't be read (deleted, moved, or path error), the callback returns `null` and that file's gaps are skipped. No crashes.

### Algorithm

1. SELECT all open gaps for the vault
2. Group gaps by `note_path`
3. For each file, read body via callback → extract `- [x]` texts from the `## Gaps from Feynman` section → match against gaps for that note_path
4. UPDATE matched gap IDs to `status = 'completed'` in a single batch query
5. Return count of updated rows

### Test Coverage

- No open gaps → returns 0
- Gaps with matching checklist items → updated, correct count
- Gaps whose file can't be read → skipped
- Completed items outside the Gaps section → not matched
- Multiple gaps in same file → correct partial update
- Vault scoping → only affects the specified vault

## T032 — "Refresh gaps" Button

### Design

The refresh button follows the existing dashboard composition patterns:

1. **GapsTile**: Accepts optional `onRefresh` prop. Renders a small `↻` button in the tile header when the callback is provided. Styled with `text-text-dim` and `hover:text-text` to match the existing design language.

2. **DashboardView**: Maintains a `refreshKey` state. The `handleRefreshGaps` callback uses `useVault()` to get the vault reader, wires it as the `readNoteBody` callback to `reconcileCompleted`, then increments `refreshKey` to trigger re-fetch.

3. **useDashboard**: Accepts an optional `refreshKey` parameter added to the `useEffect` dependency array. When the key changes, all dashboard data (including gap counts) is re-fetched.

### User Flow

1. User marks knowledge gaps as `- [x]` in Obsidian (under `## Gaps from Feynman`)
2. User clicks the ↻ button on the "Gaps to Chase" dashboard tile
3. `reconcileCompleted` scans the vault files, matches completed items, updates DB
4. Dashboard re-fetches gap counts → tile updates with the new count

## Quality Gate Results

| Gate | Result |
|------|--------|
| All tests pass | ✅ 690 passed (124 test files, +5 new gap reconciliation tests) |
| Linter passes (`npm run lint`) | ✅ Clean (no output) |
| Type checks pass (`npx tsc --noEmit`) | ✅ Clean (no output) |
| No debug artifacts | ✅ No console.log/print/dbg! artifacts |
| No TODO/FIXME/HACK left | ✅ None introduced |
| All public APIs have explicit type signatures | ✅ `reconcileCompleted` has full type annotations for `db`, `vaultId`, and `readNoteBody` callback parameter; `GapsTile` `onRefresh` is typed as `() => void` optional |

## Design Decisions and Rationale

1. **Callback over direct VaultReader dependency**: The existing `reconcileCompleted` placeholder docstring noted it "belongs in the feature layer with VaultReader." Using a callback keeps it in the repo layer as specified while maintaining clean separation of concerns. The feature layer (DashboardView) wires the VaultReader at the call site.

2. **Section-scoped matching over raw grep**: Checking `- [x]` only within the `## Gaps from Feynman` section prevents false positives from other checklist items in the vault note (e.g., a todo list in a different section).

3. **Batch UPDATE with parameterized IN clause**: A single SQL update for all matched gaps is more efficient than per-row updates. The parameterized `IN (...)` clause prevents SQL injection while allowing variable-length gap lists.

4. **refreshKey pattern over imperative reload**: Adding `refreshKey` to useDashboard's deps follows React's declarative data-fetching pattern. The hook re-runs its effect whenever the key changes, naturally handling the reload without imperative reload functions.

## Limitations / Known Issues

- **No automatic reconciliation**: The refresh is manual (button click). An automatic polling or vault-watch mechanism is a future enhancement.
- **Text-based matching**: Gap items are matched by exact text equality. If the user edits the gap text in Obsidian without the `- [x]`, it won't match the DB record. This is intentional — the vault is the canonical source, and the DB is a mirror.
- **Case-sensitive heading**: The `## Gaps from Feynman` heading match is case-sensitive. This matches the Feynman Tutor's output convention and prevents unexpected matches from user-written headings.
