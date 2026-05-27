---
description: "Task list for Feature 002 — Obsidian Design System"
---

# Tasks: Obsidian Design System

**Input**: Design documents from `specs/002-design-system/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/tokens.md ✅, contracts/components.md ✅, quickstart.md ✅

**Tests**: Included by design (research **R8**): a per-primitive render/semantic test (renders, correct semantic element, applies variant) and one programmatic **WCAG AA contrast test** over the token pairings (backs SC-003). Not full TDD-first — the primitives are simple and scaffolded against the component contract, then pinned by tests.

**Organization**: By user story. US1 = the visual identity + token reference (MVP). US2 = the 16-primitive component kit. US2 depends on US1's tokens (a layered design system — the one inter-story dependency, called out below).

## Format: `[ID] [P?] [Story?] Description + file path`

- **[P]**: different files, no dependency on an incomplete task → parallelizable
- File paths are repo-root-relative; the frontend lives at the repo root (per plan.md).

## ⚠️ Git note

The user owns all git. **No task runs git.** The optional `before_tasks`/`after_tasks` commit hooks are surfaced, never executed.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the build-time dependencies and wire Tailwind into the existing Vite 7 config from Feature 001.

- [X] T001 Add Tailwind v4 dev dependencies (`tailwindcss`, `@tailwindcss/vite`) to `package.json`. (research R1)
- [X] T002 Add self-hosted font dependencies (`@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`) to `package.json`; run `npm install`. **No CDN.** (research R3; FR-003)
- [X] T003 Wire the `@tailwindcss/vite` plugin into the `plugins` array in `vite.config.ts` (alongside the existing React plugin). (research R1)
- [X] T004 [P] Add a base ESLint flat config (`eslint.config.js`) with `eslint-plugin-jsx-a11y` (recommended ruleset) to mechanically enforce FR-006, plus an `"lint": "eslint ."` script in `package.json`. **Also wire the Constitution's `no-restricted-imports` rule now** (forbidding vendor AI SDKs outside `src/ai/adapters/*`) — dormant today (no `src/ai` yet) but it makes the constitution quality gate real from here on. (research R5; Constitution II/IV + Quality gates)

**Checkpoint**: Tailwind + fonts installed; Vite knows about Tailwind.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The token theme + self-hosted fonts + base document styling. This is the bedrock **both** user stories consume — components and the StyleGuide are unstyleable until the role tokens exist.

**⚠️ CRITICAL**: Nothing in US1 or US2 can be verified until this phase is complete.

- [X] T005 Create `src/styles/theme.css` with `@import "tailwindcss";` and an empty `@theme { }` block; import `"./styles/theme.css"` in `src/main.tsx`. (research R1)
- [X] T006 Populate the `@theme` block in `src/styles/theme.css` with **all role tokens** per [contracts/tokens.md](contracts/tokens.md): surfaces, lines, `brand`/`brand-dim`/`brand-soft`, **`ai` (distinct, never aliased to brand)**, semantic (success/warn/danger/info), text (incl. a compliant `text-faint-aa`), `domain-1…5`, radius (`sm`/DEFAULT/`full`), fonts (`ui`/`mono`), the type size scale (2xs→3xl), and the **spacing scale** (retain Tailwind's default 4px-step spacing — no custom scale unless the design doc requires one). (FR-001/FR-002/FR-004; research R2/R5)
- [X] T007 Create `src/styles/fonts.ts` importing the two Fontsource **variable** packages; import it in `src/main.tsx`. Confirm the families match `--font-ui`/`--font-mono` ('Inter Variable' / 'JetBrains Mono Variable'). (research R3; FR-003)
- [X] T008 Add base/reset styles in `src/styles/theme.css`: `body` uses `font-ui` + `surface` bg + `text` color + 13.5px/1.55; headings, `code`/`pre` use `font-mono`; `a` uses `brand`; a global `prefers-reduced-motion: reduce` guard. (spec edge cases; FR-010 — calm, no HUD)

**Checkpoint**: The app renders on charcoal in Inter with the purple accent and local fonts. Tokens are available as utilities + CSS variables.

---

## Phase 3: User Story 1 — The app wears one consistent visual identity (Priority: P1) 🎯 MVP

**Goal**: The Obsidian identity is applied and **documented** — a StyleGuide showing the full palette (brand vs. AI clearly separated), type scale, and radius/spacing, with contrast verified.

**Independent Test**: Launch the app → it renders in the Obsidian theme; the StyleGuide displays every token; `contrast.test.ts` passes. No components needed yet.

- [X] T009 [US1] Create `src/styleguide/StyleGuide.tsx` (shell + section layout) and the `src/styleguide/sections/` directory; render `<StyleGuide />` from `src/App.tsx`, replacing the Feature 001 placeholder (drop the now-unused placeholder markup / `App.css` import if appropriate). (FR-008/FR-009; research R7)
- [X] T010 [US1] Update `src/App.test.tsx` — the 001 smoke test asserts the old placeholder text and **will fail** once App renders the StyleGuide; reassert against a stable StyleGuide marker (e.g. a "Design System" heading). (keeps the tree green)
- [X] T011 [P] [US1] Create `src/styleguide/sections/PaletteSection.tsx` — a swatch for every color role; **`brand` (purple) and `ai` (cyan) rendered as separate, labelled roles, with `ai` marked "AI output only"**. (SC-001/SC-007; FR-002)
- [X] T012 [P] [US1] Create `src/styleguide/sections/TypeSection.tsx` — the full type scale in Inter + a JetBrains Mono sample. (SC-001)
- [X] T013 [P] [US1] Create `src/styleguide/sections/ScaleSection.tsx` — radius (5/8/pill) and spacing rhythm. (SC-001)
- [X] T014 [US1] Create `src/styleguide/contrast.ts` (relative-luminance + WCAG ratio helpers) and `src/styleguide/contrast.test.ts` asserting AA for every token pairing per [contracts/tokens.md](contracts/tokens.md) — including the `text-faint` ≤3:1 constraint. (FR-007/SC-003; research R5)

**Checkpoint**: The visual identity exists, is applied, is documented, and contrast is mechanically verified — **MVP delivered**.

---

## Phase 4: User Story 2 — A developer builds screens from an accessible component kit (Priority: P2)

**Goal**: The full 16-primitive vocabulary as themed, accessible React components, each shown in the StyleGuide.

**Dependency**: Requires US1/Foundational tokens (components style from role tokens). Otherwise independently testable: each primitive renders, uses the correct semantic element, and is keyboard-operable.

**Independent Test**: The StyleGuide shows all 16 primitives in their key states; each interactive one is keyboard-operable with a visible focus ring; `*.test.tsx` pass.

### Kit foundation

- [X] T015 [US2] Create `src/components/ui/types.ts` — explicit prop/variant unions per [contracts/components.md](contracts/components.md) — and a tiny `cx` class-join helper. (no `any`)

### Primitives (each task: create `<Name>.tsx` + `<Name>.test.tsx` per the component contract; token-only styling; test asserts render + correct semantic element + a variant)

- [X] T016 [P] [US2] `src/components/ui/Panel.tsx` (+ test) — header/body container, `as` for landmark semantics.
- [X] T017 [P] [US2] `src/components/ui/Button.tsx` (+ test) — native `<button>`; variants primary/secondary/ghost/danger, sizes sm/md; visible focus; **never `ai`**.
- [X] T018 [P] [US2] `src/components/ui/StatCell.tsx` (+ test) — label + big numeric (`font-mono`), optional unit/trend.
- [X] T019 [P] [US2] `src/components/ui/Tag.tsx` (+ test) — pill; tone variants.
- [X] T020 [P] [US2] `src/components/ui/Checklist.tsx` (+ test) — native checkboxes + labels, optional `onToggle`; presentational (no "mark learned" logic).
- [X] T021 [P] [US2] `src/components/ui/Heatmap.tsx` (+ test) — intensity grid from a **static sample**; no data wiring (research R6).
- [X] T022 [P] [US2] `src/components/ui/Stepper.tsx` (+ test) — step row; active uses `brand`.
- [X] T023 [P] [US2] `src/components/ui/Scratchpad.tsx` (+ test) — labeled dashed well wrapping a native `<textarea>` (`surface-sunken`, `font-mono`).
- [X] T024 [P] [US2] `src/components/ui/Card.tsx` (+ test) — flashcard **shell**; renders the `face` prop; **no flip/reveal/timer logic** (Constitution III / research R6).
- [X] T025 [P] [US2] `src/components/ui/Rating.tsx` (+ test) — FSRS-style button row; emits `onRate`; **no scheduling/auto-advance** (Constitution III / research R6).
- [X] T026 [P] [US2] `src/components/ui/Message.tsx` (+ test) — chat line + avatar; **`role:'ai'` uses `--color-ai` (cyan)**, `role:'user'` neutral/brand (FR-002).
- [X] T027 [P] [US2] `src/components/ui/Citation.tsx` (+ test) — `font-mono` source ref; renders `<a>` only when `href` present.
- [X] T028 [P] [US2] `src/components/ui/Callout.tsx` (+ test) — Obsidian callout; variants note/tip/warn/danger/info/**ai** (ai uses cyan).
- [X] T029 [P] [US2] `src/components/ui/Annotation.tsx` (+ test) — inline/margin note in `text-dim`.
- [X] T030 [P] [US2] `src/components/ui/Segmented.tsx` (+ test) — **radiogroup**: arrow-key roving focus, `aria-checked`, Home/End, visible focus. (the kit's a11y exemplar)
- [X] T031 [P] [US2] `src/components/ui/Graph.tsx` (+ test) — SVG dependency graph from a **static sample**; nodes use `domain-*`; not an interactive engine (research R6).

### Kit assembly + showcase

- [X] T032 [US2] Create `src/components/ui/index.ts` — barrel exporting all 16 primitives + their types (the kit's public interface). Depends on T016–T031.
- [X] T033 [P] [US2] `src/styleguide/sections/ComponentsDisplaySection.tsx` — showcase Panel, StatCell, Tag, Citation, Annotation, Callout, Message in key states.
- [X] T034 [P] [US2] `src/styleguide/sections/ComponentsDataSection.tsx` — showcase Checklist, Stepper, Heatmap, Graph, Card in key states.
- [X] T035 [P] [US2] `src/styleguide/sections/ComponentsControlsSection.tsx` — showcase Button, Segmented, Scratchpad, Rating in key states.
- [X] T036 [US2] Wire the three component sections into `src/styleguide/StyleGuide.tsx` after the token sections. (SC-002/FR-011)

**Checkpoint**: All 16 primitives exist, are tested, are accessible, and appear in the StyleGuide. US1 + US2 both demoable.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T037 [P] Verify **no raw color values** in component/section code outside `src/styles/theme.css` (search `src/components` + `src/styleguide` for `#` hex, `rgb(`, `rgba(`, and `hsl(` literals). (SC-006)
- [X] T038 [P] Run `npm run build` — tsc strict + Vite build clean.
- [X] T039 Run `npm run test` (every `*.test.tsx` + `contrast.test.ts` green) **and `npm run lint`** (ESLint clean, incl. jsx-a11y + no-restricted-imports — Constitution quality gate). (M2)
- [ ] T040 Manual walkthrough via `npm run tauri dev`: (a) keyboard-traverse the StyleGuide — every interactive primitive reachable/operable with a visible focus ring (SC-004); (b) dev-tools Network shows **zero** external font/asset requests (SC-005/FR-003); (c) `ai` accent appears only on AI contexts, no brand element uses cyan (SC-007); (d) look is calm Obsidian — no hex grid/scanlines/brackets/boot (FR-010); (e) spot-check reduced-motion + forced-colors; (f) findability — from the StyleGuide alone, locate the right token + component for a sample UI need in under 2 min (SC-008).
- [X] T041 Prepare the end-of-feature walkthrough notes (token mapping, font divergence from the doc, the contrast finding + remedy, the Principle III shells, FR→verification results). (SOP: mandatory walkthrough)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → **Foundational (P2)** → **US1 (P3)** → **US2 (P4)** → **Polish (P5)**.
- **Foundational blocks both stories** — tokens + fonts + base styles must exist first.
- **US2 depends on US1/Foundational tokens** (components style from roles). This is the one inter-story dependency; otherwise US2's primitives are independently testable.

### Within US1

- T009 (StyleGuide shell + App mount) and T010 (fix the 001 test) come first; T011/T012/T013 (sections) are [P]; T014 (contrast) is independent and [P]-eligible once tokens (T006) exist.

### Within US2

- T015 (types + `cx`) first — every primitive imports it.
- T016–T031 (the 16 primitives) are all **[P]** (different files), each depends only on T015 + tokens.
- T032 (barrel) after the primitives. T033–T035 (showcase sections) are [P], depend on the primitives + barrel. T036 wires them in.

### Parallel opportunities

- Setup: T004 is [P].
- US1: T011/T012/T013 together; T014 alongside.
- **US2: T016–T031 — sixteen primitives in parallel** is the big win (16 independent files). Then T033/T034/T035 in parallel.
- Polish: T037/T038 [P].

---

## Parallel Example: US2 primitives

```text
# After T015 (types) + tokens exist, launch the kit in parallel — each is its own file pair:
Task T016: Panel.tsx + Panel.test.tsx
Task T017: Button.tsx + Button.test.tsx
Task T018: StatCell.tsx + StatCell.test.tsx
…
Task T031: Graph.tsx + Graph.test.tsx
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Setup → Foundational → US1. **Stop and validate**: the app wears the Obsidian identity and the StyleGuide documents the tokens with contrast proven. That alone is a shippable, demoable design foundation.

### Incremental delivery

1. Setup + Foundational → identity plumbing ready.
2. US1 → tokens applied + documented + contrast green → **MVP**.
3. US2 → the 16-primitive accessible kit + showcase.
4. Polish → no-hex check, build/test green, manual a11y + local-font + no-HUD walkthrough.

### Notes

- Don't add learning/scheduling logic to Card or Rating — they stay presentational shells (Constitution III / research R6).
- Components reference role tokens only — if you're typing a hex value in a component, stop (SC-006).
- The full keyboard/AT/reduced-motion/forced-colors pass is manual (T040) — jsdom can't verify it.
