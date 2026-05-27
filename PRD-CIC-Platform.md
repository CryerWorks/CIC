# PRD — Combat Information Center (CIC) Learning Platform
### Initial Specification for Claude Code · v0.7

> **Codename:** CIC (working title — built on the `war-room-2026` foundation). Rename freely.
> **Purpose of this document:** a build-ready spec to hand to Claude Code. It defines the vision, the architecture decision that everything hinges on, the data model, the feature set, and a phased migration plan from the existing `war-room-2026` repo.
>
> **Decisions locked in v0.2:** (1) The platform is **fully local and Obsidian-reliant** — all user data lives on-device, the vault is the mandatory, canonical knowledge store, and no cloud backend is involved in storage or sync. (2) All AI capability runs through a **vendor-agnostic provider layer** — the user plugs in any backend (local models via Ollama / LM Studio / llama.cpp, OpenRouter, or any frontier vendor API key) and can route different tasks to different providers. See §6 and §10.
>
> **Added in v0.3:** A **Course Generation Engine** (F10) with two input modes — conversational sparring and document ingestion — converging on a reviewable **Course Blueprint** IR that materializes into a loop-wired course. Includes the **desirable-difficulty guardrail** (F10.5): AI removes setup friction, never thinking friction.
>
> **Locked in v0.4:** **Scaffold is the codified default** generation mode (F10.5); the user **sets the target — scope + depth — up front** and the AI fits to it (F10.7); Mode B ingestion accepts **PDF, EPUB, and Markdown**.
>
> **Locked in v0.5:** Desktop shell is **Tauri** (React + Vite frontend; TS-friendly native plugins) — §6. SRS is **native FSRS, fully in-app** — no Anki dependency (F3). Project is **non-commercial and will be released open source on GitHub** (§14); Tauri adoption moves to Phase 0 (§12).
>
> **Locked in v0.6:** New feature **F11 Projects: Applied Practice** (§9) — optional applied-practice artifact per Course, **multi-milestone** (1..N Milestones' capability applied to one concrete problem), with a mandatory frontmatter wrapper + per-domain freeform body templates. Closes the *transfer / application* mechanism gap (§15). Data model extended (§8); Course Blueprint IR gains `projectSeeds[]` (F10 / Phase 3.5). Locked sub-decisions: single-Course only (cross-Course handled by Bridges), no auto-grading (§14), Phase 2 ships manual MVP before AI augmentation.
>
> **Locked in v0.7:** Cog-psych additions closing three more gaps in §15 — **F2 pretest step** (errorful generation before active study; Daily Loop becomes 8-step), **F3.5 calibration** (confidence ratings on reviews surfacing overconfidence — the illusion of competence the PRD already cites), and **variability of surface form** as a design requirement on F5/F6/F10 (Schmidt & Bjork: variability complements interleaving). Vault contract tightened: **F1 MOC body template locked** with app-managed sections (no Dataview dependency), **F7 backlinks consumption** added (read, not just write), **block-ref citations** in cards (jump-to-paragraph on review), **vault subfolder support** (§6 — CIC can live under `Learning/` in a larger vault), and a concrete **conflict resolution UX** in §13 (detect via mtime+hash, 3-way diff dialog, no-clobber while open).

---

## 1. Vision

A single, local-first, AI-powered application that runs the entire evidence-based learning system we currently spread across three tools (a static HTML dashboard, an Obsidian vault, and Anki). It centralizes **tracking**, **knowledge**, and **retention** into one command center while keeping the Obsidian vault as the canonical knowledge store (Karpathy "second brain" philosophy).

The app does not invent a new study method. It operationalizes a proven one — **desirable difficulties, retrieval practice, spaced repetition, interleaving** — and removes the friction of stitching the pieces together by hand.

---

## 2. Problem

The current three-layer stack works but is manual:
- The **dashboard** (static HTML) can't push notifications, can't read the vault, and stores data in browser `localStorage`.
- **Obsidian** holds knowledge but has no built-in scheduling, SRS, or AI interrogation.
- **Anki** handles spaced repetition but lives entirely separately, with no link to course structure or session logging.
- The **AI tutor loop** (Feynman interrogation, retrieval questions, card generation) is done ad hoc in a chat window, ungrounded in the user's own notes.

Result: the learner is the integration layer. The platform should be.

---

## 3. Product Principles

1. **Evidence-based, not productivity theatre.** Every feature must serve a documented learning-science mechanism (see §11 glossary). If it doesn't map to retrieval / spacing / interleaving / elaboration, it doesn't ship.
2. **The vault is the source of truth.** All *knowledge* (notes, course definitions, source notes, session writeups) lives as plain Markdown in the user's Obsidian vault. The app reads and writes those files; it never locks knowledge inside a proprietary DB. The user can always open the vault in Obsidian directly.
3. **Fully local, Obsidian-reliant.** All user data lives on-device. The Obsidian vault is the **mandatory, canonical** knowledge store — the app points at an existing vault, reads/writes Markdown, and cooperates with Obsidian rather than replacing it. There is **no cloud backend** for storage or sync. *Distinction:* AI **inference** is pluggable (see principle 4a) and may call a remote provider if the user configures one — but storage is always local, and a local-only lockdown mode can forbid sending vault content off-device entirely.
4. **AI is a tutor, not an oracle.** AI features are grounded in the user's vault + authoritative sources via RAG, and must surface uncertainty — especially in math/physics where models are unreliable. The AI generates questions, explanations, and draft cards; it never silently becomes the arbiter of correctness.
   - **4a. Vendor-agnostic.** No AI capability is bound to a specific vendor. The user plugs in any backend — local (Ollama, LM Studio, llama.cpp, vLLM), OpenRouter, or any frontier API key — and may route different tasks to different providers. Guardrails (principle 4) apply identically regardless of backend. See §10.
5. **The system enforces the hard parts.** Spacing, interleaving, and active recall feel bad in the moment. The scheduler and session flow should nudge toward them by default (surface cold courses, force retrieval before reveal, distribute reviews).
6. **Consistency over intensity.** Streaks, daily targets, and native reminders optimize for showing up daily, not marathon sessions.

---

## 4. Target User

A self-directed, multi-domain learner (the "operator") pursuing fluency across technical and non-technical domains simultaneously — e.g. CS/AI theory, mathematics, hardware, languages. Comfortable with developer tooling, runs local LLMs, values privacy and ownership of data. Single-user, single-machine is the V1 assumption.

---

## 5. Foundation: What We Inherit from `war-room-2026`

The existing repo provides a working, tested chassis. We keep its concepts, generalize its domains, and bolt the learning engine on top.

**Inherited as-is (conceptually):**
- Hierarchical tracking with **cascading completion** (finishing children completes parents).
- **Calendar** view with scheduled, completable daily items + notes.
- **Streak tracking** (global and per-domain).
- **Operation command center** with phase timeline / schedule.
- Tactical-HUD **visual design** (dark, hex grid, monospaced readouts, corner brackets, boot sequence, domain-colored accents) — already consistent with the CIC dashboard.
- **React + TypeScript** component library (`calendar/`, `dashboard/`, `goals/`, `modules/`, `operations/`, `phases/`, `ui/`).
- Test setup (Vitest), CI (GitHub Actions), ESLint config.

**Concept mapping (old → new):**

| War Room 2026 | CIC Platform | Notes |
|---|---|---|
| Domain (linguistic/technical/physical) | **Domain** (user-defined: Math, CS Theory, ML/DL, …) | Generalize from 3 hard-coded to N user-defined |
| Goal | **Campaign** | A long-arc objective (e.g. "CS+AI fluency") |
| Operation | **Course** (= an Obsidian MOC) | The unit a user "enrolls" in; backed by a MOC file |
| Phase | **Milestone** | A capability gate ("be able to derive backprop") |
| Module (daily scheduled activity) | **Session** | One run of the daily learning loop |
| Note | **Note** (atomic, in the vault) | Now first-class vault Markdown, linkable |
| — (new) | **Card** | SRS flashcard with scheduling state |
| — (new) | **Source** | Literature note |
| — (new) | **Bridge** | Cross-domain connection note (`#bridge`) |
| — (new) | **Project** | Optional applied-practice artifact per Course — 1..N Milestones' capability applied to one concrete problem (see F11) |

---

## 6. THE Architecture Decision: Local-First

This is the load-bearing choice. The two hard requirements — **(a) the Obsidian vault is the storage layer** and **(b) AI runs locally** — are both incompatible with War Room's current Vercel + Supabase cloud deployment. A remote server cannot touch local Markdown files or a local Ollama instance.

**Therefore the platform must run on the user's machine with filesystem + local-network access.** Options evaluated:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Tauri** (Rust core + web frontend) | Reuses React/TS frontend; native FS + notifications; tiny binary (~MB vs ~100MB); low RAM; strict security model; TS-friendly via official plugins | Smaller ecosystem; per-OS webview rendering quirks; Rust for custom native code | ✅ **LOCKED (v0.5)** |
| **Electron** | Battle-tested; pure Node/JS; consistent bundled Chromium | Heavy (~100MB+); high memory | Rejected (bloat) |
| **Local Next.js server** (run `next start` locally) | Minimal migration from war-room | Not a "real app"; needs a launcher; **no native notifications**; browser-tab UX | Rejected (optional dev convenience only) |
| **Obsidian plugin** | Native vault access | Can't reuse the HUD frontend; constrained UI; reinventing tracking inside Obsidian panes | Rejected for primary; possible companion later |

**Decision (locked v0.5): Tauri.** For a lean, installable, offline desktop app, Tauri's tiny footprint and security model win, and its official plugins (`tauri-plugin-sql` for SQLite, `tauri-plugin-fs` for the vault, `tauri-plugin-notification` for reminders) keep the bulk of the work in TypeScript — Rust is only needed for custom native code. The two things this product most needs from a shell — **native notifications** (the daily reminder the static HTML couldn't do) and **frictionless local filesystem access** to the vault — are exactly what Tauri provides natively.

**Frontend implication:** the app is **React + Vite** (not Next.js). War-room's React *components* (calendar, dashboard, cards, etc.) port over cleanly; war-room's Next.js *shell* (App Router routing + API routes) is replaced by Vite + a client router, with backend/FS/SQLite work handled through Tauri's plugin/command APIs. A local Vite dev server is used during development; it is not a shipping target.

**Fully-local commitment (locked):** no cloud backend exists for storage, accounts, or sync. The app is launched and run entirely on the user's machine. The vault is **required** — on first run the app asks the user to point at an existing Obsidian vault folder (or scaffold a new one), and that folder is the knowledge root from then on. The app must be a *good citizen* of that vault: never destructive, tolerant of Obsidian being open concurrently, and writing only well-formed Markdown a human would be happy to see.

**Vault root vs subfolder (locked v0.7):** users can point CIC at either a vault root *or* a subfolder of an existing vault. The app tracks `vaultPath` (the folder it operates in) and `vaultRoot` (the Obsidian vault root, walking up to find `.obsidian/`). All vault reads/writes are scoped to `vaultPath` — CIC never reads or writes outside it. Obsidian's `.obsidian/` config dir is detected from the root but never modified. This lets users keep one Obsidian vault for their whole life and have CIC live in e.g. `Learning/` without taking over the vault.

### Hybrid storage model (the key pattern)

Not everything belongs in Markdown. Split by data nature:

- **Knowledge → Obsidian vault (Markdown + frontmatter).** Source of truth. Notes, course MOCs (with milestone/resource/dependency frontmatter), source notes, bridges, session writeups. Human-editable, Git-able, openable in Obsidian.
- **Tracking & scheduling state → local SQLite.** Fast-querying structured data the vault is bad at: streaks, schedule, session timings, completion cascade, and **SRS card scheduling state** (FSRS parameters, due dates, review history).
- **AI grounding → local vector store.** Embeddings of vault notes + ingested sources for RAG (see §10).

The app keeps SQLite and the vault in sync: it **reads** MOC frontmatter to learn course structure and **writes** session writeups + AI-drafted notes back into the vault as Markdown. SQLite is an index/cache + the home for scheduling math; the vault is canonical for content.

---

## 7. System Architecture (target, Tauri)

```
┌──────────────────────────────────────────────────────────┐
│  CIC Desktop App (Tauri)                                   │
│                                                            │
│  ┌──────────────────────────┐   ┌──────────────────────┐  │
│  │  Frontend (React + TS)   │   │  Core services (TS)  │  │
│  │  - HUD dashboard         │◄─►│  - Vault sync (FS)   │  │
│  │  - Course authoring      │   │  - SRS engine (FSRS) │  │
│  │  - Daily Loop flow       │   │  - Scheduler /       │  │
│  │  - Flashcard review      │   │    interleaver       │  │
│  │  - Feynman / quiz panel  │   │  - AI orchestrator   │  │
│  │  - Calendar / graph      │   │  - RAG indexer       │  │
│  └──────────────────────────┘   └──────────┬───────────┘  │
│                                              │             │
│   ┌──────────────┐  ┌──────────────┐  ┌──────▼─────────┐  │
│   │ Obsidian Vault│  │   SQLite     │  │  Vector store  │  │
│   │ (.md on disk) │  │ (tracking +  │  │ (sqlite-vec /  │  │
│   │  CANONICAL    │  │  SRS state)  │  │  LanceDB)      │  │
│   └──────────────┘  └──────────────┘  └────────────────┘  │
└───────────────────────────────┬────────────────────────────┘
                                 │  local HTTP
                        ┌────────▼─────────┐
                        │  Ollama (local)  │  LLM + embeddings
                        └──────────────────┘
```

---

## 8. Data Model

### Vault (Markdown, canonical for knowledge)
- **Course MOC** — frontmatter: `type: course`, `domain`, `campaign`, `milestones[]` (each with `id`, `capability`, `done`), `resources[]`, `depends_on[]`. Body: the curated MOC.
- **Concept Note** — `type: concept`, `domain`, links (`builds_on`, `related`), self-test Q/A, source ref.
- **Source Note** — `type: source`, `author`, `kind`.
- **Bridge Note** — `type: concept`, `tags: [bridge]`.
- **Session Writeup** — `type: log`, `date`, `course`, `objective`, recalled-from-memory, gaps, cards-made.
- **Project** — `type: project`, `id`, `course`, `milestones[]`, `capability`, `status` (`open` | `in-progress` | `complete` | `abandoned`), `opened`, `closed?`, `template?`. Body: suggested *Problem · Approach · Work · Reflection* headings — per-domain templates override the body shape (math/proof, cs/implement, freeform). Mandatory frontmatter = integration layer; freeform body = domain-shaped. See F11.

### SQLite (tracking, scheduling, SRS)
- `domains(id, name, color)`
- `campaigns(id, title, domain_id)`
- `courses(id, title, domain_id, campaign_id, moc_path)` — `moc_path` links to the vault file
- `milestones(id, course_id, capability, status, order)`
- `sessions(id, course_id, project_id?, date, objective, minutes, did_retrieval, writeup_path)` — `project_id` is a nullable FK (most sessions don't link to a Project)
- `cards(id, course_id, note_path, project_id?, front, back, fsrs_state JSON, due_at, last_reviewed)` — `project_id` is nullable (cards may be spawned from a Project's close-reflection)
- `reviews(id, card_id, rating, confidence?, reviewed_at, elapsed_ms)` — `confidence` ∈ 1..5 (nullable for backward compat); used to surface overconfident cards (F3.5)
- `streaks(date, minutes, domains_touched JSON)`
- `projects(id, course_id, capability, status, opened_at, closed_at, project_path, template?)` — `project_path` links to the vault file; `status` ∈ `open` / `in-progress` / `complete` / `abandoned`
- `project_milestones(project_id, milestone_id)` — M:N; a Project applies 1..N Milestones' capability
- `vault_writes(file_path, app_mtime, app_hash)` — written by the app *after* a successful `VaultWriter` write; the file watcher compares OS mtime + body hash against this to detect Obsidian-modified-since-app (drives the §13 conflict UX)
- `pretest_responses(session_id, question, user_response, revealed_after)` — captures the pretest answers (F2.5); used in the session writeup's "what you thought vs what's true" comparison

### Vector store
- `chunks(id, note_path, text, embedding, source_kind)` — for RAG over the vault + ingested sources.
- `sources(id, title, kind, file_path, ingested_at)` — ingested PDFs/ebooks (the file stays local).
- `source_map(id, milestone_id, source_id, locator)` — links a milestone to exact source ranges (chapter/section/page/loc + chunk ids) for grounded study, cards, and quizzes.

### Course Blueprint (the generation IR — see F10)
A transient, reviewable intermediate object that **both** generation modes emit and that materializes into the vault + SQLite on approval. Not persisted long-term; the materialized MOC + rows are the durable artifact.
```jsonc
CourseBlueprint {
  title, domain, campaign?,            // placement
  summary,
  source: { type: "conversation" | "document", ref, chunkCount? },
  docKind?: "pdf" | "epub" | "markdown",  // Mode B parse path
  granularity: "course" | "campaign",  // SET BY USER UP FRONT (F10.7)
  targetDepth: "overview" | "working" | "mastery",  // SET BY USER UP FRONT
  milestones: [{
    id, capability,                    // "be able to derive X" — the loop objective
    dependsOn: [milestoneId],
    sourceMap: [{ sourceId, locator }],// exact ranges → study + RAG grounding
    conceptSeeds: [{ title, stub }],   // OPTIONAL note stubs (see F10.5 guardrail)
    cardSeeds:    [{ front, back, status: "suggested" }],
    retrievalQs:  [string],
    feynmanTargets: [string],
    estimatedLoad
  }],
  dependencies,                         // derived graph
  resources: [...],
  projectSeeds: [{                      // OPTIONAL — applied-practice seeds (F11.4)
    primaryMilestones: [milestoneId],   // 1..N capabilities the project exercises
    scopeHint: "small" | "medium" | "large",
    templateHint?: string,              // "math/proof" | "cs/implement" | "freeform"
    problemSketch: string               // one-paragraph framing — never a solved solution
  }],
  reviewState: "draft" | "edited" | "approved"
}
```

---

## 9. Feature Specification — The Learning Engine

The tracking layer (dashboard, calendar, streaks, cascading completion) is inherited from war-room and generalized. The **new value** is the learning engine:

### F1 — Course Authoring (manual)
Create user-defined courses with capability milestones, resources, and dependencies by hand. Writing a course **generates/updates its MOC Markdown file** in the vault (frontmatter + body). Editing the MOC in Obsidian directly is reflected back on next sync. Supports the Campaign → Course → Milestone hierarchy. *(For AI-assisted creation — conversational or from a document — see **F10**, which produces a Course Blueprint that materializes through this same path.)*

**MOC body template (locked v0.7).** Every Course MOC has a fixed body structure so dashboards, scheduler, and AI features can rely on it:

```markdown
## Capability
<one paragraph — what does completing this Course prove the user can do?>

## Milestones        <!-- cic:milestones --> ... <!-- /cic:milestones -->
## Resources         <!-- cic:resources --> ... <!-- /cic:resources -->
## Active Projects   <!-- cic:projects --> ... <!-- /cic:projects -->
## Recent Sessions   <!-- cic:sessions --> ... <!-- /cic:sessions -->
## Notes             <!-- cic:notes --> ... <!-- /cic:notes -->
## Reflections       <!-- user-only — app never writes here -->
```

The HTML comment markers (`<!-- cic:milestones -->`) delimit **app-managed sections** that the app re-renders on every sync. Content *outside* the markers — including the entire `## Reflections` section — is user-owned and never overwritten. This contract means the app never needs Dataview to render dynamic lists; plain Obsidian shows a working MOC out of the box (see F7).

### F2 — The Daily Loop (guided session flow)
A first-class, step-guided session implementing the 8-step protocol (v0.7):
`objective → pretest → active study → retrieve from memory → atomic note + link → self-test/Feynman → make cards → schedule interleave`.
The flow:
- prompts for a **capability-phrased objective**,
- **F2.5 pretest step** — before opening the source, the app presents 2-4 pretest questions on the objective (seeded from prior session writeups, milestone capabilities, or AI-generated from the source's table of contents *without* revealing content). The user attempts answers from intuition or prior knowledge. **Wrong answers are expected and beneficial** — errorful generation primes encoding (Roediger & Karpicke; Kornell et al.). Answers are logged to `pretest_responses` and surfaced in the session writeup as a "what you thought vs what's true" comparison. *Never graded, never scored — the value is in the attempt.*
- opens the source for **active study**,
- provides a **retrieval scratchpad** for post-study recall (write from memory before re-opening the source — distinct from pretest: this is *corrective* retrieval, not errorful generation),
- opens a **note editor** that writes an atomic Markdown note into the vault with backlinks,
- launches the **Feynman/quiz** panel (F4/F5),
- offers **AI-drafted cards** for confirmation (F3),
- logs the session to SQLite + writes a **session writeup** note to the vault (including the pretest comparison).

### F3 — Built-in Spaced Repetition (SRS) — LOCKED (native, centralized)
A fully **native** flashcard system so the user never leaves the platform — Anki is not required, not installed, not a dependency. Retention lives where the courses, notes, and sessions already are.
- Algorithm: **FSRS** (modern, the algorithm Anki adopted) for scheduling. Use an open-source TypeScript implementation (e.g. `ts-fsrs`) — fits the open-source goal and keeps it in-stack.
- Cards are linked to their source note and course; scheduling state in SQLite (`cards.fsrs_state`, `reviews`).
- **AI-assisted card generation**: select a note → AI drafts atomic Q/A cards (user edits/approves; never auto-committed; respects the F10.5 scaffold guardrail).
- Full in-app review UI: due queue, rating buttons, retrieval-before-reveal enforced, cloze + image-occlusion card types.
- Daily review reminder via native notification (Tauri).
- **F3.5 Calibration (v0.7)** — every card review collects a **confidence rating (1-5)** alongside the FSRS effort rating. The dashboard surfaces **overconfident cards** (high confidence + "again"/incorrect rating) — these are where the *illusion of competence* concentrates (Dunlosky et al.; same literature §3 principle 1 cites). Calibration is also prompted inline on F5 quizzes (in-session feedback only; not persisted in v1). Over time, the user develops accurate self-knowledge of what they know vs. think they know — a metacognitive skill the system *trains by collecting*, not by teaching.
- **F3.6 Block-ref citations (v0.7)** — cards that cite a source note use Obsidian block references (`[[note#^block-id]]`) rather than note-level links. On review, clicking the citation jumps to the exact paragraph. The card-generation AI inserts `^block-id` markers in the source note when drafting, idempotent across regenerations. See F7 for block-id management.
- *Optional, non-core (future):* a one-way export to Anki for users who already live there. Not a V1 concern and explicitly **not** a reason to split the workflow — the platform is the home for review.

### F4 — AI Feynman / Socratic Interrogation
The headline AI feature. The user explains a concept; the AI plays the probing beginner / Socratic examiner and finds gaps.
- **RAG-grounded**: retrieves the user's own relevant vault notes + ingested authoritative sources, so questioning is anchored to real material, not model confabulation.
- **Tutor-not-oracle guardrails**: in flagged technical domains (math, physics, proofs) the AI must cite the grounding source and explicitly flag when it is unsure rather than assert correctness.
- **Gap logging**: identified gaps are written back as `- [ ]` tasks in the session writeup and surfaced on the dashboard as "to chase."

### F5 — Retrieval Practice Quizzes
On demand or scheduled, the AI generates retrieval questions from a note/course (ordered easy→hard, answers withheld until response). Results can spawn cards (F3) for missed items. Distinct from SRS: this is generative active recall over recent material.

**Variability of surface form (locked v0.7).** Retrieval Qs vary across sessions in *surface form*, not just *order*: different problem framings, different examples, different contexts pointing at the same underlying concept. F10's Course Generator produces **3-5 surface-form variants per `retrievalQs[]` entry** in the Blueprint; the F6 scheduler picks one variant per session. This complements F6's interleaving (Schmidt & Bjork: interleaving handles *order*, variability handles *context* — both reduce contextual interference; both drive transfer). Especially important for math (same theorem in different problem framings) and language (same grammar in different sentences).

### F6 — Interleaving Scheduler / Desirable-Difficulty Engine
The mechanism that enforces the method.
- Surfaces **cold courses/domains** (not touched in N days) and nudges rotation.
- Distributes review load (spacing) rather than batching.
- Suggests a **daily mix** drawing from multiple domains per the two-track interleave model.
- Respects course **dependencies** (won't suggest a course whose prereqs are unmet).
- **Pairs interleaving (order) with variability (surface form, F5).** The scheduler not only varies *which* course/concept is next but, on a given concept, picks a *different surface-form variant* from the ones generated by F10. Together these are the two halves of Schmidt & Bjork's "variability of practice" — both reduce contextual interference and drive transfer.

### F7 — Knowledge Layer (vault integration)
- Read/write atomic Markdown notes with `[[wikilinks]]`.
- **Backlinks consumption (locked v0.7).** The app builds its own backlink index by scanning all vault files on startup + incrementally on file-watcher events (does **not** depend on Obsidian's internal cache). Every Concept Note view in the dashboard shows backlinks: which Cards, Sessions, Projects, and Bridges reference this concept. Used by F4 (Feynman tutor seeds questions from how a concept is *used*, not just defined) and by F6 (a concept with no recent backlinks gets surfaced as cold).
- **MOC auto-index (revised v0.7).** The app writes structured sections into MOCs between HTML comment markers (`<!-- cic:milestones -->` etc., see F1's MOC body template) — replicating common queries (list concepts by domain, "going cold", bridges, open questions, active Projects, recent Sessions). **The app does NOT depend on the Dataview plugin.** MOCs render natively in plain Obsidian out of the box. Users who happen to have Dataview installed can add their own queries in user-owned sections; the app never touches those.
- **Block-id management (v0.7).** When the AI generates cards citing a source note (F3.6), it inserts `^block-id` markers in the source note at paragraph boundaries. IDs are deterministic (hash of paragraph content) so regenerations are idempotent — no duplicate `^abc123 ^abc123` build-up. The `VaultWriter` does this inline as part of the card-generation transaction.
- A **graph view** of note links (cross-domain bridges highlighted).
- Two-way sync with file-watcher; conflict handling when Obsidian edits the same file (see the concrete UX in §13).

### F8 — Command Center Dashboard (inherited + extended)
HUD dashboard: live status, current/longest streak, today's protocol checklist, 12-week activity heatmap, per-domain allocation with cold-flags, recent sessions, due-cards count. This is the war-room dashboard generalized + fed by real vault/SRS data instead of `localStorage`.

### F9 — Reminders / Notifications
**Native OS notifications** (Tauri/Electron) for daily session + due reviews — replacing the current ICS-file workaround. Configurable time; respects "already logged today."

### F10 — Course Generation Engine ⭐
The feature that turns the platform from a tracker into a tutor. Two input modes converge on **one** intermediate representation — the **Course Blueprint** (§8) — which the user reviews, then materializes into a vault MOC + SQLite rows that are pre-wired into every learning loop. *Generation is always human-in-the-loop: the AI never auto-commits a course.*

```
Mode A: Sparring ──┐
                   ├─► Course Blueprint (IR) ─► [USER REVIEW/EDIT] ─► Materialize ─► Loop-wired Course
Mode B: Ingestion ─┘
```

#### F10.1 — Mode A: Conversational sparring ("Campaign Architect")
A first-class guided dialogue (exactly the flow used to design the CS+AI campaign in this project's origin). The AI:
- elicits **target granularity/scope up front** (see F10.7), then **target capability, current level (a calibration gate), time budget, and front-load preference** (reuses the elicitation/calibration pattern),
- proposes a structure, the user pushes back, they iterate,
- on agreement, emits a **Course Blueprint** (or a **Campaign Blueprint** = several linked course blueprints, when the chosen target is campaign-scale).
Grounded by the provider layer (§10); guardrails (§10.9) apply.

#### F10.2 — Mode B: Ingestion ("structure a course from this content")
Hand it a **PDF, ebook (EPUB), or Markdown file** → get a loop-ready course. The user **sets the target granularity up front** (F10.7) before generation runs. Pipeline:
1. **Parse & map.** Extract text + structure (TOC, chapters, headings, figures). Parser is format-aware:
   - **Markdown** — the cleanest case: headings (`#`/`##`/`###`) *are* the structure; existing `[[wikilinks]]`/frontmatter are preserved. Ingesting a `.md` that already lives in the vault is a first-class path (e.g. turn a pile of rough notes into a structured course). No OCR, no layout guessing.
   - **EPUB** — structured spine + TOC; reliable.
   - **PDF** — messiest: handle textbook / paper / slide-deck shapes; OCR fallback for scanned PDFs (§13 risk).
2. **Chunk & embed** into the vector store. *Side benefit:* the ingested source becomes an **authoritative RAG source** the Feynman tutor (F4) and quizzes (F5) cite — so for that course, the source of truth is literally the document, not the model.
3. **Synthesize the Blueprint.** The AI transforms the document into capability milestones, placement (domain/campaign), a dependency graph, and per-milestone source mappings + seeds (see F10.4) — **fitting the structure to the user's chosen target** (F10.7), not the document's raw size.
4. **Review → materialize.**

> **Design rule — transform, don't mirror.** A document's TOC (or a note file's heading tree) is *not* a good learning sequence by default (front-matter, optional chapters, uneven difficulty, reference appendices). The AI must resequence into capability milestones through the desirable-difficulties lens, not just copy headings into a list.

#### F10.3 — Materialization
On approval, the Blueprint becomes durable: write the **MOC Markdown** (frontmatter ← blueprint), insert `courses` + `milestones` + `source_map` rows, register the `source`, and create `cards` as **`status: suggested`** (not yet scheduled — see guardrail). Idempotent and re-runnable (regenerating a section updates, doesn't duplicate).

#### F10.4 — Loop-seeding (how "the AI orchestrates the rest")
Generation doesn't stop at an outline — it seeds **all five loop mechanisms** so a freshly generated course is immediately runnable:
- **Daily Loop (F2):** each milestone's capability statement *is* a ready session objective; its `sourceMap` feeds the active-study step.
- **SRS (F3):** `cardSeeds` become suggested flashcards.
- **Retrieval quizzes (F5):** `retrievalQs` seed the quiz bank.
- **Feynman (F4):** `feynmanTargets` mark concepts to interrogate.
- **Interleaving scheduler (F6):** domain tags + the dependency graph let the new course slot into the rotation immediately, respecting prereqs.

#### F10.5 — The desirable-difficulty guardrail (CODIFIED DEFAULT)
**AI-generated content must never short-circuit the learning it's meant to support.** If the app hands the user a complete set of polished notes and answered cards, it recreates exactly the *input-hoarding / illusion-of-competence* failure mode the whole methodology exists to prevent (the value is in the user retrieving and writing in their own words — not reading the AI's). This is a **locked product decision, not a configurable default that ships flipped:**
- **Scaffold is THE default generation mode** — structure, objectives, source mappings, and *questions* (retrieval Qs, Feynman targets, card **fronts**), but **not** pre-written answers/notes. The user produces the durable knowledge artifacts through the loop. Scaffold is the path the happy-path UI leads to; Full-draft is never pre-selected.
- An opt-in **Full-draft** mode may pre-fill answers/note stubs, but they are clearly marked `ai-draft`, and a card/note is **never** counted as "learned" until the user has actually engaged it (reviewed the card, rewritten the stub in their own words). Full-draft requires an explicit, deliberate switch each time — it does not become sticky/remembered as a preference.
- Framing: the generator's job is to remove **setup** friction, never **thinking** friction.

#### F10.6 — Provenance & privacy
Generated MOCs/notes carry `generated_by` + source provenance in frontmatter. Ingested copyrighted sources stay **local** (consistent with §3); if a remote provider is configured, excerpts are sent for synthesis — the **local-only lockdown mode (§10.6)** protects ingested content too.

#### F10.7 — Target-setting up front (granularity)
**The user declares the intended scope before generation runs; the AI fits to that target rather than inferring granularity from document size.** This removes guesswork and makes output predictable. The target is a small, explicit choice:
- **Scope:** `single course` | `campaign` (multiple linked courses). Determines whether the engine emits a Course Blueprint or a Campaign Blueprint.
- **Depth:** roughly how many milestones / how deep (e.g. *overview*, *working knowledge*, *deep mastery*) — shapes milestone count and granularity.
- **(Mode B) Coverage:** whole document vs a chapter range, when the user only wants part of a source.

Behavior: the synthesis step is **constrained by the target** — a 900-page textbook with a `single course / overview` target yields a tight high-level course, while the same book with a `campaign / deep mastery` target yields a multi-course campaign. The AI may *advise* if the target seems mismatched to the material ("this is a lot for one course — consider a campaign?"), but it **does not override** the user's choice. The target lives on the Blueprint (`granularity` + a `targetDepth` field) and is editable on review.

### F11 — Projects: Applied Practice ⭐
The mechanism that closes the *knowledge → application* gap. Before this feature, no part of the system had transfer/application as its primary mechanism (see §15) — every loop component reinforced *acquisition* (retrieval, spacing, elaboration). Projects close that.

A **Project** is a concrete problem the user solves using **1..N Milestones' worth of capability** from a single Course. It is the unit of *application* — distinct from a Milestone (capability gate: *"be able to derive X"*) and a Session (one run of the daily loop). **Optional per Course** — some Courses will have many, some will have none. *Always human-driven: the AI suggests but never solves.*

#### F11.1 — Authoring (manual)
Create a Project from a Course MOC. Required: title, course, at least one Milestone link, a capability statement (one sentence — *"what does completing this prove I can do?"*). Optional: additional Milestones, template hint, opening problem framing. Writing a Project **generates a Markdown file in the vault** via `VaultWriter`. Editing the file in Obsidian directly is reflected back on next sync.

#### F11.2 — Non-conform format (the key design choice)
Projects vary radically by domain: a math project is a proof or computation, a CS project is code, a language project is an essay, a history project is a primary-source analysis. The schema reflects this with a **two-layer split**:

- **Mandatory frontmatter (small, fixed)** — `type: project`, `id`, `course`, `milestones[]`, `capability`, `status`, `opened`, `closed?`, optional `template`. This is the integration layer — dashboards (F8), scheduler (F6), SRS (F3), and queries hook into it. Validated via **zod** on read.
- **Freeform body (domain-shaped)** — suggested headings: *Problem · Approach · Work · Reflection*. **Per-domain templates** override the body shape. Ship 3 seed templates in V1: `math/proof`, `cs/implement`, `freeform`. Templates are plain Markdown files in the vault — users add more without touching the app.

The AI may *suggest* a template but the user picks; no auto-format enforcement beyond the wrapper. A Project's "Work" section can be diagrams, code, prose, proofs, recordings — whatever the domain demands.

#### F11.3 — Status & loop integration
Statuses: `open` (created, not started) → `in-progress` (≥1 Session has touched it) → `complete` (closed with a reflection claiming mastery) or `abandoned` (closed without that claim — neutral, not failure).

How each existing loop component plugs in:
- **Daily Loop (F2):** A Session can be a Project work block — `sessions.project_id` links them. The retrieval-before-reveal step pulls from prior Project reflections ("what did you last get stuck on?") rather than a generic prompt.
- **SRS (F3):** On status transition to `complete` / `abandoned`, the close prompt offers to spawn cards from the reflection's *"what I had to look up / what was hard"* answers. Manual approve per the F10.5 guardrail — never auto-spawn.
- **Feynman (F4):** Mark a complete Project as a Feynman target — *"explain what you built and why this approach over alternatives."* Grounded in the Project's reflection + linked notes.
- **Scheduler (F6):** Open Projects with no recent Session activity surface as cold on the dashboard, alongside cold Courses.
- **Dashboard (F8):** Active Projects per Domain shown alongside cold Courses and due cards.

#### F11.4 — AI suggestion (deferred to F10 / Phase 3.5)
The Course Generation Engine optionally seeds Projects. The Course Blueprint IR (§8) gains `projectSeeds[]` — primary milestones, scope hint (small / medium / large), problem sketch, template hint. The user reviews / edits / approves each seed the same way as any other Blueprint output. Per F10.5, **AI suggests but never solves**; the project work and the reflection are the user's. *No part of generation auto-marks a Project complete.*

#### F11.5 — Out of scope (V1, locked)
- **Auto-grading.** AI does not assess project correctness. The Feynman tutor (F4) can probe a math proof or a piece of code; the user runs their own tests; the platform does not adjudicate. Consistent with PRD §3 principle 4 — *"AI is a tutor, not an oracle."* Also in §14 Non-Goals.
- **Mandatory projects per Course.** A Course with zero Projects forever is a valid configuration. Some domains (e.g. memorising vocabulary) may never need them.
- **Cross-Course projects.** A Project belongs to exactly one Course. Cross-Course application is what `Bridge` notes (§5) are for. Revisit if real usage demands it.

---

## 10. AI Provider Layer (vendor-agnostic)

All AI capability sits behind a single provider abstraction so the user can plug in any backend and mix providers per task. **No feature may import a vendor SDK directly** — everything goes through this layer.

### 10.1 The `Provider` interface
A minimal contract every adapter implements:
- `chat(messages, opts) → AsyncStream<token>` — streaming chat/completion.
- `embed(texts[]) → vector[]` — embeddings for RAG.
- `capabilities() → { chat, embeddings, streaming, tools, contextWindow }` — feature/limits probe.

### 10.2 Shipped adapters
- **`OllamaAdapter`** — local; chat + embeddings. The default "fully-local" backend.
- **`OpenAICompatibleAdapter`** — configurable **base URL + API key**. This is the keystone: a single adapter covers **OpenRouter, LM Studio, llama.cpp `--server`, vLLM, OpenAI, Together, Groq**, and most vendors, because they all expose the OpenAI-compatible `/v1/chat/completions` (and usually `/v1/embeddings`) surface. (Note: LM Studio + llama.cpp server are the user's existing local setup — covered here for free.)
- **`AnthropicAdapter`** — native Messages API.
- *Extensible:* additional native adapters (Google, etc.) drop in by implementing the interface.

> Coverage strategy: ship **Ollama + OpenAI-compatible + Anthropic** and you reach local, OpenRouter, and the major frontier vendors on day one. Everything else is an adapter PR.

### 10.3 Role-based model routing
The config maps each AI **role** to a provider+model independently:
- `reasoning` — deep Socratic interrogation / hard explanations (e.g. a frontier model).
- `drafting` — fast/cheap card + question generation (e.g. a small local model).
- `embeddings` — RAG indexing (e.g. a local embedding model).

This enables privacy-savvy mixes — e.g. **embeddings + RAG fully local while reasoning calls a frontier API**, or **everything local** for a fully offline operator.

### 10.4 Config & secrets
- Provider configs + routing live in a local `providers.config` (not in the vault, never synced).
- **API keys stored in the OS keychain** (via Tauri) or an encrypted local file — never in plaintext, never in the vault, never committed.
- Setup UI: add a provider (pick type → enter base URL/key → test connection → probe capabilities), then assign providers to roles.

### 10.5 Capability handling & fallback
- If a chosen chat provider lacks embeddings, embeddings auto-route to a configured local default.
- A configurable **fallback chain** (e.g. primary remote → local Ollama on error/offline) keeps the app usable. **Requirement:** with a local model configured, the app remains fully functional **offline**.

### 10.6 Privacy posture (explicit tradeoff)
Storage is always local, but configuring a remote provider means RAG context (excerpts of the user's vault notes) and prompts are sent to that vendor. The provider setup UI must state this plainly. A **local-only lockdown mode** refuses to send vault content to any non-local endpoint — a selectable hard guarantee that honors the "fully local" principle while still allowing opt-in cloud for those who want it.

### 10.7 RAG pipeline (provider-independent)
On note save, chunk + embed into the local vector store. At query time, retrieve top-k relevant chunks from the vault + ingested sources to ground prompts. The embedding provider is just another routed role (10.3).

### 10.8 Prompt templates (versioned, in-repo, backend-independent)
- *Socratic interrogation* — "ask one question at a time, probe gaps, don't lecture," grounded in retrieved context.
- *Card generation* — "atomic Q/A, avoid pattern-matchable cards."
- *Retrieval quiz* — "N questions easy→hard, withhold answers."
- *Bridge finder* — "given these two domains' notes, propose candidate cross-domain connections."

### 10.9 Guardrails (apply to every backend)
Domain-tagged confidence policy; mandatory source citation in technical domains; "I'm not certain — verify against [source]" rather than fabrication. These live **above** the provider layer so they hold regardless of which model answers.

---

## 11. Tech Stack (target)

| Layer | Technology | Rationale |
|---|---|---|
| Desktop shell | **Tauri** (locked) | Tiny binary, low RAM, native FS + notifications, strict security; TS-friendly plugins |
| Frontend | **React + TypeScript + Tailwind + Vite** | Reuse war-room React components; Vite replaces the Next.js shell |
| Native bridges | **Tauri plugins:** `sql` (SQLite) · `fs` (vault) · `notification` | Keep backend work in TS; Rust only for custom native code |
| Tracking/SRS store | **SQLite** | Local-first, fast, matches existing comfort |
| Knowledge store | **Obsidian vault (Markdown)** | Canonical, second-brain, portable |
| Vector store | **sqlite-vec** or **LanceDB** | Local embeddings; sqlite-vec keeps it in-family |
| AI layer | **Vendor-agnostic provider abstraction** (adapters: Ollama · OpenAI-compatible · Anthropic) | Plug in local, OpenRouter, or any frontier vendor; route per task (§10) |
| SRS | **Native FSRS** (e.g. `ts-fsrs`) | In-app spaced repetition; no external Anki dependency (F3) |
| Testing / CI | **Vitest + GitHub Actions** | Inherited |
| License | **OSI-approved open source** (choice TBD — see §13) | Released publicly on GitHub; all deps permissively/openly licensed |

> Note on migration cost: war-room's React components port cleanly. The real work is (a) replacing the Next.js shell + Supabase/Postgres with Tauri + SQLite + vault sync, and (b) building the learning engine (F2–F6, F10). All chosen dependencies (Tauri, SQLite, FSRS implementations, sqlite-vec/LanceDB) are open-source-compatible, consistent with the project's public-release goal.

---

## 12. Phased Roadmap

**Phase 0 — Foundation rework (off war-room):**
- Fork/rename repo; **stand up the Tauri + React + Vite shell**, porting war-room's React components off the Next.js shell.
- Generalize hard-coded domains → user-defined.
- Replace Supabase/Postgres with **SQLite** (via `tauri-plugin-sql`); wire `tauri-plugin-fs`.
- Establish the data model (§8).
- *Milestone: a native desktop window with the ported HUD, reading/writing local SQLite.*

**Phase 1 — Vault integration (MVP):**
- Vault read/write service (Tauri fs); course authoring ↔ MOC files (F1, F7).
- Generalized dashboard fed by real data (F8).
- *Milestone: a course created in-app appears as a MOC in the vault and vice versa.*

**Phase 2 — Retention engine:**
- Native **FSRS** SRS + full in-app review UI (F3).
- Daily Loop guided flow writing notes + writeups to the vault (F2).
- Native notifications for reviews/sessions (`tauri-plugin-notification`, F9).
- **Projects MVP (F11):** manual authoring from a Course MOC, frontmatter zod schema, status tracking, `sessions.project_id` / `cards.project_id` links wired, close-reflection prompt that offers manual card-spawn. Ship 3 seed templates (`math/proof`, `cs/implement`, `freeform`). No AI suggestion yet.
- *Milestone: complete one full loop end-to-end, cards scheduled, reminders firing, and one Project opened → in-progress → complete with a card spawned from the reflection.*

**Phase 3 — AI engine:**
- Vendor-agnostic provider layer + RAG indexer (§10).
- Feynman/Socratic interrogation + retrieval quizzes + AI card-drafting (F4, F5).
- *Milestone: explain a concept, get gap-finding questions grounded in your own notes.*

**Phase 3.5 — Course generation (F10):**
- Course Blueprint IR + materialization path (F10.3) reusing the F1 vault-write path.
- Mode A conversational "Campaign Architect" (F10.1); target-up-front (F10.7).
- Mode B ingestion (Markdown → EPUB → PDF): parse → embed → synthesize → loop-seed (F10.2, F10.4), Scaffold mode first.
- **`projectSeeds[]` in the Blueprint (F11.4):** generation suggests Projects per Course; user reviews/edits/approves like other Blueprint output. Materialization writes Project Markdown files via `VaultWriter`.
- *Milestone: drop in a file, review the blueprint, and run the first generated session — with the source itself grounding the Feynman tutor — and with at least one applied-practice Project seeded for review.*

**Phase 4 — Polish + open-source release:**
- Interleaving/desirable-difficulty scheduler (F6); graph view; bridge finder.
- Full-draft generation mode (F10.5) once Scaffold is proven.
- Packaging, signing, auto-update; docs, license, contribution guide; public GitHub release.
- *Milestone: the three legacy tools (HTML dashboard, Anki, manual AI chat) are fully retired.*

---

## 13. Open Decisions & Risks

**Resolved in v0.2:**
- ✅ **Storage/sync:** fully local, no cloud backend. Vault is canonical and mandatory.
- ✅ **AI binding:** vendor-agnostic provider layer (§10); not tied to Ollama or any single vendor.

**Resolved in v0.4:**
- ✅ **Generation default:** **Scaffold is the codified default** (F10.5); Full-draft is an explicit, non-sticky opt-in.
- ✅ **Granularity:** **user sets the target up front** (F10.7: scope + depth); the AI fits to it and may advise but never overrides.
- ✅ **Mode B inputs:** PDF, EPUB, **and Markdown** (markdown being the cleanest parse path, incl. existing vault notes).

**Resolved in v0.5:**
- ✅ **Desktop framework: Tauri** (§6). Electron rejected (bloat); local-Next rejected (not a real app). Frontend is React + Vite; Tauri plugins keep backend work in TS.
- ✅ **SRS: native FSRS, fully in-app** (F3). No Anki dependency — the platform is the single home for review. One-way Anki export is optional/future only, never a workflow split.

**Still open:**
1. **License choice:** an OSI-approved license for the public release — permissive (MIT / Apache-2.0) vs copyleft (GPL / AGPL-3.0). AGPL would keep network-deployed forks open; MIT maximizes adoption. *Owner's call; decide before first public commit.*
2. **Vector store pick:** `sqlite-vec` (keeps everything in the SQLite file, simplest) vs `LanceDB` (richer ANN features). Low-stakes; default to `sqlite-vec` unless scale demands otherwise.

**Risks:**
3. **Vault write conflicts:** Obsidian may have the same file open. **Highest-risk integration point.** Concrete UX (locked v0.7):
   - **Detect.** After every successful `VaultWriter` write, store `(file_path, app_mtime, app_hash)` in the SQLite `vault_writes` table. On every read/write, compare current OS mtime + body hash against the stored values. Mismatch ⇒ Obsidian (or something else) edited the file.
   - **React.** When mismatch is detected on a *write* path, the app does **not** clobber — it opens a 3-way diff dialog: *last app version · current vault version · proposed app write*. The user picks: keep Obsidian's version (app abandons the write), overwrite with app's (with explicit confirmation), or open a manual-merge editor.
   - **Never clobber.** While a conflict dialog is open for a given file, the file-watcher pauses app writes to that file. App-managed MOC sections (between `<!-- cic:* -->` markers) follow a softer rule: app re-renders *only those sections*, leaving content outside the markers untouched even on detected drift.
   - **Read-path drift.** On a *read* path, mismatch is informational — the app picks up the user's changes via the file-watcher and updates SQLite-side state (e.g. status flips, capability edits). No dialog needed unless the change creates a schema-violating frontmatter, in which case the user is shown a "fix or revert?" prompt.
4. **Frontmatter as API:** treating MOC frontmatter as the course schema is elegant but brittle if hand-edited badly. Need schema validation on read.
5. **Ingestion robustness:** PDFs are messy — scanned pages (need OCR), multi-column layouts, math notation, broken TOCs. Mode B PDF quality is bounded by parse quality; budget for it and degrade gracefully. (Markdown/EPUB are clean by comparison.)
6. **Provider quality varies:** Socratic depth + blueprint quality depend on the selected backend. Role-routing + fallback chain (§10.3/10.5) mitigate; local-only mode is a deliberate constraint with set expectations, not a bug.
7. **Multi-device state (out of scope V1):** the vault syncs via Git/Obsidian Sync, but local SQLite tracking/SRS state does not. Accepted single-device limitation for V1; revisit later (e.g. an exportable/syncable SQLite file).
8. **Cross-platform webview quirks:** Tauri uses each OS's native webview, so test rendering on Windows/macOS/Linux; avoid bleeding-edge CSS that WebKit/WebView2 diverge on.
9. **Naming:** "CIC" vs "War Room" vs new. Cosmetic; decide early for package naming.

---

## 14. Non-Goals (V1) & Project Stance
- Multi-user / collaboration.
- Mobile app (responsive web later; mobile is not the daily-driver surface).
- Cloud hosting / accounts.
- Marketplace of shared courses.
- **Auto-grading of Projects (F11).** AI suggests Projects (F11.4), can interrogate them via the Feynman tutor (F4), and helps spawn cards on close — but it does **not** assess whether a Project is correctly completed. The user runs their own tests, verifies their own proofs, judges their own work product. Consistent with §3 principle 4.
- **Monetization — explicitly out.** This is a non-commercial project; commerciability is not a design constraint.

**Project stance:** the goal is a genuinely useful personal learning tool, to be **released as open source on GitHub** once polished. Implications already baked into the spec: all dependencies are open-source-compatible (Tauri, SQLite, FSRS, sqlite-vec/LanceDB); the vendor-agnostic AI layer avoids any proprietary lock-in; and there is no telemetry or account system. Ship with a LICENSE, README, and CONTRIBUTING guide.

---

## 15. Glossary — Mechanism Mapping

| Feature | Learning-science mechanism |
|---|---|
| Retrieval scratchpad, quizzes (F2, F5) | Retrieval practice (testing effect) |
| FSRS flashcards (F3) | Spaced repetition |
| Interleaving scheduler (F6) | Interleaving + desirable difficulties |
| Feynman interrogation (F4) | Elaboration + self-explanation |
| Atomic linked notes, bridges (F7) | Elaboration, transfer, dual coding |
| Streaks, reminders, daily target (F8, F9) | Consistency / spacing over time |
| **Projects (F11)** | **Transfer / application** — closing the *knowledge → use* gap; the largest weakness of pure SRS-based study |
| **Pretest step (F2.5)** | **Errorful generation / pretest effect** — Roediger & Karpicke, Kornell et al.; producing before knowing primes encoding |
| **Calibration (F3.5)** | **Metacognition** — Dunlosky et al.; confidence ratings train accurate self-knowledge, counter the illusion of competence |
| **Surface-form variability (F5/F6/F10)** | **Variability of practice** — Schmidt & Bjork; pairs with interleaving (order) to drive transfer via reduced contextual interference |

---

*End of v0.5. Intended as the initial spec for Claude Code. Hand off alongside the `war-room-2026` repo and the CIC vault as reference artifacts.*

> **Changelog**
> - **v0.7** — Three cog-psych additions closing §15 gaps: **F2.5 Pretest step** (errorful generation; Daily Loop becomes 8-step), **F3.5 Calibration** (1-5 confidence on reviews surfacing overconfidence), and **surface-form variability** as a design requirement on F5/F6/F10. Vault contract tightened: **F1 MOC body template locked** with app-managed sections (HTML comment markers); **F7 backlinks consumption** added (app builds its own backlink index, does not depend on Obsidian's cache); **F3.6 block-ref citations** for cards (jump-to-paragraph on review); **vault subfolder support** in §6 (CIC can live in `Learning/` of a larger vault); **F7 Dataview decision locked** — no plugin dependency; **§13 conflict resolution UX** specified with detect (mtime+hash via `vault_writes`)/react (3-way diff dialog)/never-clobber (paused writes while dialog open) rules. Data model gains `confidence` on reviews, `vault_writes` and `pretest_responses` tables.
> - **v0.6** — Added **F11 Projects: Applied Practice** (§9): optional applied-practice artifact per Course; **multi-milestone** (1..N capabilities applied to one concrete problem); mandatory frontmatter + freeform body with per-domain templates (math/proof, cs/implement, freeform); AI suggestion via `projectSeeds[]` deferred to F10 / Phase 3.5; codified as the system's **transfer / application** mechanism (§15). Extended data model (§8) with `projects` / `project_milestones`; made `sessions.project_id` / `cards.project_id` nullable. Locked: single-Course only (cross-Course handled by Bridges), no auto-grading (§14), Phase 2 ships manual MVP before AI augmentation. Concept ladder updated (§5).
> - **v0.5** — Locked **Tauri** as the desktop shell (§6, §11; frontend → React + Vite, TS-friendly Tauri plugins) and **native in-app FSRS** for SRS with no Anki dependency (F3). Recorded the **open-source / non-commercial** project stance (§14). Moved Tauri adoption to Phase 0 and reframed Phase 4 as polish + public release (§12). Resolved the desktop + SRS open decisions; added license + vector-store picks (§13).
> - **v0.4** — Codified **Scaffold as the default** generation mode (F10.5); added **target-up-front** granularity (F10.7: user sets scope + depth, AI fits to it); extended Mode B ingestion to **PDF, EPUB, and Markdown**. Updated the Blueprint IR (§8) and resolved the corresponding open decisions (§13).
> - **v0.3** — Added the **Course Generation Engine** (F10): conversational sparring + PDF/ebook ingestion → reviewable **Course Blueprint** IR → loop-seeded course. Added the Blueprint IR + `sources`/`source_map` to the data model (§8), the desirable-difficulty guardrail (F10.5), Phase 3.5 to the roadmap, and generation risks (§13).
> - **v0.2** — Locked two decisions: (1) fully local + Obsidian-reliant, no cloud backend (§3, §6); (2) vendor-agnostic AI provider layer replacing the Ollama-default integration (§10 rewritten, §11 stack, §13 resolved). Added local-only lockdown mode and role-based provider routing.
> - **v0.1** — Initial spec.
