# Implementation Plan: Obsidian Design System

**Branch**: `002-tailwind+obsidian-tokens` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-design-system/spec.md`

## Summary

Translate the canonical [CIC-Design-Language-Obsidian.html](../../CIC-Design-Language-Obsidian.html) into a real, reusable styling layer: a Tailwind v4 token theme (charcoal surfaces, purple brand, AI-reserved cyan, Inter + JetBrains Mono, 8px radius, spacing), **self-hosted fonts** (no CDN), the full 16-primitive component vocabulary as accessible React components, and a living **StyleGuide** view that renders everything as the design reference and acceptance surface. Builds on Feature 001's running shell — changes *what the window renders*, not how it launches. No app chrome, routing, data, or AI.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) · React 19 · CSS (Tailwind v4 CSS-first `@theme`)

**Primary Dependencies**: Tailwind CSS v4 + `@tailwindcss/vite` · Fontsource variable font packages (`@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`) — self-hosted · React 19 / Vite 7 (from 001) · Vitest + Testing Library (from 001)

**Storage**: N/A — no persistence. Tokens are CSS; components are presentational.

**Testing**: Vitest — component render/semantic smoke tests for the primitives, plus a **programmatic contrast assertion** over the token pairings backing SC-003. Keyboard/focus assertions where jsdom allows; full keyboard + screen-reader pass is a manual walkthrough step.

**Target Platform**: Windows 11 desktop (the 001 Tauri shell). Theme is OS-agnostic CSS.

**Project Type**: Desktop application frontend (React in the Tauri webview).

**Performance Goals**: No FOUC / no layout shift on font load (variable woff2, `font-display: swap` with metric-compatible fallbacks). StyleGuide renders instantly (static content).

**Constraints**: Fully local — **zero outbound network requests for fonts or any asset** (Constitution Principle II / CLAUDE.md guardrail #1; FR-003). WCAG AA contrast (FR-007/SC-003). Dark-first, but tokens structured so a light theme is addable later without touching components (FR-004).

**Scale/Scope**: 1 token theme · 16 component primitives · 1 StyleGuide view. No business logic.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies to 002? | Status | Notes |
|---|---|---|---|
| **I. Vault is Canonical and Sacred** | No vault access | ✅ PASS (vacuous) | No `.md` writes, no `fs`. Pure frontend styling. |
| **II. AI is Vendor-Agnostic Tutor** | No AI, but materializes the AI-accent rule | ✅ PASS | No `Provider`, no vendor SDK, no network. This feature is the first to encode "cyan = AI output only" as a **structural token** (FR-002) — preparing for AI styling without adding any AI. No model names, no adapters. |
| **III. Preserve Desirable Difficulty** | No learning logic | ✅ PASS | The Card (flashcard) and Rating primitives are **presentational shells only** — they MUST NOT implement reveal-before-recall or auto-grading. Recall-gating behavior is added by the SRS feature that consumes them, never here. Documented in research R6. |
| **IV. Interface-First, Deep Modules (Pocock)** | Component kit is leaf modules | ✅ PASS | Primitives are **leaf** UI modules in `src/components/ui/`, not spine. They wrap no infrastructure → no leaky abstraction. The kit's `index.ts` is a leaf component-library barrel (its public surface), distinct from the spine-file barrel smell the heuristic targets. No `src/ai`, `src/vault`, `src/types` spine dirs are created — none are needed yet. |
| **V. Spec-Driven Development** | Yes | ✅ PASS | Full Phase 1 doc set; git owned by user; end-of-feature walkthrough committed to. |

**Technology constraints**: Tailwind ✅ (added now — locked tech), React + TS strict ✅, Vite ✅, Vitest ✅, Obsidian theme ✅ (this feature *is* the theme). Tailwind **v4** specifically (constitution says "Tailwind", unversioned) — justified in research R1. No deviations.

**Gate result: PASS.** No violations; Complexity Tracking omitted.

## Project Structure

### Documentation (this feature)

```text
specs/002-design-system/
├── spec.md                  # Feature spec (/speckit-specify output)
├── plan.md                  # This file
├── research.md              # Phase 0 — Tailwind v4, font vendoring, token mapping, a11y/contrast
├── data-model.md            # Phase 1 — token inventory + component inventory (conceptual, no data)
├── quickstart.md            # Phase 1 — run + see StyleGuide; add a token/component; verify a11y
├── contracts/
│   ├── tokens.md            # Phase 1 — the token role contract (names, values, usage rules)
│   └── components.md        # Phase 1 — each primitive's prop/variant/state + a11y contract
└── checklists/
    └── requirements.md      # Spec quality checklist (green)
```

### Source Code (repository root)

Feature 001 left `src/` with `main.tsx`, `App.tsx`, `App.test.tsx`, `App.css`. This feature adds the styling layer and the component kit:

```text
src/
├── main.tsx                 # (edit) import the theme CSS + Fontsource fonts here
├── App.tsx                  # (edit) render <StyleGuide /> as the root view
├── styles/
│   ├── theme.css            # @import "tailwindcss"; @theme { …role tokens… } — single source of styling truth
│   └── fonts.ts             # self-hosted Fontsource imports (Inter + JetBrains Mono variable)
├── components/
│   └── ui/                  # the component kit (leaf modules, token-styled, accessible)
│       ├── Panel.tsx        ├── Button.tsx       ├── StatCell.tsx    ├── Tag.tsx
│       ├── Checklist.tsx    ├── Heatmap.tsx      ├── Stepper.tsx     ├── Scratchpad.tsx
│       ├── Card.tsx         ├── Rating.tsx       ├── Message.tsx     ├── Citation.tsx
│       ├── Callout.tsx      ├── Annotation.tsx   ├── Segmented.tsx   ├── Graph.tsx
│       ├── types.ts         # shared variant/prop unions for the kit
│       ├── index.ts         # the kit's public barrel (its interface)
│       └── *.test.tsx       # Vitest render/semantic smoke tests per primitive
└── styleguide/
    ├── StyleGuide.tsx       # the living reference: renders all tokens + every primitive
    ├── sections/            # TokensSection, TypeSection, ComponentsSection… (keeps StyleGuide composable)
    └── contrast.test.ts     # programmatic WCAG AA assertion over token pairings (backs SC-003)
```

**Structure Decision**: The component kit lives in `src/components/ui/` (matches CLAUDE.md's `src/components/` for "new UI"), styled exclusively from `src/styles/theme.css`. The StyleGuide is isolated in `src/styleguide/` because it is a *view* that composes the kit, not part of the kit. No Pocock **spine** directories (`src/ai/`, `src/vault/`, `src/types/`) are created — Principle IV discourages organizational-only empty dirs; the primitives are leaf modules and need none of the spine yet. `App.tsx` mounts `<StyleGuide />` directly (no router — Feature 004), and the StyleGuide is built so it can later become the `/style` route unchanged (FR-009).

## Phase 0 — Research

See [research.md](research.md). Resolves: Tailwind v4 + `@tailwindcss/vite` adoption and CSS-first `@theme` (R1); the design-doc-var → semantic-role token mapping with runtime-themeable CSS variables (R2); **self-hosted font vendoring via Fontsource, deliberately diverging from the design doc's CDN link** (R3); dark-first theming architecture that admits a future light theme without component churn (R4); **accessibility + contrast strategy, including the `--ink-faint` AA finding and its remedy** (R5); the presentational component-kit architecture incl. the Principle III constraint on Card/Rating (R6); StyleGuide-as-root-view (R7); and the test strategy incl. the programmatic contrast assertion (R8). No unresolved `NEEDS CLARIFICATION`.

## Phase 1 — Design & Contracts

- [data-model.md](data-model.md) — the conceptual "model": the full token inventory (role → value, sourced from the design doc) and the 16-primitive component inventory with each one's states. No persisted data.
- [contracts/tokens.md](contracts/tokens.md) — the **token contract**: every role token's name, value, and usage rule, including the non-negotiable brand-purple vs. AI-cyan separation (FR-002) and per-token minimum text-size guidance from the contrast audit (FR-007).
- [contracts/components.md](contracts/components.md) — the **component contract**: each primitive's public props, variants, states, semantic element, and keyboard/focus behavior (FR-005/FR-006). This is the interface Features 004+ consume.
- [quickstart.md](quickstart.md) — run the app → see the StyleGuide; how to add a token or a primitive correctly; how to verify contrast + keyboard a11y.

## Complexity Tracking

No constitution violations — section intentionally empty.
