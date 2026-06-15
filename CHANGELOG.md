# Changelog

## v0.9.12 — AI Engine Complete (Phase 3) — 2026-06-15

### AI Engine
- **F4 Feynman/Socratic Tutor** — RAG-grounded chat panel where the learner explains a concept and the AI probes with Socratic questions. Streaming responses, source citations, gap tracking (vault canonical + SQLite mirror), Dashboard "Gaps to Chase" tile.
- **F5 Retrieval Practice Quizzes** — AI-generated quiz from Course material with answer-reveal UI, self-rating (got it/close/missed), and card-spawning from missed items. Surface-form variability across sessions.
- **F10 Course Generation Engine** — Two modes → Course Blueprint IR → review → materialize. Mode A: conversational "Campaign Architect" sparring. Mode B: synthesize course from ingested Resources via RAG. Scaffold only — fronts without backs.
- **F6 Interleaving Scheduler** — Daily mix across domains, cold-surface detection, prereq-respecting recommendations. Pure logic — no AI.

### Previously (v0.9.11)
- **F10.2 RAG Ingestion Pipeline** — Markdown + EPUB parsing, heading/TOC-aware chunking, sqlite-vec vector storage, KNN retrieval, Search Corpus page.
- **F10.1 AI Provider Layer** — Vendor-agnostic Provider interface, 3 adapters (Ollama/OpenAI-compatible/Anthropic), role-based router, lockdown gate.

### Prior (v0.1 – v0.9.10)
- Tauri 2 + React 19 + TypeScript strict shell
- Vault integration (Obsidian MOC round-trip)
- Native FSRS spaced repetition
- Daily Loop guided study protocol
- Projects: Applied Practice
- Resources (8 kinds, file import)
- Course session planner + curriculum
- Native OS notifications
- Vault-scoped data

---

**Full changelog**: See individual feature specs in `specs/001-*/` through `specs/021-*/` and PRs #1–#16.
