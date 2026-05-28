# Contract: Component Primitives

**Feature**: 002-design-system · **Date**: 2026-05-27

The public interface of the component kit (`src/components/ui/`, exported via `index.ts`). Each primitive is **presentational**, styled only from role tokens (no raw hex), and — where interactive — keyboard-operable with a visible focus ring and semantically correct HTML (FR-005/FR-006). Props below are the contract Features 004+ depend on; all variant fields are explicit TS unions (no `any`).

> **Controlled/uncontrolled**: interactive primitives accept an optional `value`+`onChange` (controlled) and also work uncontrolled. None contain business logic, data fetching, or scheduling.

## Containers & display

- **Panel** — `{ title?, headerRight?, footer?, as?: 'section'|'div', children }`. Header strip (`panel-header`) + body (`panel`). `as` lets consumers give it landmark semantics. Non-interactive.
- **StatCell** — `{ label, value, unit?, trend?: 'up'|'down'|'flat' }`. Big numeric (`2xl`, `font-mono`) over a dim label. Display only; long values wrap, don't overflow.
- **Tag** — `{ children, tone?: 'brand'|'neutral'|'success'|'warn'|'danger' }`. Pill (`rounded-full`, `brand-soft` default). Display only.
- **Citation** — `{ source, locator?, href? }`. Inline source reference in `font-mono`; if `href` present, renders an `<a>` (brand) — otherwise plain. For Resource/locator citations later.
- **Annotation** — `{ children, label? }`. Inline/margin note in `text-dim`, small.
- **Callout** — `{ variant: 'note'|'tip'|'warn'|'danger'|'info'|'ai', title?, children }`. Obsidian-style block; left accent + tint from the matching semantic token. **`'ai'` variant uses `--color-ai`** (the only place cyan appears here) — for AI-authored notes.

## Progress & data-viz (static samples in 002)

- **Checklist** — `{ items: {id,label,done}[], onToggle?(id) }`. Each row a native checkbox (`<input type=checkbox>`) + label; keyboard-toggleable, visible focus. Presentational — `onToggle` lets the consumer own state; no "mark learned" logic here.
- **Stepper** — `{ steps: {label, state:'done'|'active'|'todo'}[] }`. Horizontal step row; active uses `brand`. Display only.
- **Heatmap** — `{ data: number[][] | {value:number}[], levels?: number, label? }`. Contribution-style grid; intensity maps to a `brand`/`success` ramp. **Static representative sample** in the StyleGuide; not wired to real data (R6/assumptions).
- **Graph** — `{ nodes: {id,label,domain?}[], edges: {from,to}[] }`. SVG dependency graph; nodes use the `domain-*` cycle. **Static representative sample**; not an interactive graph engine.

## Inputs & actions (interactive)

- **Button** — `{ variant?: 'primary'|'secondary'|'ghost'|'danger', size?: 'sm'|'md', type?, disabled?, onClick, children }`. Renders a native **`<button>`**. `primary` = `brand`; `danger` = `danger`; never `ai`. Visible focus ring; disabled is non-focusable-activatable.
- **Segmented** — `{ options: {value,label}[], value, onChange, ariaLabel }`. Segmented control as a **radiogroup**: arrow-key roving focus, `aria-checked`, Home/End, visible focus. The kit's key a11y exemplar.
- **Scratchpad** — `{ value?, defaultValue?, onChange?, label?, placeholder? }`. Labeled dashed well wrapping a native **`<textarea>`** (`surface-sunken`, `font-mono`). Fully keyboard/AT-native.
- **Rating** — `{ options?: ('again'|'hard'|'good'|'easy')[], onRate?(value), disabled? }`. Row of native buttons (FSRS-style). **Shell only (R6)** — emits `onRate`; performs **no** scheduling, no auto-advance, no reveal. Keyboard-operable.
- **Card** — `{ question, answer?, hint?, face?: 'front'|'back' }`. Flashcard **shell**. Renders the `face` the consumer specifies. **No flip-on-click, no reveal-before-recall, no timer (R6 / Constitution III)** — recall-gating is owned by the SRS feature later. Static front/back shown in the StyleGuide.
- **Message** — `{ role: 'user'|'ai', author?, children }`. Chat line with avatar. **`role:'ai'` styles the message with `--color-ai`** (cyan), `role:'user'` with neutral/brand — the live application of the accent rule (FR-002). Display only.

## Cross-cutting contract (all primitives)

1. **Tokens only** — no literal colors; styling flows through role utilities/variables (SC-006).
2. **Semantic HTML** — interactive elements are the correct native element (`<button>`, `<input>`, `<textarea>`, `<a>`), not clickable `<div>`s (FR-006).
3. **Keyboard + focus** — every interactive primitive is reachable and operable by keyboard with a visible focus indicator (FR-006/SC-004).
4. **Reduced motion** — any transition respects `prefers-reduced-motion` (spec edge case).
5. **Resilient content** — long/empty content wraps or truncates without breaking layout (spec edge case).
6. **Typed** — explicit prop and variant types; no `any` on the public surface.
7. **Shown in the StyleGuide** — every primitive appears in `src/styleguide/` in its primary + key states (SC-002/FR-011).

## Stability

Component names, their semantic element, and the documented prop/variant unions are a **public contract** for Features 004+. Adding a variant/optional prop is additive; renaming a component, changing its semantic element, or removing a variant is breaking.
