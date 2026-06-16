# Handoff: 023 — Research Agent V2: Session Structure

**Upgrade**: 023-research-v2-sessions | **Branch**: `023-research-v2-sessions`

## Goal

Extend the Research Agent blueprint IR to include sessions, per-source cards, projects, and milestone gating. The AI now outputs a university-grade structured course plan instead of flat milestones + generic card seeds.

## New Blueprint IR

```
Course Blueprint V2
 └─ Milestone { capability, order }
     ├─ sessions[] 
     │   ├─ title, objective
     │   ├─ sources[] { url, title, type:"reading"|"watching", estimatedMinutes }
     │   └─ cards[]  { front, sourceIndex }  ← matched to specific reading/watching
     └─ projects[] { title, description, requiredSessionIndices[] }
```

## Key Design Points

- **Cards match sources**: Each card has a `sourceIndex` pointing to the session's sources array. Cards are about specific readings/watchings — not generic. "As many as makes sense" per session.
- **Sessions per milestone**: As many as the AI decides — not one-per-milestone.
- **Projects per milestone**: As many as the AI decides — gated on session completion.
- **No new npm deps**: Pure existing infrastructure. URLs are treated as text references (v2.1 adds fetch+ingest).

## Files to create/modify

| File | Action | What |
|---|---|---|
| `src/ai/features/blueprint/types.ts` | MODIFY | Add `SessionSeed`, `SessionSource`, `SessionCardSeed`, `ProjectSeed` to Blueprint IR |
| `src/ai/features/blueprint/validator.ts` | MODIFY | Zod schemas for new types, update CourseBlueprint to include sessions[] and projects[] on milestones |
| `src/ai/features/blueprint/materializer.ts` | MODIFY | materializeSessions(): creates sessions in SQLite per milestone. materializeProjects(): creates projects gated on sessions. materializeCards(): creates per-source cards with card_resources links |
| `src/ai/prompts/research.ts` | MODIFY | Updated system prompt — include sessions + per-source cards + projects in output format |
| `src/ai/features/research/prompt.ts` | MODIFY | Updated buildResearchPrompt to include new fields |
| `src/ai/features/research/types.ts` | MODIFY | Add SessionSeed, ProjectSeed to types |
| `src/ai/features/research/engine.ts` | MODIFY | Handle sessions[] and projects[] from AI response |
| `src/db/migrations/m0014_session_sources.ts` | NEW | session_sources(id, session_id FK, resource_id FK nullable, title, url, type, estimated_minutes, order) |
| `src/db/repositories/sessions.ts` | MODIFY | Extend createSession to accept sources + link session_sources |
| `src/features/research/CampaignReview.tsx` | MODIFY | Show sessions + projects per milestone in review UI |

## Migration m0014

```sql
CREATE TABLE IF NOT EXISTS session_sources (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('reading', 'watching')),
  estimated_minutes INTEGER NOT NULL DEFAULT 30,
  ordering INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_session_sources_session ON session_sources(session_id);
```

`resource_id` is nullable — set when the source is actually ingested (v2.1). For v2.0, sources are URLs stored as references.

## Materialization flow

1. `materializeCampaign` called after user confirms research plan
2. For each course → for each milestone:
   a. For each session in milestone.sessions:
      - `createSession(db, {courseId, objective, title, ...})` 
      - For each source: `INSERT INTO session_sources`
      - For each card: `createCard(db, {courseId, front, ...})` + `INSERT INTO card_resources`
   b. For each project: `createProject(db, {title, description, courseId, requiredSessionIds[]})`
3. Campaign written to vault as MOC

## Quality gates

- [ ] All tests pass (815+)
- [ ] ESLint 0
- [ ] tsc 0
- [ ] V2 prompt generates sessions + projects in AI response format
- [ ] Materializer creates sessions + sources + per-source cards + projects
- [ ] CampaignReview UI shows sessions and projects per milestone
- [ ] No new npm deps
- [ ] No Rust changes
