# CLAUDE.md — CIC Learning Platform

> Persistent context for Claude Code. Read this in full at the start of every session.
> **Codename:** CIC (placeholder — built on the `war-room-2026` foundation).

---

## What we're building
A **fully local, Obsidian-reliant, AI-powered personal learning platform**. It centralizes evidence-based learning (retrieval practice, spaced repetition, interleaving, desirable difficulties) into one desktop app: tracking + knowledge + retention + an AI tutor that can generate whole courses from a conversation or a document. It is a personal, **non-commercial, open-source** project, built on top of the existing `war-room-2026` goal-tracker.

## Source of truth
**`PRD-CIC-Platform.md` is the authoritative spec.** This file is a quick-reference + guardrails layer on top of it. If anything here seems to conflict with the PRD, **the PRD wins** — and flag the conflict. If a decision isn't covered by either, **ask before assuming**; do not invent product direction.

---

## ⛔ Non-negotiable guardrails
These encode locked decisions. **Never violate them. If a task seems to require breaking one, stop and ask.**

1. **Fully local. No exceptions.** No cloud services, no backend server, no accounts, no telemetry, no analytics, no crash-reporting-to-remote, no remote storage. The only outbound network calls allowed are **user-configured AI provider requests** (see #3) — and even those must be blockable (#8).
2. **The vault is canonical and sacred.** All *knowledge* (notes, course MOCs, source notes, session writeups) lives as plain Markdown in the user's Obsidian vault. Rules:
   - **Never** destructively overwrite a file. All writes go through the single `VaultWriter` module using atomic write (temp file → rename) and never clobber unsaved external edits.
   - Assume **Obsidian may have the file open**. Use the file-watcher; reconcile, don't stomp.
   - Write only **clean, human-readable Markdown** a person would be happy to see in their vault.
   - Only `VaultWriter` / `VaultReader` may touch `.md` files. No ad-hoc `fs.writeFile` on vault paths anywhere else.
3. **AI is vendor-agnostic.** All AI calls go through the `Provider` interface. **Vendor SDKs (`openai`, `@anthropic-ai/sdk`, etc.) may be imported ONLY inside `src/ai/adapters/*`.** Everywhere else imports the abstraction. No hardcoded model names outside provider/role config. (Enforce via an ESLint `no-restricted-imports` rule.)
4. **Scaffold is the default for generation.** Course generation produces structure, objectives, source-mappings, and *questions* — **never pre-written answers/notes by default**. `Full-draft` mode requires an **explicit flag passed at call time**; it is **never** read from a persisted/sticky setting, and its output is tagged `ai-draft`.
5. **Tutor, not oracle.** AI features are RAG-grounded in the user's vault + ingested sources. In technical domains (math/physics/proofs) the AI must cite its grounding source and flag uncertainty rather than assert. **AI never auto-commits** notes, cards, or courses — the user reviews first.
6. **Preserve desirable difficulty.** Do not add "helpful" features that smooth away retrieval, spacing, or interleaving (e.g. showing answers before recall, auto-marking things learned). A card/note is only "learned" through **user engagement**, never via generation. Comfortable ≠ working.
7. **Secrets stay local.** API keys live in the OS keychain (Tauri) or an encrypted local store — **never** in the vault, **never** committed, **never** logged, **never** in plaintext config.
8. **Honor local-only lockdown.** Any code path that could send vault content to a non-local endpoint must check the lockdown flag first and refuse if set. Route this through one chokepoint so it can't be bypassed.

---

## Tech stack
| Layer | Tech |
|---|---|
| Shell | **Tauri** (locked) |
| Frontend | **React + TypeScript + Tailwind + Vite** (Next.js shell from war-room is **not** carried over; components are) |
| Native bridges | Tauri plugins: `sql` (SQLite), `fs` (vault), `notification` |
| Tracking / SRS state | **SQLite** |
| Knowledge | **Obsidian vault** (Markdown) — canonical |
| Vector store | `sqlite-vec` (default) or LanceDB |
| AI | Vendor-agnostic `Provider` layer; adapters: Ollama · OpenAI-compatible · Anthropic |
| SRS | Native **FSRS** (`ts-fsrs`) — no Anki dependency |
| Tests / CI | Vitest + GitHub Actions |

Stay in **TypeScript**. Use Tauri plugins for native work; only drop to Rust (`src-tauri/`) for genuinely custom native code, and flag it when you do.

---

## Target repo structure
*(Aspirational — build toward this; keep it updated as it materializes.)*
```
src/
├── app/                  # React app shell, routing (React Router), providers
├── components/           # Ported war-room HUD + new UI (calendar, dashboard, cards, review…)
├── features/
│   ├── courses/          # authoring (F1) + generation (F10)
│   ├── loop/             # the Daily Loop session flow (F2)
│   ├── srs/              # native FSRS engine + review UI (F3)
│   ├── tutor/            # Feynman/Socratic + retrieval quizzes (F4, F5)
│   └── scheduler/        # interleaving / desirable-difficulty engine (F6)
├── vault/                # VaultReader, VaultWriter, file-watcher, frontmatter schema (zod)
├── db/                   # SQLite access, migrations, models
├── ai/
│   ├── provider.ts       # the Provider interface (the abstraction)
│   ├── adapters/         # ONLY place vendor SDKs may be imported
│   ├── prompts/          # versioned prompt templates (one home, no scattered prompts)
│   ├── rag/              # chunk/embed/retrieve
│   └── routing.ts        # role → provider/model config
├── lib/                  # shared utils (streaks, dates, hours…)
└── types/                # shared TS types incl. CourseBlueprint IR
src-tauri/                # Rust shell + plugin config + capabilities allowlist
```

---

## Domain glossary (use this vocabulary consistently)
- **Domain** — top-level subject area (Math, CS Theory…). User-defined.
- **Campaign** — a long-arc objective spanning multiple Courses.
- **Course** — the unit a user "enrolls" in; backed by an Obsidian **MOC** file.
- **Milestone** — a capability gate within a Course ("be able to derive X").
- **Session** — one run of the Daily Loop.
- **Note** — atomic Markdown note in the vault, linked via `[[wikilinks]]`.
- **Card** — SRS flashcard (FSRS state in SQLite). Cites Resources (M:N `card_resources` with locator) and optionally a resource-note (via Obsidian block-ref).
- **Resource** — any reference material the user studies: book, PDF, EPUB, Markdown, video file, video URL, web page, or audio. First-class entity per Course (M:N `course_resources`). May be AI-ingested (F10.2 → RAG corpus) or registered manually without ingestion (F10.8 — physical books, copyrighted videos). Has `kind`, optional `file_path`, optional `url`, kind-specific metadata, optional locator-able ranges.
- **Bridge** — a cross-domain connection note (`#bridge`).
- **Project** — optional applied-practice artifact per Course: 1..N Milestones' capability applied to one concrete problem (PRD §F11). The unit of *application* — distinct from a Milestone (capability gate) or a Session (one daily-loop run). Non-conform format: mandatory frontmatter + per-domain freeform body. AI suggests, never solves or grades.
- **Course Blueprint** — the reviewable IR both generation modes emit before materialization (see PRD §8/F10).
- **Provider / Role** — AI backend behind the abstraction; roles (`reasoning`, `drafting`, `embeddings`) route independently.

---

## Conventions
- **TypeScript strict**; no `any` (use `unknown` + narrowing). Prefer explicit types on public boundaries.
- **React**: function components + hooks; no class components. Tailwind for styling; visual design follows the **Obsidian theme** — see [CIC-Design-Language-Obsidian.html](CIC-Design-Language-Obsidian.html) (canonical). Inter + JetBrains Mono, soft 8px radius, charcoal surfaces, **purple primary**, **cyan for AI output only — never reverse**. The war-room HUD aesthetic (hex grid, corner brackets, scanlines, boot sequence) is NOT carried over — only its IA + component vocabulary (panels, stat cells, heatmap, stepper, checklist, dependency graph).
- **Validation**: parse all external/Frontmatter/AI-JSON input through **zod** schemas; never trust raw frontmatter or model output shape.
- **Errors**: handle explicitly; AI/provider calls and vault/FS ops must fail gracefully (offline, bad parse, locked file). Never crash on a malformed note.
- **No scattered prompts or model names**: prompts in `src/ai/prompts/`, model/routing in config.
- **Tests**: Vitest. Core logic (FSRS scheduling, vault read/write, frontmatter parsing, blueprint materialization, provider routing) requires unit tests. Don't ship untested data-integrity code.
- **Git**: small focused commits, Conventional Commits style; feature branches → PR → squash merge. Keep the working tree green (lint + tests).

## Commands
*(Finalize at scaffold time; expected:)*
- `npm run dev` — Vite dev server (frontend only)
- `npm run tauri dev` — full app in the Tauri shell
- `npm run tauri build` — production bundle
- `npm run test` — Vitest
- `npm run lint` — ESLint (incl. the vendor-import restriction)

---

## How to work in this repo
1. **Read the PRD section** relevant to the task before coding. Respect the **phase order** (see PRD §12) — don't build Phase 3 AI features before the Phase 1 vault layer exists unless explicitly asked.
2. **Centralize risky paths.** Vault writes → `VaultWriter`. AI calls → `Provider`. Outbound-content gating → the lockdown chokepoint. Don't duplicate these.
3. **Guardrails first.** If implementing something brushes against a guardrail above, surface it and propose a compliant approach rather than quietly working around it.
4. **Ask on product ambiguity**, decide freely on implementation detail. The locked decisions are settled; how to implement them well is your call.
5. **Update the "Current focus" below** as phases progress.

---

## Agent skills

### Issue tracker

CIC tracks issues on GitHub (planned repo: `CryerWorks/CIC` — `gh` commands work once `git init` + `gh repo create` have been run). See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

### Triage labels

Default Matt Pocock vocabulary: `needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root (both created lazily by `/grill-with-docs`). See [docs/agents/domain.md](docs/agents/domain.md).

---

## Current focus
**Phase 0 — Foundation rework.** Stand up the Tauri + React + Vite shell, port war-room's React components off the Next.js shell, replace Supabase/Postgres with SQLite (`tauri-plugin-sql`), wire `tauri-plugin-fs`, and establish the data model (PRD §8).
**Definition of done:** a native desktop window showing the ported HUD, reading/writing local SQLite.

<!-- SPECKIT START -->
**Active feature:** `002-design-system` — see [specs/002-design-system/plan.md](specs/002-design-system/plan.md) for the implementation plan (Tailwind v4 Obsidian token theme + self-hosted fonts + 16-primitive component kit + living StyleGuide), plus `research.md`, `data-model.md`, `contracts/tokens.md`, `contracts/components.md`, and `quickstart.md` in that folder. (`001-tauri-shell` — the Tauri + React + Vite shell — is complete.)
<!-- SPECKIT END -->
