# Data Model: AI Feynman / Socratic Tutor (018)

**Feature**: 018-feynman-tutor | **Date**: 2026-06-12

## Entity-Relationship Diagram

```
┌─────────┐       ┌──────────┐
│ vaults  │       │ courses  │
│(exist)  │       │ (exist)  │
└────┬────┘       └────┬─────┘
     │ 1:N             │ 1:N (nullable)
     ▼                 ▼
┌──────────────┐
│ feynman_gaps │  NEW — m0010
│              │
│ + text       │
│ + status     │
│ + note_path  │────► vault Markdown file (canonical copy)
│ + course_id  │     `## Gaps from Feynman` section
│ + vault_id   │     `- [ ]` / `- [x]` checkbox items
└──────────────┘
```

**Note**: The canonical copy lives in the vault as `- [ ]` checkbox items. The `feynman_gaps` table is a read-optimized mirror for fast Dashboard querying. Drift reconciliation (vault rescan) corrects the DB to match the vault — never the reverse.

## Entities

### feynman_gaps (NEW — m0010)

Stores gap metadata for fast Dashboard querying and Course grouping. The vault Markdown `- [ ]` checkbox is the canonical copy; this table is a mirror.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK, UUID | Gap unique ID |
| `vault_id` | TEXT | NOT NULL, FK → vaults(id) ON DELETE CASCADE | Vault scope |
| `course_id` | TEXT | NULLABLE, FK → courses(id) ON DELETE SET NULL | Course context (null for global gaps) |
| `note_path` | TEXT | NOT NULL | Vault-relative path of note containing the gap checkbox |
| `text` | TEXT | NOT NULL | Gap description text |
| `status` | TEXT | NOT NULL, DEFAULT 'open', CHECK ('open', 'completed') | Gap state |
| `created_at` | TEXT | NOT NULL, DEFAULT datetime('now') | Creation timestamp |

**Indexes**:
- `idx_feynman_gaps_vault` on `(vault_id)` — fast vault-scoped queries
- `idx_feynman_gaps_course` on `(course_id)` — fast course-grouped queries

**Zod schema** (on read):
```ts
const FeynmanGapRow = z.object({
  id: z.string(),
  vault_id: z.string(),
  course_id: z.string().nullable(),
  note_path: z.string(),
  text: z.string(),
  status: z.enum(['open', 'completed']),
  created_at: z.string(),
});
```

**State transitions**:
```
open ──→ completed  (learner marks done in vault → rescan updates DB)
       ←── (manual reopen — edge case, not the primary flow)
```

### Feynman Conversation (ephemeral — no DB persistence)

Exists only in memory while the panel is open. Not stored in SQLite.

| Attribute | Description |
|-----------|-------------|
| Messages | Array of `{role: 'learner' | 'tutor', content: string, citations?: Citation[]}` |
| Context chunks | RAG retrieval results from the last search |
| Gap summary | Optional AI-generated gap list (before save) |

### Citation (embedded in AI responses)

Not a DB entity — inline metadata in AI response text.

| Attribute | Description |
|-----------|-------------|
| Source name | Resource title or vault note filename |
| Locator | Heading/TOC path (e.g., "Chapter 3: Derivatives") |
| Source kind | 'resource' or 'note' |
| Source ID | resources.id or note_path |

## Existing Tables (No changes)

No existing tables are modified. `feynman_gaps` is additive only.

## Volume Assumptions

- Gaps per course: typically 3–10 per Feynman conversation
- Gaps per vault: dozens to low hundreds total
- DB row size: ~500 bytes per gap (text + metadata)
- Total `feynman_gaps` table size: well under 1MB for typical use
