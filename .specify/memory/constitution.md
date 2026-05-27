# CIC Learning Platform Constitution

> Non-negotiable principles for the CIC Learning Platform. Amendment-versioned. Supersedes day-to-day practice.

## Core Principles

### I. Vault is Canonical and Sacred (NON-NEGOTIABLE)

All *knowledge* lives in the user's Obsidian vault as plain Markdown — never inside a proprietary database. The vault is the source of truth.

- All `.md` writes go through a **single** `VaultWriter` module using atomic write (temp file → rename); no ad-hoc `fs.writeFile` on vault paths anywhere else.
- Never destructively overwrite a file. Reconcile via the file watcher; tolerate Obsidian holding the file open concurrently.
- Write only clean, human-readable Markdown a person would be happy to see in their vault.
- Only `VaultWriter` / `VaultReader` may touch `.md` files within `vaultPath`.
- App-managed sections in MOCs are delimited by `<!-- cic:* -->` markers; user-edited regions *outside* the markers are never overwritten, even on detected drift.
- The conflict-resolution UX (PRD §13) is the chokepoint: detect via `vault_writes` (mtime + hash); on drift, open a 3-way diff dialog; pause writes while the dialog is open.

**Rationale:** Karpathy "second brain" ethos. Storage-format lock-in is a failure. The user must always be able to open their vault in Obsidian and find real, useful Markdown.

### II. AI is a Vendor-Agnostic Tutor, Not an Oracle (NON-NEGOTIABLE)

All AI capability sits behind a single `Provider` abstraction; the AI interrogates and scaffolds, never asserts correctness, never auto-commits knowledge artifacts.

- All AI calls go through `Provider` / `AIRouter`. Vendor SDKs (`openai`, `@anthropic-ai/sdk`, etc.) may be imported **only** inside `src/ai/adapters/*`. Enforced by an ESLint `no-restricted-imports` rule.
- No hardcoded model names outside provider/role config.
- **Scaffold is THE default** generation mode — structure, objectives, source mappings, *questions* (retrieval Qs, Feynman targets, card fronts), but **not** pre-written answers/notes. Full-draft is an explicit, per-call, non-sticky flag; output tagged `ai-draft`.
- **Tutor, not oracle:** AI features are RAG-grounded in vault + ingested Resources, cite their grounding source, flag uncertainty in technical domains (math, physics, proofs), and never silently arbitrate correctness.
- **AI never auto-commits** notes, cards, courses, or projects — the user reviews before SRS scheduling, before vault write, before project closure.
- Secrets live in the OS keychain (Tauri) or an encrypted local store — never in the vault, never committed, never logged, never in plaintext config.
- **Local-only lockdown** is a single chokepoint (`AIRouter` lockdown gate). When engaged, vault content cannot reach a non-local provider regardless of any other configuration. `containsVaultContent` is a required field on every `chat` and `embed` call — the type system forces the decision; there is no safe default.
- Request/response bodies are never logged when `containsVaultContent: true`, even on error paths.

**Rationale:** Vendor lock-in taxes the user; AI confabulation in technical domains is a real harm; privacy is non-optional for a personal vault. The lockdown gate must be unbypassable.

### III. Preserve Desirable Difficulty (NON-NEGOTIABLE)

The platform exists to make evidence-based learning easier to *practice*, not to remove the cognitive effort that makes learning work.

- Do not add "helpful" features that smooth away retrieval, spacing, interleaving, calibration, or pretest. No answer-before-recall. No auto-marking as learned.
- A card / note / project is "learned" only through **user engagement**, never via AI generation. *Comfortable ≠ working.*
- UI gates recall *before* reveal — the friction is the feature.
- Pretest answers (F2.5) are *expected* to be wrong; the UI must frame errorful generation as the goal, not pressure the user to "be right".
- Calibration confidence ratings (F3.5) have **no default value** — the user must register their own. An autofilled "3" defeats the mechanism.
- Variability of surface form (F5/F6/F10) is a design requirement, not optional polish — same skill, different framings.

**Rationale:** Brown/Roediger/McDaniel + Bjork's "desirable difficulties" literature. The *illusion of competence* is the failure mode this entire platform exists to prevent.

### IV. Interface-First, Deep Modules (Pocock Pattern)

Cross-cutting concerns expose thin interfaces; thick implementations live behind those interfaces and are never imported by features.

- **The CIC spine** = small, abstraction-only files:
  - `src/ai/provider.ts` — `Provider` interface + shared types
  - `src/ai/errors.ts` — `ProviderError` taxonomy
  - `src/ai/router.ts` — `AIRouter` interface (also the lockdown chokepoint)
  - `src/ai/config.ts` — `AIConfig` types + zod schema
  - `src/ai/secrets.ts` — `SecretStore` interface (Tauri keychain impl is deep)
  - `src/vault/` — `VaultReader` / `VaultWriter` interfaces
  - `src/types/` — shared TS types incl. `CourseBlueprint` IR
- **Deep modules** = the implementations: `src/ai/adapters/*`, `src/ai/rag/*`, the Tauri keychain `SecretStore` impl, concrete vault sync, the SQLite layer.
- **Composition root** wires deep implementations to interfaces at app boot. Features never construct adapters themselves.
- **Lintable heuristic:** spine files' named exports stay small (≤~10 per file). Wide barrel files are smells.
- **No leaky abstractions.** The `Provider` interface must not mention Ollama- or Anthropic-specific concepts. The `VaultWriter` interface must not mention Tauri `fs` primitives. Promote detail into the interface *before* importing a concrete.
- **Build order matches the interface graph:** types → infrastructure (secrets, contract test harness) → adapters → router. Spine PRs merge before consuming features.

**Rationale:** Matt Pocock's interface-first / deep-modules pattern. Mechanical enforcement of architectural intent — features can't bypass the abstraction even when they want to. Combined with the ESLint vendor-import rule (Principle II), the AI provider layer is structurally unbypassable.

### V. Spec-Driven Development

The PRD is the source of truth; non-trivial features get a written spec before code; the spec is updated *before* implementation drifts from it.

- **[`PRD-CIC-Platform.md`](../../PRD-CIC-Platform.md) is the authoritative product spec.** Conflicts between code and PRD are resolved by updating the PRD first (or writing an addendum), then the code.
- **Spec-kit workflow** is the per-feature loop: Constitution → Specify → Clarify (when ambiguous) → Plan → Tasks → Analyze (optional) → Implement.
- **Prefer the full Phase 1 doc set** by default — research + data-model + all contracts + quickstart. Don't offer to skip artifacts to save time. Exception: genuinely trivial features that wouldn't warrant their own `spec.md` in the first place.
- **User owns all git operations.** No `git add` / `commit` / `push` / `branch` / `checkout` / `rebase` / `merge` / `tag` / `reset` / `stash` without explicit per-action user request. Suggested commit messages may be authored as prose for the user to copy. Default to not running even read-only git commands (`status`, `log`, `diff`) unless explicitly asked.
- **End-of-feature walkthrough is mandatory** for every completed feature: end-to-end flow → data routing → business logic → call graph (with named files) → design rationale with alternatives rejected and PRD sections cited.
- **Senior-review mindset.** Flag concerns the author wouldn't think to ask about: security, architecture, data integrity, error handling, testability, performance, accessibility, professional conventions.

**Rationale:** This is a portfolio + learning project. The value is in the engineering decisions, not raw shipping velocity. Skipping spec artifacts, doing git on the user's behalf, or moving on without a walkthrough each cuts a corner on something the project exists to demonstrate.

## Technology Constraints (Locked)

| Layer | Choice | Locked in PRD |
|---|---|---|
| Desktop shell | **Tauri** | v0.5 |
| Frontend | **React + TypeScript (strict) + Tailwind + Vite** — no Next.js shell | v0.5 |
| Native bridges | `tauri-plugin-sql` · `tauri-plugin-fs` · `tauri-plugin-notification` | v0.5 |
| Tracking / SRS state | **SQLite** (local-only) | v0.5 |
| Knowledge | **Obsidian vault** (Markdown, canonical) | v0.2 |
| Vector store | `sqlite-vec` (default) or LanceDB | v0.5 |
| AI layer | Vendor-agnostic `Provider` abstraction (Ollama / OpenAI-compatible / Anthropic adapters) | v0.2 |
| SRS | Native **FSRS** (`ts-fsrs`) — no Anki dependency | v0.5 |
| Tests / CI | Vitest + GitHub Actions | v0.5 |
| Visual design | **Obsidian theme** per [`CIC-Design-Language-Obsidian.html`](../../CIC-Design-Language-Obsidian.html) — charcoal + purple primary + Inter + 8px soft radius. **Purple = brand; cyan = AI output only. Never reverse.** | v0.9 |

**Code conventions:**
- TypeScript `strict` mode. No `any` — use `unknown` + narrowing. Explicit types on public boundaries.
- Validate all external / frontmatter / AI-JSON input through **zod** schemas. Never trust raw shape.
- Errors handled explicitly. AI/provider calls + vault/FS operations must fail gracefully (offline, bad parse, locked file). Never crash on a malformed note.
- No scattered prompts or model names: prompts in `src/ai/prompts/`; model/routing in config.
- Tauri plugins for native work. Only drop to Rust (`src-tauri/`) for genuinely custom native code, and flag it when you do.

## Development Workflow

**Per-feature loop:**

1. `/speckit-constitution` — establish or amend project principles (this file).
2. `/speckit-specify` — author user-visible outcome + success criteria. Each feature gets `specs/NNN-feature/spec.md`.
3. `/speckit-clarify` *(when ambiguous)* — resolve open questions before planning.
4. `/speckit-plan` — research + data-model + contracts + quickstart, in the feature folder.
5. `/speckit-tasks` — atomic decomposition into actionable tasks.
6. `/speckit-analyze` *(optional)* — cross-artifact consistency check before implementation.
7. `/speckit-implement` — execute. Pocock spine PRs merge before consuming features (Principle IV).
8. **End-of-feature walkthrough** (mandatory, see Principle V).
9. **User commits + pushes.** Spec-kit's `git` extension exists; the user owns its invocation, not the assistant.

**Quality gates** (verified before any feature is "done"):
- TypeScript `strict` clean.
- Vitest passing for the data-integrity surfaces: FSRS scheduling, vault read/write, frontmatter parsing, Blueprint materialization, provider routing, lockdown gate, conflict resolution.
- ESLint clean — including the `no-restricted-imports` rule forbidding vendor SDKs outside `src/ai/adapters/*`.
- Spec is current. If code drifts from the spec, the spec is updated *first*.
- The end-of-feature walkthrough has been delivered.

## Governance

This Constitution supersedes day-to-day practice. When the Constitution conflicts with the PRD, **the Constitution wins** (it is *more* non-negotiable); when CLAUDE.md conflicts with either, **the Constitution / PRD wins**. CLAUDE.md is a quick-reference; it is downstream of both this file and the PRD.

Amendments require:
1. A versioned entry in the Changelog at the bottom of this file. Versioning is MAJOR.MINOR.PATCH:
   - **MAJOR** — breaking change to a principle (e.g. dropping or reversing a NON-NEGOTIABLE).
   - **MINOR** — added principle, new locked technology, new workflow step.
   - **PATCH** — clarification, typo, non-substantive edit.
2. Migration notes for any code / spec impact (which features need to change, which docs need updating).
3. Explicit user approval before the amendment lands.

The `/speckit-analyze` step is the consistency gate — it verifies feature specs respect the Constitution before `/speckit-implement` runs.

**Version**: 1.0.0 | **Ratified**: 2026-05-27 | **Last Amended**: 2026-05-27

## Changelog

- **1.0.0** (2026-05-27) — Initial ratification. Five core principles (Vault Sacred · AI Tutor Not Oracle · Desirable Difficulty · Interface-First Deep Modules · Spec-Driven Development), locked technology constraints (Tauri + React + SQLite + vault + vendor-agnostic AI + FSRS + Obsidian theme), spec-kit-driven workflow, user-owned git, mandatory end-of-feature walkthroughs.
