# Quickstart: Course Authoring & MOC Materialization

**Feature**: 007-course-moc | **Date**: 2026-05-28

The automated suite (Vitest) covers the pure MOC module and the sync layer over a temp vault. This quickstart is the **manual runtime check** in the real Tauri shell — the part the unit tests can't exercise (the live vault, the real `VaultWriter`, Obsidian round-trip). Run it after `npm run tauri dev`.

## Prerequisites
- A connected vault (Feature 006). If none, the Courses screen should guide you to `/vault` first — verify that guidance, then connect a throwaway test vault folder.
- At least one Domain exists (create one on `/domains` if not).
- Optional: open the same vault folder in Obsidian to watch files appear/update live.

## Scenario A — Create a Course → MOC appears (US1 / SC-001, SC-004)
1. Go to **Courses**. With no courses, confirm the empty state + "New course".
2. Create a course: title `Real Analysis`, Domain `Mathematics`, no campaign, capability paragraph "Rigorously work with limits, continuity, and convergence.", and two milestones: `Define a limit` (todo), `Prove continuity` (in-progress).
3. Save. **Expect**: the course appears in the list under its Domain within ~2s.
4. In the vault folder (or Obsidian), open `Courses/Real Analysis.md`. **Expect**:
   - Frontmatter with `cic-type: course`, a `cic-id`, `title`, `domain`, `campaign: null`.
   - `## Capability` with your paragraph; `## Milestones` with two task lines (`[ ]` and `[/]`), the HTML-comment ids hidden in Obsidian reading view.
   - Empty `## Resources`, `## Active Projects`, `## Recent Sessions`, `## Notes` sections and a `## Reflections` heading.
   - It renders as a clean document with **no Dataview / no plugin**.

## Scenario B — Edit in-app preserves my own writing (US2 / SC-002)
1. In Obsidian, under `## Reflections` in that MOC, type a paragraph: "My own note — do not touch." Save in Obsidian.
2. Back in the app, edit the course: rename milestone `Define a limit` → `Define a limit rigorously`, add a third milestone `State the IVT`. Save.
3. Reopen the MOC. **Expect**: the milestone text updated, the third milestone present, and your Reflections paragraph **still there, unchanged**.

## Scenario C — Drift is surfaced, not clobbered (US2-AS2 / SC-005)
1. In Obsidian, edit the capability paragraph *inside the markers* (e.g. add a sentence). Save in Obsidian.
2. In the app, change something on that course and Save. **Expect**: the app reports the MOC changed externally (a drift notice), and does **not** silently overwrite.
3. Choose **Reload & reapply**. **Expect**: the save now succeeds; the file keeps your external sentence where it doesn't conflict and re-stamps the managed sections. No content lost.

## Scenario D — Edit the MOC in Obsidian → app catches up (US3 / SC-003)
1. Close or background the app. In Obsidian, on the same MOC: edit the capability paragraph and add a new milestone line by hand, e.g. `- [ ] Sketch epsilon-delta proofs` (no id comment needed).
2. Return to the app and trigger **Rescan vault** (or reopen the app). **Expect**: the course's capability matches the file and the new milestone appears in the list (a fresh id was minted for the hand-added line).

## Scenario E — Import a hand-authored MOC (US3-AS2 / SC-006)
1. In the vault, hand-create `Courses/Topology.md` with valid frontmatter (`cic-type: course`, a fresh `cic-id` like a UUID, `title: Topology`, `domain: Mathematics`, `campaign: null`) and a `## Milestones` block with one `- [ ]` line.
2. In the app, **Rescan vault**. **Expect**: a `Topology` course appears under `Mathematics`. Create the file with `domain: Geometry` (a domain that doesn't exist) instead → expect a new `Geometry` Domain to be auto-created on rescan.

## Scenario F — Non-CIC files are ignored
1. Put a plain `Note.md` (no CIC frontmatter) anywhere in the vault.
2. **Rescan vault**. **Expect**: no Course is created from it; no error.

## Pass criteria
- A/B/C/D/E/F all behave as described.
- At no point is any vault file deleted, truncated, or has user-owned content overwritten.
- Every MOC remains clean, human-readable Markdown in plain Obsidian.

> Note: live file-watching is out of scope — read-back happens on app open / explicit Rescan, not instantly while the app is foregrounded.
