# Quickstart: Vault-scoped data — manual verification

Run in `npm run tauri dev`. Two real Obsidian vault folders (`VaultA`, `VaultB`) on disk. These cover the user stories + the Scenario D regression that motivated the feature. (Automated coverage is in the `node:sqlite` repo/migration/identity tests + jsdom hook tests; this is the live VaultWriter/Tauri check.)

## Setup

- Have (or create) two empty folders: `…/VaultA`, `…/VaultB`.
- Build is green: `npm run test`, `npm run lint`, `tsc`.

## A — Scenario D regression (the bug this feature fixes) · US1, FR-004/007

1. Connect **VaultA**. Create Domain "Math" → Course "Real Analysis" with a few milestones.
2. Dashboard + Courses show Real Analysis.
3. **Change vault to VaultB** (no restart). 
   - **Expect:** Dashboard + Courses immediately show **VaultB's** data (empty → onboarding/connect-clean state), **not** VaultA's Real Analysis. *(Before this feature: VaultA's courses lingered — the bug.)*
4. Create Domain "CS" → Course "Algorithms" in VaultB.
5. **Change back to VaultA.**
   - **Expect:** Real Analysis is back, intact; "Algorithms"/"CS" are absent. Lossless round-trip.

## B — New data belongs to the active vault · US2, FR-005

1. With VaultA active, create a Domain → it appears under A.
2. Switch to VaultB → that Domain is **not** listed. Switch back → it's there.

## C — Creation gating with no vault · US2, FR-006

1. Disconnect / start with no vault configured (or use a fresh profile).
2. Open **Domains** → shows "connect a vault first" guidance, **no** "New domain" button.
3. Open **Courses** → same gate (unchanged from 007).
4. Open **Dashboard** → connect-a-vault guidance; **not** a zero grid and **not** another vault's data.

## D — Folder rename/move recognition · US3, FR-001/010

1. Connect VaultA, create some data, quit the app.
2. On disk, **rename** `VaultA` → `VaultA-renamed` (or move it).
3. Start the app, connect the **new** location.
   - **Expect:** your VaultA data appears (recognized by the stored marker id) — **not** an empty vault.
4. (Recovery) Delete `.cic/vault.json` inside the vault, reconnect from the **same** path.
   - **Expect:** the marker is recreated and the data still appears (re-associated by recorded path).

## E — Upgrade adoption · US1 AS-4 / FR-008 / SC-004

> Simulates a pre-feature store (global data, no vault link).

1. With a store that has domains/courses created before this feature (or seed some with `vault_id` NULL via the test harness), launch the upgraded app.
2. On first connect of the configured vault, that pre-existing data is **adopted** into it and appears.
3. Connect a *second*, different vault → it starts **empty** (the legacy set went to the first vault only — no bleed).

## F — Marker is invisible & non-destructive · Constitution I / FR-009

1. Open the active vault in **Obsidian**.
   - **Expect:** no CIC marker shows in the file tree (it's in the ignored `.cic/` dot-folder); no stray Note/Course named like the marker.
2. Confirm your own notes/MOCs are untouched (the marker write never modifies `.md`).
3. In a file browser, confirm `…/<vault>/.cic/vault.json` exists and holds `{ "cicVaultMarker": 1, "id": "…" }`.

## Pass criteria

- A–F behave as described; the Scenario D stale-view bug is gone.
- Switching vaults refreshes every screen within ~1s, no restart (SC-005).
- No data loss across switches or rename (SC-001/003); pre-existing data adopted, none stranded (SC-004).
- Obsidian never shows the marker; no `.md` was altered by identity establishment.
