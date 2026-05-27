# Graph Report - .  (2026-05-26)

## Corpus Check
- Corpus is ~7,303 words - fits in a single context window. You may not need a graph.

## Summary
- 108 nodes · 105 edges · 26 communities (9 shown, 17 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.88)
- Token cost: 68,474 input · 7,608 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Daily Loop & Tutor Mechanisms|Daily Loop & Tutor Mechanisms]]
- [[_COMMUNITY_Course Generation Engine|Course Generation Engine]]
- [[_COMMUNITY_AI Provider Layer|AI Provider Layer]]
- [[_COMMUNITY_Vault & Vector Storage|Vault & Vector Storage]]
- [[_COMMUNITY_Tauri Foundation & Phase 0|Tauri Foundation & Phase 0]]
- [[_COMMUNITY_SRS Retention Engine|SRS Retention Engine]]
- [[_COMMUNITY_Tauri Architecture Decisions|Tauri Architecture Decisions]]
- [[_COMMUNITY_Course Hierarchy Schema|Course Hierarchy Schema]]
- [[_COMMUNITY_Vault IO Safety|Vault I/O Safety]]
- [[_COMMUNITY_Local-First Principle|Local-First Principle]]
- [[_COMMUNITY_Secrets Management|Secrets Management]]
- [[_COMMUNITY_Local-Only Lockdown|Local-Only Lockdown]]
- [[_COMMUNITY_Schema Validation|Schema Validation]]
- [[_COMMUNITY_Testing (Vitest)|Testing (Vitest)]]
- [[_COMMUNITY_CI Pipeline|CI Pipeline]]
- [[_COMMUNITY_Evidence-Based Principle|Evidence-Based Principle]]
- [[_COMMUNITY_Consistency Principle|Consistency Principle]]
- [[_COMMUNITY_Target User Profile|Target User Profile]]
- [[_COMMUNITY_System Architecture Diagram|System Architecture Diagram]]
- [[_COMMUNITY_Prompt Templates|Prompt Templates]]
- [[_COMMUNITY_Phase 1 Vault Integration|Phase 1 Vault Integration]]
- [[_COMMUNITY_Risk Provider Quality|Risk: Provider Quality]]
- [[_COMMUNITY_Risk Multi-Device State|Risk: Multi-Device State]]
- [[_COMMUNITY_Risk Cross-Platform Webview|Risk: Cross-Platform Webview]]
- [[_COMMUNITY_Open License Choice|Open: License Choice]]
- [[_COMMUNITY_Non-Goals & OSS Stance|Non-Goals & OSS Stance]]

## God Nodes (most connected - your core abstractions)
1. `F10 — Course Generation Engine` - 9 edges
2. `SQLite Schema (domains, courses, cards, reviews, …)` - 8 edges
3. `Decision: Tauri (locked v0.5)` - 7 edges
4. `CIC Learning Platform` - 6 edges
5. `F10.4 — Loop-seeding` - 6 edges
6. `§10.1 Provider Interface (chat/embed/capabilities)` - 6 edges
7. `Provider Interface (AI abstraction)` - 5 edges
8. `Vault Data Model (MOC, Concept, Source, Bridge, Writeup)` - 5 edges
9. `F3 — Built-in SRS (native FSRS)` - 5 edges
10. `F4 — AI Feynman / Socratic Interrogation` - 5 edges

## Surprising Connections (you probably didn't know these)
- `§10.1 Provider Interface (chat/embed/capabilities)` --semantically_similar_to--> `Provider Interface (AI abstraction)`  [INFERRED] [semantically similar]
  PRD-CIC-Platform.md → CLAUDE.md
- `SQLite Schema (domains, courses, cards, reviews, …)` --shares_data_with--> `Session (glossary)`  [EXTRACTED]
  PRD-CIC-Platform.md → CLAUDE.md
- `SQLite Schema (domains, courses, cards, reviews, …)` --shares_data_with--> `SQLite (Tracking + SRS State)`  [EXTRACTED]
  PRD-CIC-Platform.md → CLAUDE.md
- `Vector Store Schema (chunks, sources, source_map)` --shares_data_with--> `sqlite-vec Vector Store`  [INFERRED]
  PRD-CIC-Platform.md → CLAUDE.md
- `Vector Store Schema (chunks, sources, source_map)` --shares_data_with--> `LanceDB Vector Store`  [INFERRED]
  PRD-CIC-Platform.md → CLAUDE.md

## Hyperedges (group relationships)
- **Provider interface adapter triad** — claudemd_provider_interface, claudemd_ollama_adapter, claudemd_openai_compatible_adapter, claudemd_anthropic_adapter [EXTRACTED 1.00]
- **F10.4 loop-seeding wires together all five loop mechanisms** — prd_f10_4_loop_seeding, prd_f2_daily_loop, prd_f3_srs, prd_f4_feynman, prd_f5_retrieval_quizzes, prd_f6_interleaving [EXTRACTED 1.00]
- **Hybrid storage: vault + sqlite + vector store** — prd_hybrid_storage, claudemd_obsidian_vault, claudemd_sqlite, claudemd_sqlite_vec [EXTRACTED 1.00]

## Communities (26 total, 17 thin omitted)

### Community 0 - "Daily Loop & Tutor Mechanisms"
Cohesion: 0.16
Nodes (14): Session (glossary), F10.4 — Loop-seeding, F2 — The Daily Loop, F4 — AI Feynman / Socratic Interrogation, F5 — Retrieval Practice Quizzes, F6 — Interleaving / Desirable-Difficulty Scheduler, F7 — Knowledge Layer (vault integration), Mechanism: Elaboration / Self-Explanation (+6 more)

### Community 1 - "Course Generation Engine"
Cohesion: 0.15
Nodes (13): Course Blueprint IR, Guardrail: Preserve Desirable Difficulty, Guardrail: Scaffold is Default Generation Mode, Course Blueprint IR (jsonc spec), F10.1 — Mode A: Conversational Sparring, F10.2 — Mode B: Document Ingestion, F10.5 — Desirable-Difficulty Guardrail (Scaffold default), F10.6 — Provenance & Privacy (+5 more)

### Community 2 - "AI Provider Layer"
Cohesion: 0.24
Nodes (11): Anthropic Adapter, ESLint no-restricted-imports rule (vendor SDK gating), Guardrail: Tutor, Not Oracle, Guardrail: AI is Vendor-Agnostic, Ollama Adapter, OpenAI-Compatible Adapter, Provider Interface (AI abstraction), §10.5 Capability Handling & Fallback Chain (+3 more)

### Community 3 - "Vault & Vector Storage"
Cohesion: 0.24
Nodes (10): Bridge (cross-domain note), LanceDB Vector Store, Note (atomic Markdown), Obsidian Vault (Markdown, canonical), Source (ingested document), sqlite-vec Vector Store, Vault Data Model (MOC, Concept, Source, Bridge, Writeup), Vector Store Schema (chunks, sources, source_map) (+2 more)

### Community 4 - "Tauri Foundation & Phase 0"
Cohesion: 0.24
Nodes (10): CIC Learning Platform, Phase 0 — Foundation Rework (current focus), PRD as Source of Truth, React + TypeScript + Tailwind + Vite Frontend, SQLite (Tracking + SRS State), Tauri Desktop Shell, war-room-2026 (foundation chassis), Phase 0 — Foundation rework (+2 more)

### Community 5 - "SRS Retention Engine"
Cohesion: 0.29
Nodes (8): Card (SRS flashcard), ts-fsrs (native FSRS implementation), F3 — Built-in SRS (native FSRS), F8 — Command Center Dashboard, F9 — Native Reminders / Notifications, Mechanism: Consistency/Spacing Over Time, Mechanism: Spaced Repetition, Phase 2 — Retention engine

### Community 6 - "Tauri Architecture Decisions"
Cohesion: 0.25
Nodes (8): Decision: Electron rejected (bloat), Decision: Local-First Architecture, Decision: Local Next.js rejected, Decision: Obsidian plugin rejected as primary, Decision: Tauri (locked v0.5), tauri-plugin-fs, tauri-plugin-notification, tauri-plugin-sql

### Community 7 - "Course Hierarchy Schema"
Cohesion: 0.29
Nodes (7): Campaign (glossary), Course (glossary), Domain (glossary), Milestone (glossary), SQLite Schema (domains, courses, cards, reviews, …), F10.3 — Materialization, F1 — Course Authoring (manual)

### Community 8 - "Vault I/O Safety"
Cohesion: 0.33
Nodes (6): Vault File Watcher, Guardrail: Vault is Canonical and Sacred, VaultReader Module, VaultWriter Module, Principle: Vault is source of truth, Risk: Vault write conflicts with Obsidian

## Knowledge Gaps
- **2 isolated node(s):** `PRD §2 Problem (three-tool stack)`, `PRD §7 System Architecture Diagram`
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `F10.4 — Loop-seeding` connect `Daily Loop & Tutor Mechanisms` to `Course Generation Engine`, `SRS Retention Engine`?**
  _High betweenness centrality (0.220) - this node is a cross-community bridge._
- **Why does `F10 — Course Generation Engine` connect `Course Generation Engine` to `Daily Loop & Tutor Mechanisms`, `Course Hierarchy Schema`?**
  _High betweenness centrality (0.149) - this node is a cross-community bridge._
- **What connects `PRD as Source of Truth`, `Guardrail: Fully Local`, `Guardrail: Scaffold is Default Generation Mode` to the rest of the system?**
  _58 weakly-connected nodes found - possible documentation gaps or missing edges._