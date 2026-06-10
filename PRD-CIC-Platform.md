# PRD — Combat Information Center (CIC) Learning Platform
### Initial Specification for Claude Code · v0.9.11

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
>
> **Locked in v0.8:** Closing the **Resource ↔ Session ↔ Card** chain. **Resources** become a first-class entity (books, PDFs, EPUBs, Markdown, video files, video URLs, web pages, audio) with kinds, locators, and optional AI-ingestion. Sessions get explicit **assignments** (`session_assignments`) — "read pp.10-15", "watch 00:15-00:23", "review Chapter 3" — that drive F2's active-study step. **Cards cite Resources directly** (M:N `card_resources` with locators), in addition to the v0.7 block-ref-to-Note citation. Naming pass: the old "Source" / "Source Note" domain term is renamed to **Resource** / **Resource Note** for consistency (Source was overloaded — meant both the document and the user's commentary; English-idiom uses of "source" stay). Blueprint IR's `source` field → `input` to disambiguate from the Resource concept.
>
> **Clarified in v0.9.1:** The **F1 MOC body template** now wraps `## Capability` in `<!-- cic:capability -->` markers, matching every other app-managed section. This is a clarification (not a new lock) of the v0.7 template: Capability was always app-managed, and uniform marker delimitation lets the `VaultWriter` round-trip it safely (replace only the text between markers) without a second, heading-scoped parsing mode. Surfaced during Feature 007 planning (`specs/007-course-moc/research.md` R2) and reconciled here per Constitution V (update the PRD before implementation).
>
> **Added in v0.9.2:** **F1 Course deletion** semantics, with the *single sanctioned exception* to "the app never deletes vault files." Deleting a Course always drops its SQLite rows; the user then explicitly chooses the MOC's fate — **Detach** (default, keeps the note by stripping its `cic-type`/`cic-id` so a rescan won't re-import it) or **Delete the MOC too**. Vault-file deletion is user-initiated, confirmed in a dialog that names the file, routed through the one `VaultWriter` chokepoint, and never-clobber-aware (a drifted/unmanaged file is refused unless re-confirmed). Folded into Feature 007 (`specs/007-course-moc/`); reconciled here per Constitution V (update the PRD before implementation).
>
> **Locked in v0.9.11 — Phase 3 begins:** **§10 AI Provider Layer implemented** (Feature 016). The vendor-agnostic `Provider` interface + three adapters (Ollama / OpenAI-compatible / Anthropic) + the `AIRouter` chokepoint + a `/settings` AI section ship in one PR. The full implementation contract is the in-repo design doc [ai-provider-layer.md](ai-provider-layer.md). Critical refinement during planning (C1 finding from `/speckit-analyze`): **the lockdown gate runs at EVERY step of the fallback walk**, not just the primary — per Constitution II's "regardless of any other configuration" wording. The router's `[local→remote]` chain with lockdown + vault content correctly surfaces the lockdown error when the local primary fails retryably, rather than silently leaking vault content to the remote step. Verified by a dedicated regression test in `routerImpl.fallback.test.ts`. Stack additions: `keyring = "3"` Rust crate (native OS credential store wrapped by an `ai_keychain_*` custom Tauri command). No new TypeScript dep, no new SQLite migration (AIConfig lives in the existing `settings` KV).
>
> **Locked in v0.9:** Visual design **decoupled from war-room's tactical-HUD aesthetic**. CIC's frontend follows the **Obsidian theme** — soft charcoal surfaces + purple primary (matches Obsidian wikilinks) + Inter typography + soft 8px radius + flat-and-calm — per the new canonical artifact [CIC-Design-Language-Obsidian.html](CIC-Design-Language-Obsidian.html) at the project root. The **IA, screen layouts, and component vocabulary still derive from war-room** (panels, stat cells, heatmap, stepper, checklist, dependency graph); **only the visual skin changed** (no hex grid, no corner brackets, no scanlines, no boot sequence — those clash with the user's Obsidian vault). **Critical color rule (never reverse):** purple = brand / links / active states; cyan (`#00bfbc`) = AI-generated output ONLY.

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
2. **The vault is the source of truth.** All *knowledge* (notes, course definitions, resource notes, session writeups) lives as plain Markdown in the user's Obsidian vault. The app reads and writes those files; it never locks knowledge inside a proprietary DB. The user can always open the vault in Obsidian directly.
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
- **Information architecture + component vocabulary** from war-room — panels, stat cells, checklist, activity heatmap, stepper, dependency graph, domain-colored accents, persistent left rail. **The visual *skin* is replaced** with the Obsidian theme (v0.9) per [CIC-Design-Language-Obsidian.html](CIC-Design-Language-Obsidian.html): soft charcoal surfaces, purple primary, Inter typography, 8px soft radius, flat & calm. War-room's tactical-HUD accents (hex grid, corner brackets, scanlines, boot sequence, monospace-everywhere) are **NOT** carried over — they belong to the war-room aesthetic and clash with the user's Obsidian vault. The IA carries; the skin changes.
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
| — (new) | **Resource** | Any reference material the user studies — book, PDF, EPUB, Markdown, video file, video URL, web page, audio. First-class entity per Course, with kinds + locators (see F1, §8) |
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

- **Knowledge → Obsidian vault (Markdown + frontmatter).** Source of truth. Notes, course MOCs (with milestone/resource/dependency frontmatter), resource notes (commentary on books, PDFs, videos, web pages, etc.), bridges, session writeups. Human-editable, Git-able, openable in Obsidian.
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
- **Concept Note** — `type: concept`, `domain`, links (`builds_on`, `related`), self-test Q/A, optional `resource_ref` linking back to the Resource(s) that taught this concept.
- **Resource Note** — `type: resource-note`, `resource_id` (FK to `resources` in SQLite), optional `locator` (when the note covers a specific section/chapter/range), `author?`. The user's commentary, summary, or lit-review excerpt about a Resource. Distinct from the Resource itself (which lives in SQLite + optionally as a file on disk).
- **Bridge Note** — `type: concept`, `tags: [bridge]`.
- **Session Writeup** — `type: log`, `date`, `course`, `objective`, recalled-from-memory, gaps, cards-made.
- **Project** — `type: project`, `id`, `course`, `milestones[]`, `capability`, `status` (`open` | `in-progress` | `complete` | `abandoned`), `opened`, `closed?`, `template?`. Body: suggested *Problem · Approach · Work · Reflection* headings — per-domain templates override the body shape (math/proof, cs/implement, freeform). Mandatory frontmatter = integration layer; freeform body = domain-shaped. See F11.

### SQLite (tracking, scheduling, SRS)
- `vaults(id, path, created_at)` — *(added v0.9.3)* one row per connected vault CIC tracks; `id` is a stable identity stored in a hidden in-vault marker (`.cic/vault.json`) so it survives folder rename/move; `path` is the last-connected folder. The data partition key — exactly one vault is *active* at a time
- `domains(id, name, color, vault_id)` — *(`vault_id` added v0.9.3)* `vault_id` is a nullable FK to `vaults(id)` (NULL only for pre-feature rows until adopted on first connect). The **scope anchor**: Campaigns/Courses/Milestones inherit their vault transitively via their Domain, so a single link here partitions the whole hierarchy. *(Note: `domains.name` remains globally UNIQUE for now — per-vault same-named Domains are a deferred refinement requiring a table rebuild; see Feature 009 research R3/R8.)*
- `campaigns(id, title, domain_id)`
- `courses(id, title, domain_id, campaign_id, moc_path)` — `moc_path` links to the vault file
- `milestones(id, course_id, capability, status, order)`
- `sessions(id, course_id, project_id?, date, objective, minutes, did_retrieval, writeup_path, status, completed_at?, milestone_id?, order_index)` — `project_id` is a nullable FK (most sessions don't link to a Project). *(`status` + `completed_at` added v0.9.7)* — a session is **two-phase** (Feature 012): `status` ∈ `planned` / `completed`. It is *established* (planned) on the Course with its assignments/pretest-questions/card-drafts, then *done* later from the Daily Loop, which flips it to `completed` and sets `completed_at`, `minutes`, `did_retrieval`, `writeup_path`. `date` is the planned/creation time. *(`milestone_id` + `order_index` added v0.9.8 — Feature 013)* — `milestone_id` is a nullable FK to `milestones(id)` **ON DELETE SET NULL** (the Course Milestone this session advances, optional; deleting a Milestone **unmaps** its sessions, never deletes them — resolves the §8 gap deferred in 010/012); `order_index` is the session's position within its Course's curriculum sequence (course-scoped, normalized `0..N-1`; listing sorts by `(order_index, date, id)`). Same-Course membership of `milestone_id` is enforced in-app (FR-010); coverage/progress are **derived**, not stored
- `cards(id, course_id, note_path, note_block_id?, project_id?, front, back, fsrs_state JSON, due_at, last_reviewed, created_at)` — `project_id` is nullable (cards may be spawned from a Project's close-reflection); `note_block_id` *(added v0.9.4)* is the Obsidian block-id of the cited paragraph in `note_path` (F3.6); `fsrs_state` is the FSRS scheduling card (owned by the native FSRS engine, F3)
- `reviews(id, card_id, rating, confidence?, reviewed_at, elapsed_ms)` — `confidence` ∈ 1..5 (nullable at the schema level; the review UI **requires** it with no default — F3.5/Constitution III); used to surface overconfident cards (F3.5)
- `streaks(date, minutes, domains_touched JSON)`
- `projects(id, course_id, title, capability, status, opened_at, closed_at, project_path, template?)` — `project_path` links to the vault file; `status` ∈ `open` / `in-progress` / `complete` / `abandoned`. *(`title` added v0.9.10 — Feature 015 — a short human label distinct from the `capability` sentence; the DB-only dashboard read-model lists active Projects without touching the vault, so it needs a label in SQL. The other columns + `project_milestones`/`project_resources` + the nullable `sessions.project_id`/`cards.project_id` FKs have existed since `m0001`.)*
- `project_milestones(project_id, milestone_id)` — M:N; a Project applies 1..N Milestones' capability
- `vault_writes(file_path, app_mtime, app_hash)` — written by the app *after* a successful `VaultWriter` write; the file watcher compares OS mtime + body hash against this to detect Obsidian-modified-since-app (drives the §13 conflict UX)
- `pretest_responses(session_id, question, user_response, revealed_after)` — captures the pretest answers (F2.5); used in the session writeup's "what you thought vs what's true" comparison
- `resources(id, vault_id?, domain_id?, title, kind, file_path?, url?, metadata JSON, ingested_at?, added_at)` — first-class entity (v0.8). *(`vault_id` added v0.9.4)* — a nullable FK to `vaults(id)` that scopes the Resource registry per active vault (a Resource is parallel to the Domain hierarchy, so it carries its own vault link rather than inheriting one; Feature 010 research R6). *(`domain_id` added v0.9.5)* — a nullable FK to `domains(id)` **ON DELETE SET NULL**: an optional "home Domain" so the registry can be filed/filtered by Domain (Feature 011, F10.8 / FR-012); deleting the Domain unfiles its Resources rather than deleting them. `kind` ∈ `pdf` / `epub` / `markdown` / `video_file` / `video_url` / `web_page` / `book` / `audio`. `file_path` is local; *(v0.9.5)* file-kind Resources attached via the in-app native picker store an **internalized copy** under the OS app-data dir (`appLocalData/resources/<id>/`) — **outside the vault** (Constitution I) — and `file_path` points at that copy; the copy is removed when the Resource is deleted (Feature 011). `url` is web. `metadata` is kind-specific (author, isbn, duration, transcript_path, …). `ingested_at` is non-null only when AI has chunked + embedded it (see vector store below) — a Resource can exist without ever being ingested (physical books, copyrighted videos)
- `course_resources(course_id, resource_id, role)` — M:N; `role` ∈ `primary` / `secondary` / `reference`. A Resource may be referenced by multiple Courses (one textbook, several courses)
- `session_assignments(session_id, resource_id, locator, assignment_kind)` — what the user is supposed to read/watch/listen to in this session. `assignment_kind` ∈ `read` / `watch` / `listen` / `review`. `locator` is a free-form string with kind-specific conventions (`p.10-15`, `00:15:30-00:23:45`, `#section-3`, `Ch.3 §2`). Established at **plan** time; the Daily Loop's active-study step iterates these
- `session_card_drafts(id, session_id, front, back, order_index)` *(added v0.9.7)* — intended SRS card prompts **staged at plan time** (front required, back optional). On finish they are materialized into real **new** `cards` (citing the session's assignments, deduped by resource) and then deleted. They live in their own table — not `cards` — so an un-engaged prompt never enters the review queue before the session is done (Constitution III)
- `card_resources(card_id, resource_id, locator)` — M:N; a Card cites 0..N Resources at specific locations. Pre-populated from the spawning session's assignments; user can edit at spawn-time. Review-time the citation can deep-link back to the Resource (PDF page, video timestamp, URL anchor — best-effort per kind)
- `project_resources(project_id, resource_id, locator)` — M:N; optional. A Project may target specific Resources (e.g. "solve problems from Strang Ch.3" → resource=Strang, locator=Ch.3)

### Vector store
- `chunks(id, note_path, text, embedding, resource_kind)` — for RAG over the vault + ingested Resources.
- `resource_map(id, milestone_id, resource_id, locator)` — links a milestone to exact Resource ranges (chapter/section/page/loc + chunk ids) for grounded study, cards, and quizzes. The `resources` table itself is now first-class in SQLite (above) — only the *RAG mapping* lives here.

### Course Blueprint (the generation IR — see F10)
A transient, reviewable intermediate object that **both** generation modes emit and that materializes into the vault + SQLite on approval. Not persisted long-term; the materialized MOC + rows are the durable artifact.
```jsonc
CourseBlueprint {
  title, domain, campaign?,            // placement
  summary,
  input: { type: "conversation" | "document", ref, chunkCount? },  // generation origin (not a Resource)
  docKind?: "pdf" | "epub" | "markdown",  // Mode B parse path
  granularity: "course" | "campaign",  // SET BY USER UP FRONT (F10.7)
  targetDepth: "overview" | "working" | "mastery",  // SET BY USER UP FRONT
  milestones: [{
    id, capability,                    // "be able to derive X" — the loop objective
    dependsOn: [milestoneId],
    resourceMap: [{ resourceId, locator }], // exact ranges → study + RAG grounding
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

**Resource registration (v0.8).** Adding a Resource to a Course is a first-class action — not a free-form string in MOC frontmatter. The authoring UI offers a kind picker (`pdf` / `epub` / `markdown` / `video_file` / `video_url` / `web_page` / `book` / `audio`) and kind-appropriate fields: file picker for local files, URL field for web, manual title/author entry for books with no file. The Resource is stored in `resources` (SQLite); the M:N link to the Course is stored in `course_resources` with a `role` of `primary` / `secondary` / `reference`. **Resources are reusable across Courses** — one textbook can be the primary Resource of two related Courses without duplication. The MOC body's `## Resources` section is rendered from these rows (between the `<!-- cic:resources -->` markers per the v0.7 template).

**MOC body template (locked v0.7; capability markers clarified v0.9.1).** Every Course MOC has a fixed body structure so dashboards, scheduler, and AI features can rely on it:

```markdown
## Capability        <!-- cic:capability --> ... <!-- /cic:capability -->   (one paragraph — what completing this Course proves)
## Milestones        <!-- cic:milestones --> ... <!-- /cic:milestones -->
## Resources         <!-- cic:resources --> ... <!-- /cic:resources -->
## Active Projects   <!-- cic:projects --> ... <!-- /cic:projects -->
## Recent Sessions   <!-- cic:sessions --> ... <!-- /cic:sessions -->
## Notes             <!-- cic:notes --> ... <!-- /cic:notes -->
## Reflections       <!-- user-only — app never writes here -->
```

The HTML comment markers (`<!-- cic:capability -->`, `<!-- cic:milestones -->`, …) delimit **app-managed sections** that the app re-renders on every sync. Capability is marker-delimited like every other app-managed section (clarified v0.9.1) so the writer can round-trip it safely — replacing only the text *between* its markers — making the merge/parse contract uniform across all sections. Content *outside* the markers — including the entire `## Reflections` section — is user-owned and never overwritten. This contract means the app never needs Dataview to render dynamic lists; plain Obsidian shows a working MOC out of the box (see F7).

**Course deletion (v0.9.2).** Deleting a Course always removes its SQLite rows (milestones, `course_resources`, etc. cascade). Because the vault is sacred, the user explicitly chooses what happens to the MOC `.md`:
- **Detach (default)** — keep the note. The app strips the `cic-type`/`cic-id` discriminator (via the `VaultWriter`) so a rescan no longer recognizes it as a Course and won't re-import it; the body, including `## Reflections`, is left verbatim. **No vault file is deleted.**
- **Delete the MOC too** — remove the file. This is the **single sanctioned exception** to "the app never deletes vault files": it is user-initiated, confirmed in a dialog that names the path, routed through the one `VaultWriter.deleteNote` chokepoint, and **never-clobber-aware** — a MOC that drifted externally (or was never app-managed) is refused and left untouched unless the user re-confirms ("Delete anyway"). No silent vault-file deletion is possible. On a successful delete the file's write-log fingerprint is forgotten, so a file later appearing at that path reverts to "unmanaged."

### F2 — The Daily Loop (guided session flow)
A first-class, step-guided session implementing the 8-step protocol (v0.7):
`objective → pretest → active study → retrieve from memory → atomic note + link → self-test/Feynman → make cards → schedule interleave`.
The flow:
- prompts for a **capability-phrased objective**,
- **F2.5 pretest step** — before opening the source, the app presents 2-4 pretest questions on the objective (seeded from prior session writeups, milestone capabilities, or AI-generated from the source's table of contents *without* revealing content). The user attempts answers from intuition or prior knowledge. **Wrong answers are expected and beneficial** — errorful generation primes encoding (Roediger & Karpicke; Kornell et al.). Answers are logged to `pretest_responses` and surfaced in the session writeup as a "what you thought vs what's true" comparison. *Never graded, never scored — the value is in the attempt.*
- **F2.3 Session assignments (v0.8)** — before active study begins, the session has 0..N **assignments** (`session_assignments` rows): "read pp.10-15 of *textbook X*", "watch 00:15-00:23 of *lecture 3*", "review your notes from last session". Assignments are authored by the user (manually, when starting the session) or seeded by the scheduler (F6) from the milestone's `resource_map`. The active-study step iterates the assignments, **opening each Resource at its locator** via the appropriate viewer:
  - PDF: system PDF viewer with `#page=N` (most viewers honor this)
  - EPUB / Markdown: Obsidian or the system Markdown viewer
  - Video file: launch external player at timestamp (best-effort; see §13)
  - Video URL (YouTube): browser at `?t=N`
  - Web page: browser at URL, with `#anchor` if provided
  - Book / audio: display the locator string (user opens the physical book or audio app manually)
  V1 ships **external viewer launch only**; embedded players are deferred (§14).
- provides a **retrieval scratchpad** for post-study recall (write from memory before re-opening the source — distinct from pretest: this is *corrective* retrieval, not errorful generation),
- opens a **note editor** that writes an atomic Markdown note into the vault with backlinks,
- launches the **Feynman/quiz** panel (F4/F5),
- offers **AI-drafted cards** for confirmation (F3),
- logs the session to SQLite + writes a **session writeup** note to the vault (including the pretest comparison).

### F3 — Built-in Spaced Repetition (SRS) — LOCKED (native, centralized)
A fully **native** flashcard system so the user never leaves the platform — Anki is not required, not installed, not a dependency. Retention lives where the courses, notes, and sessions already are.
- Algorithm: **FSRS** (modern, the algorithm Anki adopted) for scheduling. Use an open-source TypeScript implementation (e.g. `ts-fsrs`) — fits the open-source goal and keeps it in-stack.
- Cards are linked to their resource note (when one exists) and course; scheduling state in SQLite (`cards.fsrs_state`, `reviews`).
- **AI-assisted card generation**: select a note → AI drafts atomic Q/A cards (user edits/approves; never auto-committed; respects the F10.5 scaffold guardrail).
- Full in-app review UI: due queue, rating buttons, retrieval-before-reveal enforced, cloze + image-occlusion card types.
- Daily review reminder via native notification (Tauri).
- **F3.5 Calibration (v0.7)** — every card review collects a **confidence rating (1-5)** alongside the FSRS effort rating. The dashboard surfaces **overconfident cards** (high confidence + "again"/incorrect rating) — these are where the *illusion of competence* concentrates (Dunlosky et al.; same literature §3 principle 1 cites). Calibration is also prompted inline on F5 quizzes (in-session feedback only; not persisted in v1). Over time, the user develops accurate self-knowledge of what they know vs. think they know — a metacognitive skill the system *trains by collecting*, not by teaching.
- **F3.6 Block-ref citations (v0.7)** — cards that cite a resource note use Obsidian block references (`[[note#^block-id]]`) rather than note-level links. On review, clicking the citation jumps to the exact paragraph. The card-generation AI inserts `^block-id` markers in the resource note when drafting, idempotent across regenerations. See F7 for block-id management.
- **F3.7 Resource citations (v0.8)** — Cards also cite **Resources directly** via the `card_resources` M:N table (resource_id + locator). On card-spawn, the table is **pre-populated from the spawning session's assignments** — the card inherits the breadcrumb of what the user was reading/watching when it was created. The card-spawn review UI lets the user edit (add/remove resources, refine locator) before adding to SRS. On review, the citation deep-links back to the Resource at its locator (PDF page, video timestamp, etc. — best-effort per kind, per F2.3). **A card can cite both** a resource note (via block-ref) *and* the originating Resources — the note is your processed knowledge; the Resource is the original source.
- *Optional, non-core (future):* a one-way export to Anki for users who already live there. Not a V1 concern and explicitly **not** a reason to split the workflow — the platform is the home for review.

### F4 — AI Feynman / Socratic Interrogation
The headline AI feature. The user explains a concept; the AI plays the probing beginner / Socratic examiner and finds gaps.
- **RAG-grounded**: retrieves the user's own relevant vault notes + ingested authoritative Resources, so questioning is anchored to real material, not model confabulation.
- **Tutor-not-oracle guardrails**: in flagged technical domains (math, physics, proofs) the AI must cite the grounding Resource and explicitly flag when it is unsure rather than assert correctness.
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
- **Block-id management (v0.7).** When the AI generates cards citing a resource note (F3.6), it inserts `^block-id` markers in the resource note at paragraph boundaries. IDs are deterministic (hash of paragraph content) so regenerations are idempotent — no duplicate `^abc123 ^abc123` build-up. The `VaultWriter` does this inline as part of the card-generation transaction.
- A **graph view** of note links (cross-domain bridges highlighted).
- Two-way sync with file-watcher; conflict handling when Obsidian edits the same file (see the concrete UX in §13).

### F8 — Command Center Dashboard (inherited + extended)
HUD dashboard: live status, current/longest streak, today's protocol checklist, 12-week activity heatmap, per-domain allocation with cold-flags, recent sessions, due-cards count. This is the war-room dashboard generalized + fed by real vault/SRS data instead of `localStorage`.

### F9 — Reminders / Notifications
**Native OS notifications** (Tauri/Electron) for daily session + due reviews — replacing the current ICS-file workaround. Configurable time; respects "already logged today." *(Implemented v0.9.9 — Feature 014: `tauri-plugin-notification` behind a `Notifier` seam + an in-app foreground scheduler that fires once/day at the configured time when the active vault has pending work and the learner hasn't practiced today. Fully local, no migration. Background scheduling when the app is closed is deferred.)*

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
2. **Register as a Resource + chunk & embed** into the vector store. A row is inserted into `resources` (kind = `pdf` / `epub` / `markdown`, `ingested_at = now()`) and chunks land in the vector store with a `resource_map` entry per milestone. *Side benefit:* the Resource becomes an **authoritative RAG Resource** the Feynman tutor (F4) and quizzes (F5) cite — so for that course, the source of truth is literally the document, not the model.
3. **Synthesize the Blueprint.** The AI transforms the document into capability milestones, placement (domain/campaign), a dependency graph, and per-milestone Resource mappings + seeds (see F10.4) — **fitting the structure to the user's chosen target** (F10.7), not the document's raw size.
4. **Review → materialize.**

> **Design rule — transform, don't mirror.** A document's TOC (or a note file's heading tree) is *not* a good learning sequence by default (front-matter, optional chapters, uneven difficulty, reference appendices). The AI must resequence into capability milestones through the desirable-difficulties lens, not just copy headings into a list.

#### F10.3 — Materialization
On approval, the Blueprint becomes durable: write the **MOC Markdown** (frontmatter ← blueprint), insert `courses` + `milestones` + `resource_map` rows, register the `Resource` (with `course_resources` linkage), and create `cards` as **`status: suggested`** (not yet scheduled — see guardrail). Idempotent and re-runnable (regenerating a section updates, doesn't duplicate).

#### F10.4 — Loop-seeding (how "the AI orchestrates the rest")
Generation doesn't stop at an outline — it seeds **all five loop mechanisms** so a freshly generated course is immediately runnable:
- **Daily Loop (F2):** each milestone's capability statement *is* a ready session objective; its `resourceMap` is the seed for the session's assignments (F2.3), which the active-study step then iterates and opens.
- **SRS (F3):** `cardSeeds` become suggested flashcards.
- **Retrieval quizzes (F5):** `retrievalQs` seed the quiz bank.
- **Feynman (F4):** `feynmanTargets` mark concepts to interrogate.
- **Interleaving scheduler (F6):** domain tags + the dependency graph let the new course slot into the rotation immediately, respecting prereqs.

#### F10.5 — The desirable-difficulty guardrail (CODIFIED DEFAULT)
**AI-generated content must never short-circuit the learning it's meant to support.** If the app hands the user a complete set of polished notes and answered cards, it recreates exactly the *input-hoarding / illusion-of-competence* failure mode the whole methodology exists to prevent (the value is in the user retrieving and writing in their own words — not reading the AI's). This is a **locked product decision, not a configurable default that ships flipped:**
- **Scaffold is THE default generation mode** — structure, objectives, Resource mappings, and *questions* (retrieval Qs, Feynman targets, card **fronts**), but **not** pre-written answers/notes. The user produces the durable knowledge artifacts through the loop. Scaffold is the path the happy-path UI leads to; Full-draft is never pre-selected.
- An opt-in **Full-draft** mode may pre-fill answers/note stubs, but they are clearly marked `ai-draft`, and a card/note is **never** counted as "learned" until the user has actually engaged it (reviewed the card, rewritten the stub in their own words). Full-draft requires an explicit, deliberate switch each time — it does not become sticky/remembered as a preference.
- Framing: the generator's job is to remove **setup** friction, never **thinking** friction.

#### F10.6 — Provenance & privacy
Generated MOCs/notes carry `generated_by` + Resource provenance in frontmatter. Ingested copyrighted Resources stay **local** (consistent with §3); if a remote provider is configured, excerpts are sent for synthesis — the **local-only lockdown mode (§10.6)** protects ingested content too.

#### F10.7 — Target-setting up front (granularity)
**The user declares the intended scope before generation runs; the AI fits to that target rather than inferring granularity from document size.** This removes guesswork and makes output predictable. The target is a small, explicit choice:
- **Scope:** `single course` | `campaign` (multiple linked courses). Determines whether the engine emits a Course Blueprint or a Campaign Blueprint.
- **Depth:** roughly how many milestones / how deep (e.g. *overview*, *working knowledge*, *deep mastery*) — shapes milestone count and granularity.
- **(Mode B) Coverage:** whole document vs a chapter range, when the user only wants part of a Resource.

Behavior: the synthesis step is **constrained by the target** — a 900-page textbook with a `single course / overview` target yields a tight high-level course, while the same book with a `campaign / deep mastery` target yields a multi-course campaign. The AI may *advise* if the target seems mismatched to the material ("this is a lot for one course — consider a campaign?"), but it **does not override** the user's choice. The target lives on the Blueprint (`granularity` + a `targetDepth` field) and is editable on review.

#### F10.8 — Manual Resource registration (no ingestion)
Not every Resource is ingestible. Physical books, copyrighted videos, paywalled web articles, and audio lectures often can't (or shouldn't) be parsed for RAG. F10.8 handles this: the user registers a Resource by kind + metadata (title, author, URL, duration, ISBN — whatever applies) and links it to a Course via `course_resources`. The Resource is now first-class for **assignment, citation, and tracking** purposes (F2.3, F3.7, F8) — it just doesn't appear in the RAG corpus. The Feynman tutor (F4) and quizzes (F5) can still reference it by title and locator, but cannot quote its content. *This is the path for "I'm reading a physical book" or "watching this lecture series on YouTube" — keeps the Resource ↔ Session ↔ Card chain intact without requiring digitization.* **(v0.9.5, Feature 011)** A *digital* file-kind Resource (PDF/EPUB/Markdown/video file/audio) can additionally have its file **attached** via the OS file picker — the app internalizes a copy into a per-machine app-data store (outside the vault) and records its path, so citation deep-links open it (e.g. a PDF at a page). This is the local-storage foundation only; **AI ingestion (chunking/embeddings/RAG, F10.2) remains separate** and depends on the AI provider layer (Phase 3).

### F11 — Projects: Applied Practice ⭐
The mechanism that closes the *knowledge → application* gap. Before this feature, no part of the system had transfer/application as its primary mechanism (see §15) — every loop component reinforced *acquisition* (retrieval, spacing, elaboration). Projects close that.

A **Project** is a concrete problem the user solves using **1..N Milestones' worth of capability** from a single Course. It is the unit of *application* — distinct from a Milestone (capability gate: *"be able to derive X"*) and a Session (one run of the daily loop). **Optional per Course** — some Courses will have many, some will have none. *Always human-driven: the AI suggests but never solves.*

#### F11.1 — Authoring (manual)
Create a Project from a Course MOC. Required: title, course, at least one Milestone link, a capability statement (one sentence — *"what does completing this prove I can do?"*). Optional: additional Milestones, template hint, opening problem framing, **Resource references** (`project_resources` M:N — e.g. "solve problems from Strang Ch.3" → resource=Strang, locator=Ch.3). Writing a Project **generates a Markdown file in the vault** via `VaultWriter`. Editing the file in Obsidian directly is reflected back on next sync.

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
On note save, chunk + embed into the local vector store. At query time, retrieve top-k relevant chunks from the vault + ingested Resources to ground prompts. The embedding provider is just another routed role (10.3).

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
- **Resources MVP (v0.8):** register Resources of all 8 kinds (F1 + F10.8); link to Courses via `course_resources`; F2.3 session assignments wired; F2 active-study step opens assigned Resources at locator via external viewers (best-effort deep-linking); F3.7 cards inherit `card_resources` from session assignments. AI ingestion (F10.2) is a Phase 3.5 concern; this phase ships **manual** Resource registration only.
- **Projects MVP (F11):** manual authoring from a Course MOC, frontmatter zod schema, status tracking, `sessions.project_id` / `cards.project_id` links wired, close-reflection prompt that offers manual card-spawn. Ship 3 seed templates (`math/proof`, `cs/implement`, `freeform`). No AI suggestion yet.
- *Milestone: complete one full loop end-to-end with a Session that has a real Resource assignment (e.g. "read pp.10-15 of a registered PDF"), the active-study step opens the PDF at page 10, the user writes a Note, spawns a Card from that Note, and the Card cites the Resource — all without an AI provider configured. Plus one Project closed with a card spawned.*

**Phase 3 — AI engine:**
- Vendor-agnostic provider layer + RAG indexer (§10).
- Feynman/Socratic interrogation + retrieval quizzes + AI card-drafting (F4, F5).
- *Milestone: explain a concept, get gap-finding questions grounded in your own notes.*

**Phase 3.5 — Course generation (F10):**
- Course Blueprint IR + materialization path (F10.3) reusing the F1 vault-write path.
- Mode A conversational "Campaign Architect" (F10.1); target-up-front (F10.7).
- Mode B ingestion (Markdown → EPUB → PDF): parse → embed → synthesize → loop-seed (F10.2, F10.4), Scaffold mode first.
- **`projectSeeds[]` in the Blueprint (F11.4):** generation suggests Projects per Course; user reviews/edits/approves like other Blueprint output. Materialization writes Project Markdown files via `VaultWriter`.
- *Milestone: drop in a file, review the blueprint, and run the first generated session — with the Resource itself grounding the Feynman tutor (via `resource_map`) and feeding the session's active-study assignments — and with at least one applied-practice Project seeded for review.*

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
8. **Resource file path stability (v0.8):** Resources reference local files via absolute `file_path`. Moving or renaming the file outside the app breaks the link. V1 mitigation: on first detection of a missing file, prompt the user to relocate (file picker → update `file_path` in `resources`); don't silently drop the citation. **Resources outside the vault folder are common and supported** (videos are huge; users keep them under `~/Videos/`), so we can't rely on Obsidian or the vault file-watcher here.
9. **External viewer deep-linking is best-effort:** PDF `#page=N` works in most viewers; YouTube `?t=N` works in browsers; system video players are inconsistent; physical books just display the locator string. The F2.3 active-study UX must not pretend deep-linking always succeeds — if a locator can't be honored, show it as text and let the user navigate manually.
8. **Cross-platform webview quirks:** Tauri uses each OS's native webview, so test rendering on Windows/macOS/Linux; avoid bleeding-edge CSS that WebKit/WebView2 diverge on.
9. **Naming:** "CIC" vs "War Room" vs new. Cosmetic; decide early for package naming.

---

## 14. Non-Goals (V1) & Project Stance
- Multi-user / collaboration.
- Mobile app (responsive web later; mobile is not the daily-driver surface).
- Cloud hosting / accounts.
- Marketplace of shared courses.
- **Auto-grading of Projects (F11).** AI suggests Projects (F11.4), can interrogate them via the Feynman tutor (F4), and helps spawn cards on close — but it does **not** assess whether a Project is correctly completed. The user runs their own tests, verifies their own proofs, judges their own work product. Consistent with §3 principle 4.
- **Embedded PDF / video / audio players (v0.8).** V1 launches **external viewers** for Resources (system PDF viewer, browser for YouTube, file association for local video). Embedded in-app players are deferred — they're significant build cost (PDF.js, ffmpeg-wasm or shelled mpv, etc.) and the OS already has good options. Revisit if deep-linking friction becomes the main UX complaint.
- **Automatic web-page archival (v0.8).** Web Resources of kind `web_page` store the URL only, not a local HTML snapshot. If the page goes offline, the citation goes stale. SingleFile-style archival is a V2 polish item.
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
> - **v0.9.10** — **Projects: Applied Practice (MVP)** (Feature 015, Phase 2, **F11**, **no AI**) — the applied-practice artifact that closes the *knowledge → application* gap. A **Project** is a concrete problem solved with **1..N Milestones' capability** from a single Course; it materializes as a clean vault Markdown file with a small fixed **frontmatter** (the integration layer — `cic-type: project`, `cic-id`, **`course-id`**, title, capability, status, milestones, opened/closed, template) and a **freeform, learner-owned body** seeded once from a template (`math/proof` · `cs/implement` · `freeform`) and **never re-clobbered** thereafter (the inverse of the MOC — the app only ever rewrites the frontmatter; close additionally *appends* a `## Reflection` block). Authored from the Course-detail **Projects** section; status `open → in-progress → complete | abandoned` is learner-driven (a session planned against it via the new optional `sessions.project_id` flips it to in-progress); closing offers a reflection from which the learner may **manually** spawn SRS cards (reusing `createCard`, now with an optional `projectId` — never auto-generated, never auto-mastered, Constitution III). Active Projects surface per-Domain on the dashboard (DB-only read-model). Full vault round-trip: rescan imports `type: project` files **by `course-id`** (the stable key, not the human title) and a detach-or-delete-file removal mirrors the 007 course delete. Data model (§8): the Projects schema (`projects`, `project_milestones`, `project_resources`, the nullable `sessions.project_id`/`cards.project_id` FKs) **already shipped in `m0001`**; the only delta is additive migration **`m0008`** (schema 7 → 8) adding **`projects.title`** + `project_id` indexes. Architecture mirrors 007: a pure `src/features/projects/doc/` document module (render/parse/merge/templates/frontmatter/filename) + a `sync/` layer (materialize/rescan/remove) + `useProjects` + the Course-detail section, forms, and dialogs. **No `src-tauri/` change** (reuses the fs/sql/FSRS seams). **Deletion may leave a Project with zero Milestones** (a Milestone delete cascades the join) — tolerated post-hoc; the ≥1 rule is a create/save invariant only, and reads/rescan handle zero gracefully (M3/FR-020). `/speckit-analyze` clean (0 critical/high; three MEDIUMs — framing destination, the `course-id` round-trip key, and the zero-Milestone survival test — plus three LOWs folded into the specs before coding). **387 tests green** (tsc + ESLint + `vite build` clean; no Rust touched). **Out of scope:** AI Project suggestion / Blueprint `projectSeeds[]` (F11.4 — Phase 3.5), auto-grading (locked §14 non-goal), cross-Course projects, Feynman targeting (F4), the F6 cold-Project scheduler surfacing beyond the dashboard list. Reconciled here per Constitution V.
> - **v0.9.9** — **Reminders / Notifications** (Feature 014, Phase 2, F9, **no AI**) — wires the locked-but-unwired `tauri-plugin-notification` for **native desktop reminders**, serving "consistency over intensity." A new **`/settings` → Notifications** surface (enable, daily time, OS permission, "send test notification") + an app-wide headless **`ReminderScheduler`** that — while the app runs — fires **one** native notification at the configured time **iff** the active vault has pending work (due reviews from 010 and/or planned sessions from 012/013) **and** the learner hasn't already practiced today (a review or completed session today suppresses it — "respects already logged today"). **No migration** — config lives in the settings KV (`notifications.enabled|time|lastFired`); pending/practiced signals are **derived** (new `countPlannedSessions`/`hasSessionCompletedOnDay` in `sessions.ts`, `hasReviewOnDay` in `reviews.ts`; reuses `countDueCards`). Architecture: a thin **`Notifier` seam** (`src/notifications/notifier.ts`) + Tauri adapter (the only `@tauri-apps/plugin-notification` importer, ESLint-confined like sql/fs) + DI provider (tests inject a fake); a **pure `decideReminder`** owns the fire rules (catch-up falls out of `now >= time`; ≤ once/day via `lastFired`; "today" is the UTC calendar date, consistent with the `cards.ts` daily-cap convention). **Config-only Rust touch** (plugin dep + `.plugin(init())` + `notification:default` capability; no custom command). **Desirable difficulty** (Constitution III): cadence nudge only — no answers, no mastery claim, no streak-shaming, suppressed once practiced. **Fully local** — OS-native only, no remote/analytics, **no vault writes**. **Out of scope:** background scheduling when the app is closed (autostart/daemon — v1 fires only while running), snooze, per-type schedules, multiple/day, mobile, AI timing, the F6 "what to do next" suggestion. `/speckit-analyze` clean (0 critical; one MEDIUM — the headless-scheduler test harness — plus three LOWs folded into the tasks before coding). 353 tests green (tsc + ESLint + `vite build` + `cargo check` clean). Reconciled here per Constitution V.
> - **v0.9.8** — **Course Session Planner** (Feature 013, Phase 2, **no AI**) — the **course-level curriculum layer** on top of 012. A Course's sessions gain an explicit **order** and an optional **Milestone** link, turning the Course-detail "Sessions" section into an ordered, milestone-aware curriculum with **coverage** (which Milestones have sessions; uncovered ones flagged) and **progress** (a literal done/total — no mastery state, Constitution III). Lay a Course out start-to-finish with **Move ↑/↓**, tag each session to the Milestone it advances (picker limited to the Course's own Milestones — FR-010), then churn through it from the Daily Loop. Data model (§8): additive migration **`m0007`** (schema 6 → 7) adds `sessions.milestone_id` (nullable FK **ON DELETE SET NULL** — deleting a Milestone **unmaps**, never deletes its sessions; resolves the gap deferred in 010/012) + `sessions.order_index` (course-scoped, normalized `0..N-1`) + an index. Repo: `planSession` gains an `order_index` append + optional `milestoneId`; new `listCourseSessions` (all of a Course's sessions, ordered `(order_index, date, id)`), `reorderCourseSessions(courseId, orderedIds)` (whole-course rewrite so positions can't duplicate — FR-004), `setSessionMilestone`. Coverage/progress are **derived** in `useCoursePlans` (no stored counters). **Order is a guide, not a gate** (FR-005/SC-004): nothing locks or hides a session, and the Daily Loop still does any planned session in any order (asserted by a regression test). Writes **nothing** to the vault and creates **no** cards — planning/sequencing/mapping are SQLite-only (FR-013/SC-005). The per-session planner (012) and the doing flow are reused unchanged. Milestone editing stays on the Courses screen; the curriculum refetches on (re)entry. **Out of scope (explicit):** AI auto-layout of the sequence (F10, Phase 3 — this is the surface it will populate), the F6 interleaving/daily-mix scheduler, cross-course/Campaign planning, do-time gating, multi-Milestone sessions. Reconciled here per Constitution V.
> - **v0.9.7** — **The Daily Loop reshaped to two phases** (Feature 012, revised — supersedes the v0.9.6 single-sitting model). A session is no longer *configured and done in one sitting*; like a real course it is **established ahead of time, then done**: (1) **Plan** a session on the Course (Course-detail "Sessions" section) — a capability objective (Milestone-seedable), the resource **assignments** to study, the **pretest questions** to attempt, and the intended **card prompts** — persisted as a **planned** session that writes nothing to the vault and creates no review card; (2) **Do** it from the Daily Loop — a guided stepper (`pretest → active study → retrieve → atomic note → self-test → complete cards → finish`) that opens the pre-assigned sources at their locators (best-effort opener, now fixing a `mm:ss-mm:ss` range to open at the **start**), records the pretest attempts (ungraded), and on finish flips the session to **completed**, materializes the staged prompts into **new** cards (citing the session's resources, deduped — D1) and writes the `type: log` writeup via `VaultWriter` (never-clobber; a vault failure leaves the session completed + offers a retry). This **reverses v0.9.6's "no migration / no status / a row means a completed session"**: additive migration **`m0006`** adds `sessions.status` (`planned`/`completed`) + `sessions.completed_at` and a `session_card_drafts` table (schema 5 → 6). Abandoning the *planner* persists nothing; abandoning the *doing* flow leaves the session **planned** (re-doable). Still objective-seed-only (no `sessions.milestone_id`); still vault-scoped transitively (no `sessions.vault_id`); still no AI (the AI-slated steps are authored at plan time and engaged at do time). Out-of-scope unchanged (F4/F5/AI cards, F6 scheduler seeding — which will later *seed* plans, F11 work-blocks, embedded viewers, RAG). Reconciled here per Constitution V.
> - **v0.9.6** — **The Daily Loop** (Feature 012, F2 — the guided session flow), Phase 2, **no AI**. Ships the 8-step protocol (`objective → pretest → active study → retrieve → atomic note → self-test → make cards → finish`) as a vault-gated stepper that ties together the pieces from 007–011: a Course/Milestone-seeded objective, **F2.5** pretest (manual, ungraded — errorful generation), **F2.3** session assignments opened at their locator via the existing best-effort opener (010/011), a retrieval-before-reveal scratchpad, an atomic note + a session **writeup** (`type: log`) written through `VaultWriter` (never-clobber; a vault-write failure leaves the session saved and offers a retry), a manual self-test (stand-in for the Phase-3 F4 Feynman panel), and **F3.7** card-spawning where new cards inherit citations from the session's assignments (deduped by resource — `card_resources` PK). **No migration:** `sessions`, `session_assignments`, and `pretest_responses` already existed in the §8 schema (`m0001`); the feature adds repositories + UI only. Sessions are vault-scoped **transitively** via `course → domain.vault_id` (no `sessions.vault_id`); a session is persisted **whole, on finish** (single-sitting — abandon persists nothing; no `status` column). **Milestone selection is objective-seed-only** — there is still no `sessions.milestone_id` (the same §8 gap deferred for cards in 010), so FR-002 seeds the objective rather than persisting a link; flagged for a future schema decision. **Out of scope (explicit):** AI generation of pretest questions, the F4 Feynman/Socratic panel, AI-drafted cards, F5 quizzes; F6 interleaving-scheduler seeding of assignments; F11 Project work-blocks (`sessions.project_id` stays null); embedded viewers; RAG ingestion — all later phases. Reconciled here per Constitution V.
> - **v0.9.5** — **Source file import & local storage** (Feature 011, F10.8 — the no-AI half of "source ingestion"). A file-kind Resource (PDF/EPUB/Markdown/video file/audio) can have its file **attached** via the OS native picker; the app **internalizes** a copy into a per-machine app-data store (`appLocalData/resources/<id>/`) — **outside the vault** (Constitution I, no binaries in the vault) — and records the path in `resources.file_path`, so citation deep-links finally open (the previously-grayed "Open"). Deleting a Resource reclaims its copy. The copy/cleanup is done by a small **custom Tauri (Rust) command** (flagged per Tech-Constraint) with a fixed destination base + input sanitisation (no path traversal; the vault is never reachable); the dialog + `invoke` sit behind a `SourceFiles` seam (Constitution IV). Data model (§8): additive migration `m0005` adds `resources.domain_id` (a nullable FK to `domains(id)` **ON DELETE SET NULL** — an optional "home Domain" to file/filter the registry, FR-012; deleting a Domain unfiles rather than blocks). Re-import is failure-safe (copy→rename→prune; a failed replace keeps the prior file). **Out of scope (explicit):** RAG ingestion — chunking, embeddings, the vector store, retrieval (F10.2) — a later Phase-3 feature that depends on the AI provider layer; this ships only the local storage it will read. Reconciled here per Constitution V.
> - **v0.9.4** — **Native FSRS spaced repetition** (Feature 010, F3). Ships the retention-engine core: the FSRS scheduler (`ts-fsrs`) behind a thin `Scheduler` seam (Constitution IV — the library is imported in exactly one file, ESLint-enforced); a vault-wide due-queue **Review** screen with retrieval-before-reveal and the four grades (Constitution III); **F3.5 calibration** — a 1–5 confidence per review with **no default** (the UI requires it), surfacing overconfident cards on the Dashboard; manual card authoring on a new **Course-detail** screen; new cards immediately due, throttled by a configurable **daily new-card cap** (default 20); **F3.7 Resource citations** + **F3.6 block-ref citations** (the latter written through `VaultWriter`, never clobbering) deep-linking via `tauri-plugin-opener` (best-effort per kind). The **Resource registration** half of the broader Resources feature is pulled forward — a vault-scoped registry (8 kinds, per-kind metadata, CRUD, Course links); the later Resources feature narrows to F2.3 session assignments + F10.2 ingestion. Data model (§8): additive migration `m0004` adds `resources.vault_id` (so the registry is vault-scoped, not a cross-vault leak — research R6) and `cards.note_block_id` (F3.6); `cards`/`reviews` columns already existed (003). Milestone-level card linkage from FR-010 is **not** modeled (the §8 card schema has no `milestone_id`; cards associate via Course + optional source note); flagged for a future schema decision. AI card generation, cloze/image-occlusion card types, and Anki export remain out of scope. Reconciled here per Constitution V.
> - **v0.9.3** — **Per-vault data partitioning** (Feature 009). Refines the Feature 006 "single active vault; changing the vault does not migrate tracking data" assumption: CIC still tracks **one ACTIVE vault at a time**, but tracking data is now **partitioned by vault** rather than pooled globally — switching the active vault shows only that vault's Domains/Courses/Milestones and switching back restores the prior vault's data losslessly. Data model (§8) gains a `vaults(id, path, created_at)` table and a nullable `domains.vault_id` FK (the scope anchor — everything cascades under Domains). A vault is identified by a **stable id in a hidden in-vault marker** (`.cic/vault.json`), written through a dedicated atomic capability in the vault layer (Constitution I), so a renamed/moved folder is still recognized. Creation is gated on a connected vault (Domains/Courses/Dashboard); pre-feature data is adopted by the first vault connected after upgrade. *Deferred:* per-vault same-named Domains (the global `domains.name` UNIQUE is retained; lifting it needs a table rebuild — research R3/R8). Reconciled here per Constitution V (update the PRD before implementation).
> - **v0.9** — Visual design **decoupled from war-room's tactical-HUD aesthetic**. CIC's frontend now follows the **Obsidian theme** — charcoal surfaces, purple primary (matches Obsidian wikilinks), Inter type, 8px soft radius, flat & calm — per the new [CIC-Design-Language-Obsidian.html](CIC-Design-Language-Obsidian.html). §5 updated: IA + component vocabulary still carry over from war-room, but the visual *skin* does not (no hex grid, no corner brackets, no scanlines). Critical color rule recorded: **purple = brand / links / active; cyan (`#00bfbc`) = AI-generated output ONLY** — never reverse them. CLAUDE.md React conventions updated to reference the design doc. v0.7/v0.8-era features (pretest step, calibration stepper, session assignments UI, Resource registration, card resource-citation chip, Projects screens) are not yet covered in the design doc — they extend the same vocabulary when implemented in Phase 2.
> - **v0.8** — First-class **Resources** entity (books, PDFs, EPUBs, Markdown, video files, video URLs, web pages, audio). Closes the **Resource ↔ Session ↔ Card** chain that v0.7 left implicit. New SQLite tables: `resources`, `course_resources` (M:N, with role), `session_assignments` (with locator + kind), `card_resources` (M:N — cards inherit citations from their spawning session), `project_resources` (optional, M:N). F1 gains first-class Resource registration; F2.3 active-study step opens assigned Resources at locator via external viewers (best-effort deep-linking, embedded players deferred to V2 per §14); F3.7 cards cite Resources directly (in addition to the F3.6 block-ref-to-Note channel). F10.2 ingestion registers the document as a Resource (`kind: pdf|epub|markdown`, `ingested_at` set); new **F10.8 manual Resource registration** path for non-ingestible Resources (physical books, copyrighted videos). Naming pass: domain term "Source" → **Resource** throughout (English idioms like "source of truth" stay); "Source Note" → "Resource Note" (`type: resource-note`); Blueprint IR `source` field → `input` (disambiguates from Resource); `sources` table → folded into `resources`; `source_map` → `resource_map`. §13 gains two new risks (Resource file-path stability, external-viewer deep-linking is best-effort). Phase 2 DoD extended to require an end-to-end loop with a real Resource assignment.
> - **v0.7** — Three cog-psych additions closing §15 gaps: **F2.5 Pretest step** (errorful generation; Daily Loop becomes 8-step), **F3.5 Calibration** (1-5 confidence on reviews surfacing overconfidence), and **surface-form variability** as a design requirement on F5/F6/F10. Vault contract tightened: **F1 MOC body template locked** with app-managed sections (HTML comment markers); **F7 backlinks consumption** added (app builds its own backlink index, does not depend on Obsidian's cache); **F3.6 block-ref citations** for cards (jump-to-paragraph on review); **vault subfolder support** in §6 (CIC can live in `Learning/` of a larger vault); **F7 Dataview decision locked** — no plugin dependency; **§13 conflict resolution UX** specified with detect (mtime+hash via `vault_writes`)/react (3-way diff dialog)/never-clobber (paused writes while dialog open) rules. Data model gains `confidence` on reviews, `vault_writes` and `pretest_responses` tables.
> - **v0.6** — Added **F11 Projects: Applied Practice** (§9): optional applied-practice artifact per Course; **multi-milestone** (1..N capabilities applied to one concrete problem); mandatory frontmatter + freeform body with per-domain templates (math/proof, cs/implement, freeform); AI suggestion via `projectSeeds[]` deferred to F10 / Phase 3.5; codified as the system's **transfer / application** mechanism (§15). Extended data model (§8) with `projects` / `project_milestones`; made `sessions.project_id` / `cards.project_id` nullable. Locked: single-Course only (cross-Course handled by Bridges), no auto-grading (§14), Phase 2 ships manual MVP before AI augmentation. Concept ladder updated (§5).
> - **v0.5** — Locked **Tauri** as the desktop shell (§6, §11; frontend → React + Vite, TS-friendly Tauri plugins) and **native in-app FSRS** for SRS with no Anki dependency (F3). Recorded the **open-source / non-commercial** project stance (§14). Moved Tauri adoption to Phase 0 and reframed Phase 4 as polish + public release (§12). Resolved the desktop + SRS open decisions; added license + vector-store picks (§13).
> - **v0.4** — Codified **Scaffold as the default** generation mode (F10.5); added **target-up-front** granularity (F10.7: user sets scope + depth, AI fits to it); extended Mode B ingestion to **PDF, EPUB, and Markdown**. Updated the Blueprint IR (§8) and resolved the corresponding open decisions (§13).
> - **v0.3** — Added the **Course Generation Engine** (F10): conversational sparring + PDF/ebook ingestion → reviewable **Course Blueprint** IR → loop-seeded course. Added the Blueprint IR + `sources`/`source_map` to the data model (§8), the desirable-difficulty guardrail (F10.5), Phase 3.5 to the roadmap, and generation risks (§13).
> - **v0.2** — Locked two decisions: (1) fully local + Obsidian-reliant, no cloud backend (§3, §6); (2) vendor-agnostic AI provider layer replacing the Ollama-default integration (§10 rewritten, §11 stack, §13 resolved). Added local-only lockdown mode and role-based provider routing.
> - **v0.1** — Initial spec.
