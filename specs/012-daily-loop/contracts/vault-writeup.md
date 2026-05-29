# Contract — Session writeup note (`src/features/loop/writeup.ts`)

A **pure** module (no I/O) that builds the writeup `NoteInput` from session data, plus the rules for where/how it's written through `VaultWriter`. Pure → unit-testable without a vault (mirrors `features/courses/moc/render.ts`).

> **Two-phase note**: the writeup is produced **only at finish** (the doing phase). Planning writes nothing to the vault. The builder shape below is unchanged from the first cut; `date` is the **completion** date.

## Builder

```ts
interface WriteupData {
  date: string;            // ISO
  courseTitle: string;
  objective: string;
  pretest: { question: string; userResponse: string | null }[];
  assignments: { label: string; locator: string | null }[];   // label = resource title + kind
  retrievalText: string;
  selfTestText: string;
  cardsMade: { front: string; back: string }[];
  notePath: string | null; // the atomic note authored this session, if any
}

// → { frontmatter, body } for VaultWriter.writeNote
export function buildWriteup(data: WriteupData): NoteInput;
export function writeupPath(date: string, objective: string, sessionId: string): string;
```

## Frontmatter (PRD §F7 — `type: log`)

```yaml
type: log
date: 2026-05-29
course: Real Analysis
objective: Be able to state and use the epsilon–delta definition of a limit
```

- `type: log` distinguishes the writeup from a `cic-type: course` MOC, so the F7 rescan never imports it as a Course.
- No `cic-id`/managed markers — a writeup is a leaf log, not an app-managed round-trip document (unlike MOCs).

## Body shape (clean, human-readable Markdown)

```markdown
# Session — 2026-05-29

**Objective:** <objective>

## Pretest — what I thought
- **Q:** <question>
  - <user response or "(no answer)">

## Studied
- <resource title> (<kind>) — <locator>

## Recalled from memory
<retrievalText>

## Self-test / gaps
<selfTestText>

## Cards made
- <front> → <back>

## Note
[[<note title>]]
```

- Sections with no content are **omitted** (no empty "Pretest" heading if pretest was skipped).
- Output is idempotent and gray-matter-canonical (single trailing newline) so a re-write of identical data round-trips byte-faithfully.

## Path & write rules

- **Path**: `Sessions/<YYYY-MM-DD> <objective-slug> (<short-id>).md` — `<short-id>` = first 8 chars of the session id; collision-free for same-day/same-course sessions (R6).
- **Write**: `VaultWriter.writeNote(path, buildWriteup(...))` — atomic, never-clobber.
  - `written` → record `writeup_path` on the session (already set pre-write per R7).
  - `conflict` (`unmanaged`/`drifted`) → surface "Write anyway"; retry with `{ overwrite: true }`.
  - thrown error (locked/offline) → surface a retry; **the session row is already saved** (R7).
- **Atomic note** (note step): `VaultWriter.writeNote("<title>.md", { frontmatter: {}, body })` under the same never-clobber guard; its path becomes the spawned cards' `note_path` when present.

## Constitution alignment

- Constitution I: only `VaultWriter` touches `.md`; clean Markdown; never-clobber; no binaries.
- Constitution III: the writeup **records** pretest attempts verbatim and never scores them; "Cards made" lists what the user authored — it does not mark anything learned.
