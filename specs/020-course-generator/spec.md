# Feature Specification: Course Generation Engine (F10 core)

**Feature Branch**: `020-course-generator` | **Created**: 2026-06-15 | **Status**: Draft

**Input**: F10 Course Generation Engine. Two modes → Course Blueprint IR → user review → materialize into vault MOC + SQLite. Scaffold mode only (structure, objectives, sources, questions — NOT pre-written answers). Uses router.chat('scaffolding', …) (016), RAG (017).

Scope v1: Mode A sparring + Mode B ingestion from existing ingested Resources. Single course only (campaign deferred). Scaffold only.

## User Scenarios

### User Story 1 - Mode A: Conversational Course Design (Priority: P1)

A learner wants to create a structured course from scratch. They open the "Campaign Architect" dialog, declare their target (scope: single course, depth: working knowledge, topic: "Real Analysis"), and the AI engages in a guided dialogue — eliciting current level (calibration gate), time budget, and front-load preference. The AI proposes a course structure (domain, milestones, dependency graph). The learner reviews, discusses, pushes back, iterates. On agreement, the AI emits a Course Blueprint.

### User Story 2 - Mode B: Course from Ingested Resources (Priority: P2)

A learner has already ingested Resources (017). They select one or more Resources, set the target (scope + depth), and the AI synthesizes a Course Blueprint from the content — transforming the document structure into capability milestones through the desirable-difficulties lens, not just copying headings.

### User Story 3 - Review & Materialize (Priority: P3)

The learner reviews the Course Blueprint (milestones, card seeds, retrieval Qs, Feynman targets), edits anything, then clicks "Materialize." The system writes the MOC Markdown to the vault, inserts courses/milestones/resource_map rows in SQLite, and creates suggested cards (status: suggested, not scheduled). The course is immediately loop-wired.

## Functional Requirements (21)

**Sparring (Mode A)**:
- FR-001: Target-setting dialog (scope, depth, topic) before generation
- FR-002: Calibration gate (current level elicitation)
- FR-003: Guided dialogue via `router.chat('scaffolding', …)` with architect system prompt
- FR-004: Iterative refinement — propose → review → edit → re-propose

**Ingestion (Mode B)**:
- FR-005: Select existing ingested Resources as source material
- FR-006: Synthesize Blueprint from Resource content via RAG retrieval + AI
- FR-007: Transform, don't mirror — resequence into capability milestones

**Blueprint IR**:
- FR-008: Structured Blueprint: title, domain, milestones[], cardSeeds[], retrievalQs[], feynmanTargets[], resourceMap[]
- FR-009: Blueprint displayed as reviewable, editable form (not raw JSON)
- FR-010: Validation: domain exists or will be created, no duplicate milestones

**Materialization**:
- FR-011: Write MOC Markdown to vault via VaultWriter (frontmatter from blueprint)
- FR-012: Insert courses + milestones + resource_map + course_resources rows
- FR-013: Create suggested cards (front only — back is blank, status: suggested)
- FR-014: Idempotent — regenerating updates, doesn't duplicate

**Guardrails**:
- FR-015: Scaffold only — generated cards have fronts but no backs, notes have structure but no pre-written content (FR-016: no full-draft in v1)
- FR-016: AI never auto-commits — materialization requires explicit approval
- FR-017: Lockdown gate enforced for all AI calls
- FR-018: Provenance: generated items tagged `generated_by` in frontmatter

**UI**:
- FR-019: "New Course" entry point with two paths: "Design with AI" (Mode A) and "Generate from Resources" (Mode B)
- FR-020: Blueprint review screen with editable fields, dependency graph visualization
- FR-021: "Materialize" button with confirmation

## Success Criteria
- SC-001: Generate a Course Blueprint via Mode A in under 60 seconds (3-5 turn dialogue)
- SC-002: Blueprint from 3 ingested Resources generates in under 45 seconds
- SC-003: Materialization creates MOC + SQLite rows + suggested cards — all or nothing (transactional)
- SC-004: Re-materializing updates existing course (idempotent, no duplicates)

## Key Entities
- **Course Blueprint** (IR): title, domain, milestones[] (each with capability, order, resourceMap), cardSeeds[], retrievalQs[], feynmanTargets[], scope, depth
- **Suggested Card**: front only, status=suggested, not scheduled in FSRS

## Out of scope
- Campaign Blueprint (multi-course)
- Mode B PDF parsing (PDF already deferred in 017)
- Full-draft mode
- projectSeeds[] (F11.4)
- F6 scheduler integration (Phase 4)
