# Quickstart: Vault Layer

**Feature**: 005-vault-layer · **Date**: 2026-05-27

Goal: confirm the app can safely read/write Markdown notes in a vault — atomically, with frontmatter validated, never clobbering external edits, and never escaping the vault. This layer has **no UI**; verification is the test suite (run against a real local filesystem).

## Prerequisites

Features 001 + 003 in place. New deps: `tauri-plugin-fs` (Rust + JS) and `gray-matter` (frontmatter). The first `tauri dev` after this feature recompiles the shell (new Rust dep).

## Verify the feature (tests — the acceptance surface)

```powershell
npm run test     # the vault suite runs against node:fs temp dirs through the VaultFs seam
```

| Check | Backs |
|---|---|
| Round-trip: write a note (frontmatter + body) → read it back; body byte-faithful, frontmatter re-validates | FR-001/003 / SC-001 |
| Atomic write: after a successful write, no `*.cic-tmp` remains and the note is complete | FR-004 / SC-002 |
| Malformed frontmatter on read → typed parse failure, no crash | FR-002 / SC-005 |
| Conflict: external edit (mtime/hash drift) → write refused, file untouched | FR-006 / SC-003 |
| Unchanged note → write succeeds, recorded fingerprint advances | FR-005/008 / SC-004 |
| Unmanaged file (on disk, no record) → conflict (not clobbered) | FR-009 |
| Path safety: `..`, absolute-outside, and `.obsidian/` paths rejected before I/O | FR-011/012 / SC-006 |
| `recordVaultWrite` / `getVaultWrite` round-trip on the 003 store | contracts/vault-writes-repo.md |

## How it's wired (for the consuming feature)

```ts
import { createVault } from "./vault";            // composition root
const { reader, writer } = createVault({ vaultPath, db });   // db = the 003 SqlExecutor
const result = await writer.writeNote("Math/Real Analysis.md", { frontmatter, body });
if (result.status === "conflict") { /* later: open the 3-way diff dialog */ }
```

At runtime the chosen `vaultPath` must be authorized in the Tauri fs scope (R1); the folder-picker/settings that set `vaultPath` are a later feature.

## Runtime check (needs the GUI — user)

`npm run tauri dev`, then from a configured vault path: write a note and confirm it appears in Obsidian as clean Markdown; edit it in Obsidian and confirm a second app write is refused as a conflict; confirm nothing outside the vault (or under `.obsidian/`) is ever touched, and zero network activity.

## Out of scope (so you don't look for it)

No MOC body template / `<!-- cic:* -->` marker re-render, no 3-way diff dialog UI, no live file-watcher / backlink index, no note-type schemas (Course/Project), no UI, no Blueprint, no AI. This layer provides the safe read/write/frontmatter/conflict-detection primitives those build on.
