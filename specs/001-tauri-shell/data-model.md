# Data Model: Tauri Shell (React + Vite)

**Feature**: 001-tauri-shell · **Date**: 2026-05-27

## No persistent data in this feature

Feature 001 introduces **no entities, no database, no schema, no persisted state**. The window renders static placeholder content. This document exists for spec-kit completeness and to record *why* it's empty, not to invent structure.

What this feature deliberately does **not** create (and which feature will):

| Data concern | Arrives in | Notes |
|---|---|---|
| SQLite database + `tauri-plugin-sql` | Feature 003 | First migrations: `domains`, `courses`, `milestones`, etc. (PRD §8) |
| Vault frontmatter schemas (zod) | Phase 1 / vault feature | `VaultReader` parse-and-validate boundary |
| `CourseBlueprint` IR + other shared types | `src/types/` as features need them | Per Pocock spine (Constitution IV) |
| AI config / provider types | AI provider layer feature | Per `ai-provider-layer.md` |

## In-memory state (this feature)

The only "state" is React's render of a single placeholder component. No state management library, no context, no stores. If the placeholder needs a value (e.g. the app version string), it is a hardcoded constant in the component — not loaded from anywhere.

## Validation rules

None — there is no external input to validate in this feature (Constitution's "validate all external/frontmatter/AI-JSON input through zod" applies the moment such input exists, which is not yet).
