# Handoff: 022-polish-release

**Build**: Knowledge Graph tile + Bridge Finder on Dashboard. LICENSE file already created. CHANGELOG.md already created.

## Tasks
1. Knowledge Graph tile (`src/features/dashboard/KnowledgeGraph.tsx`) — queries most-linked vault notes (via vault_writes join), shows connections across domains. Cross-domain bridges highlighted.
2. Wire into DashboardRoute
3. Commit LICENSE + CHANGELOG + knowledge graph
4. Quality gates — test, lint, tsc

No new migration. Pure read-model queries. No AI, no vault writes.
