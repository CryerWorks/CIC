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
- **Git**: small focused commits, Conventional Commits style; feature branches → PR → squash merge. Keep the working tree green (lint + tests). The assistant may run git as part of the normal flow (Constitution §V, amended 2026-05-28) — stage specific files (never `git add -A`), add the `Co-Authored-By: Claude` trailer, never commit secrets, and confirm before destructive/irreversible ops (force-push, `reset --hard`, history rewrites, branch/tag deletion).

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
**Phase 1 — Vault integration (MVP): COMPLETE.** Phase 0 foundation (Tauri + React + Vite shell, SQLite via `tauri-plugin-sql`, `tauri-plugin-fs`, data model) plus Phase 1: vault read/write spine (005), vault config (006), Course authoring ↔ MOC (007), and the real-data Command Center Dashboard (008, F8) are all implemented/merged. The Phase 1 milestone — a Course created in-app appears as a MOC in the vault and vice versa, with a dashboard fed by real data — is met.
**Next:** Phase 2 — Retention engine (PRD §12). Native FSRS SRS (F3) **done** (010, incl. the pulled-forward Resource registry). Remaining: the Daily Loop (F2), notifications (F9), the rest of Resources (F2.3 session assignments + F10.2 ingestion), Projects MVP (F11).

<!-- SPECKIT START -->
**Active feature:** `010-srs-fsrs` — **implemented** (Phase 2 begins, F3): native FSRS spaced repetition. (1) **Engine** — `ts-fsrs` behind a thin `Scheduler` seam (`src/features/srs/fsrs/`), the *only* file importing the library, ESLint-enforced via `no-restricted-imports` (Constitution IV); `cards.fsrs_state` stores the scheduling card, `SchedulingState` zod-validated (malformed → re-init, FR-021). (2) **Review** (`src/features/srs/`) — a vault-wide due-queue screen: retrieval-before-reveal (the back isn't in the DOM until reveal), 4 grade buttons, a 1–5 confidence control with **no default** (grading blocked until picked — Constitution III); `recordReview` advances FSRS + logs the review in one transaction (R12); an "Again" re-queues the card; new cards immediately due, throttled by a configurable daily cap (default 20, `srs.dailyNewCap`). (3) **Authoring** — a new **Course-detail** route `/courses/:courseId` (`CourseDetailRoute` + `CardForm`) for per-course card CRUD; editing content never resets the schedule (FR-011). (4) **Calibration** (F3.5) — `getOverconfidentCards` (latest review confidence≥4 + "again") feeds an `OverconfidentTile` + a real due-count tile on the Dashboard (replacing the deferred placeholders; real data only — Constitution III). (5) **Resources + citations** (US4) — a vault-scoped **Resource registry** (`src/features/resources/`, 8 kinds, per-kind metadata via a zod union, CRUD, Course links); card **citations** — Resource (`card_resources` + locator, F3.7) deep-linked via `tauri-plugin-opener` (best-effort per kind, graceful when unopenable) and Obsidian **block-refs** (F3.6) written through `VaultWriter` (deterministic `^cic-…` id, idempotent, never-clobber → "cite anyway"). Additive migration **`m0004_srs_scoping`** (`resources.vault_id` + index, `cards.note_block_id`) — the three latest-version migration tests bumped to v4. **Deviation:** FR-010 milestone-level card linkage isn't modeled (the §8 card schema has no `milestone_id`; cards link via Course + optional source note) — flagged in the PRD for a future schema decision. PRD reconciled to **v0.9.4**. 268 tests green (tsc + lint + build clean); live `tauri dev` quickstart (T040, scenarios A–H) is the user's check. See [specs/010-srs-fsrs/plan.md](specs/010-srs-fsrs/plan.md) (+ `research.md`, `data-model.md`, `contracts/`, `quickstart.md`).

**Prior feature:** `009-vault-scoped-data` — **implemented** (Phase 1 hardening): the **active vault is now the data boundary**, fixing the Scenario D bug where switching vault folders kept showing the old vault's Courses/Dashboard. (1) **Migration** `m0003_vaults` (additive only — research R3): new `vaults(id, path, created_at)` table + nullable `domains.vault_id` FK + index; the three pre-existing migration tests were bumped to the new latest version (v3). (2) **Identity** — a stable id in a hidden `.cic/vault.json` marker via a new `VaultIdentity` capability on the vault spine (`src/vault/identity.ts`, atomic temp→rename over `VaultFs`, never `.md`, Obsidian-ignored — Constitution I), wired into `createVault`; the app `connect.ts` `resolveIdentity` reads the marker / recovers by recorded path / mints fresh, then `attachVault` records the row + **adopts** pre-feature NULL-`vault_id` domains (one-shot, no bleed — FR-008). (3) **Scoping** — `vault_id` params on `listDomains`/`createDomain`/`findOrCreateDomainByName`/`listCourses`/`getDashboardSummary` (Domain is the scope anchor; everything cascades under it); the 007 rescan imports into the active vault. (4) **Reactivity** — `useActiveVaultId()` from `VaultProvider`; the three screen hooks (`useDashboard`/`useCourses`/`useDomains`) re-key on it so a switch refreshes every view with no restart (FR-007). (5) **Gating** — `DomainsRoute` + Dashboard now gate on a connected vault (FR-006). **Deferred:** per-vault same-named Domains (global `domains.name` UNIQUE retained — a `domains` rebuild is unsafe under the FK-on/pooled runner; research R3/R8, user-confirmed 2026-05-28). PRD reconciled to **v0.9.3** (§8 `vaults` table + `domains.vault_id`; refines the 006 single-vault assumption). 208 tests green (tsc + lint + build clean); live `tauri dev` quickstart (T031, scenarios A–F incl. the Scenario D regression) is the user's check. See [specs/009-vault-scoped-data/plan.md](specs/009-vault-scoped-data/plan.md) (+ `research.md`, `data-model.md`, `contracts/`, `quickstart.md`).

**Earlier feature:** `008-dashboard-real-data` — **implemented** (Phase 1, F8): replaced the placeholder Dashboard with a real landing screen fed by the Domain→Course→Milestone hierarchy + vault state. A read-only aggregate read-model `getDashboardSummary` (`src/db/repositories/dashboard.ts`, ~3 `GROUP BY` queries incl. a `LEFT JOIN` allocation that keeps zero-course Domains, parsed via zod, **no N+1, no new schema**) feeds the `src/features/dashboard/` screen (mirrors `features/courses/`): a `useDashboard` hook + a `DashboardRoute` split into an outer DB-readiness/vault gate (`useDbState`/`useVaultState`, **not** vault-gated — read-only) and an inner `DashboardView`. Tiles: totals `StatCell`s, `MilestoneProgress` (done/in-progress bar + "X/Y done (Z%)", "no milestones yet" when 0 — no `NaN`), `DomainAllocation` (per-Domain colors/counts), a Domain-grouped Course list linking to `/courses` with a MOC tag, and `DeferredTiles` — the war-room retention tiles as labeled **"arrives in Phase 2"** shells with **no fabricated numbers / no populated heatmap / nothing "learned"** (Constitution III). New user → onboarding (not a zero grid). The placeholder `app/routes/DashboardRoute.tsx` was removed and the router points at the feature. 187 tests green (tsc + lint + build clean); live `tauri dev` quickstart (T017) is the user's check. See [specs/008-dashboard-real-data/plan.md](specs/008-dashboard-real-data/plan.md) (+ `research.md`, `data-model.md`, `contracts/`, `quickstart.md`).

**Earlier feature:** `007-course-moc` — **implemented**: Course authoring (F1) that materializes each Course as an Obsidian **MOC** Markdown file, plus read-back on app open / manual rescan (F7). Three layers: (1) a **pure MOC document module** `src/features/courses/moc/` — render / merge / parse the v0.7 body, the sole home of the `<!-- cic:* -->` marker contract (R2; capability is wrapped in `cic:capability` markers so *all* app-managed sections are uniformly marker-delimited — reconciled into PRD §F1 as v0.9.1); milestone lines carry a hidden `<!-- cic:m id=… status=… -->` comment for faithful 3-state + stable-identity round-trip (R3). (2) a **sync layer** `src/features/courses/sync/` — `materializeCourse` (render/merge → `VaultWriter`, marker-scoped so user regions like `## Reflections` are never clobbered; drift → surface + `reapplyCourse` via `overwrite`) and `rescanCourses` (list → discriminate by `cic-type: course` frontmatter → parse → upsert-by-`cic-id` + `syncCourseMilestones` delete-missing; imports unknown CIC MOCs, auto-creates named Domain/Campaign). (3) the **Courses screen** `src/features/courses/` (`useCourses` hook mirroring `useDomains`, `CourseForm`, `MilestonesEditor`, vault-gated `CoursesRoute` with boot-rescan + manual "Rescan vault") wired into the router/nav (placeholder removed). No new SQLite schema — additive repo fns only (`courses`/`milestones`/`domains` + new `campaigns.ts`). **Course deletion folded in (PRD v0.9.2):** `removeCourse` (`sync/delete.ts`) always drops the DB rows (cascade) and the user picks the MOC's fate — **detach** (keep, strip `cic-type`/`cic-id` so it won't re-import) or **delete the MOC too** via the new never-clobber-aware `VaultWriter.deleteNote` (+ `VaultWriteLog.forget`) — the *single sanctioned exception* to "never delete a vault file" (user-confirmed via `DeleteCourseDialog`, drift → "Delete anyway"). Full vault round-trip is Vitest-tested (node temp vault + `node:sqlite`, 177 tests green); the live `VaultWriter`/Obsidian round-trip is the user's `tauri dev` quickstart check (T042/T049). **Known follow-up:** a rescan-imported MOC has no write-log fingerprint, so its first in-app edit surfaces an `unmanaged` drift that "Reload & reapply" resolves. See [specs/007-course-moc/plan.md](specs/007-course-moc/plan.md), `research.md`, `data-model.md`, `contracts/`, `quickstart.md`. (`001`–`007` complete.)

*(Implemented: `001`–`010`. See each `specs/NNN-*/` for details.)*
<!-- SPECKIT END -->
