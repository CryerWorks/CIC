# Contract: Design Tokens

**Feature**: 002-design-system · **Date**: 2026-05-27

The token contract is the **styling interface** every component and every later feature consumes. Tokens are declared once in `src/styles/theme.css` via Tailwind v4 `@theme`; each entry emits both a utility and a `:root` CSS variable. **Consumers reference roles, never raw values.**

## Color roles

| Role token | Utility (example) | Value (dark) | Use for | Must NOT be used for |
|---|---|---|---|---|
| `--color-surface` | `bg-surface` | `#1a1a1a` | app background | — |
| `--color-surface-sunken` | `bg-surface-sunken` | `#151515` | inputs, scratchpads, wells | — |
| `--color-panel` | `bg-panel` | `#1e1e1e` | panel/card body | — |
| `--color-panel-header` | `bg-panel-header` | `#222222` | panel header strip | — |
| `--color-panel-raised` | `bg-panel-raised` | `#262626` | hover/raised rows | — |
| `--color-line` | `border-line` | `#2c2c2c` | dividers, default borders | — |
| `--color-line-bright` | `border-line-bright` | `#3a3a3a` | emphasized borders, focus rings (base) | — |
| `--color-brand` | `text-brand`,`bg-brand` | `#8b6cef` | brand, links, active/selected, primary buttons | AI output |
| `--color-brand-dim` | — | `#5b48a0` | pressed/disabled brand | — |
| `--color-brand-soft` | `bg-brand-soft` | `rgba(139,108,239,.14)` | tag/selected backgrounds | — |
| `--color-ai` | `text-ai`,`bg-ai` | `#00bfbc` | **AI-generated output only** | brand, links, generic accent, success |
| `--color-success` | — | `#44cf6e` | success/healthy/live | AI output |
| `--color-warn` | — | `#e0a72e` | attention/today/warning | — |
| `--color-danger` | — | `#fb464c` | destructive/alert/error | — |
| `--color-info` | — | `#4c8dff` | informational/data | AI output |
| `--color-text` | `text-text` | `#dadada` | primary text | — |
| `--color-text-dim` | `text-text-dim` | `#9a9a9a` | secondary/muted text | — |
| `--color-text-faint` | `text-text-faint` | `#666666` | **large/decorative de-emphasis only** | body-size essential text (fails AA — see below) |
| `--color-domain-1…5` | — | `#8b6cef,#4c8dff,#44cf6e,#e0a72e,#fb464c` | per-domain accent cycle | semantic meaning (these are identity, not status) |

### The non-negotiable accent rule (FR-002)

`brand` (purple) and `ai` (cyan) are **distinct, non-interchangeable roles**:
- **Purple = brand**: links, active/selected state, primary actions, focus.
- **Cyan = AI, and ONLY AI**: text/border/accent of machine-generated output (e.g. the `Message` AI role, an `ai` Callout, AI draft markers).
- **Never reverse.** No brand/interactive element may use `--color-ai`; no AI-output surface may use `--color-brand` as its identity. The roles are separate tokens precisely so cyan is never the default accent a developer reaches for. There is no shared "accent" alias.

### Contrast contract (FR-007 / SC-003)

All pairings verified by `src/styleguide/contrast.test.ts` against WCAG AA. Known constraints on `--color-surface` (#1a1a1a):

| Foreground | Ratio | Permitted text use |
|---|---|---|
| `text` #dadada | ~12.5:1 | any |
| `text-dim` #9a9a9a | ~6.2:1 | any |
| `text-faint` #666 | **~3.0:1** | **≥ large/bold or non-text UI only — never body-size essential text** |
| `brand` #8b6cef | ~4.55:1 | links/short emphasis (borderline; not long body copy) |
| `ai` #00bfbc | ~7.6:1 | any (AI contexts) |

If faint-weight text must carry real information at body size, use a compliant variant `--color-text-faint-aa` (~`#8a8a8a`, ≥4.5:1) rather than `text-faint`. The test fails the build if a tracked pairing drops below its threshold.

## Radius

| Token | Utility | Value | Use |
|---|---|---|---|
| `--radius-sm` | `rounded-sm` | `5px` | chips, small controls, code |
| `--radius` (DEFAULT) | `rounded` | `8px` | panels, cards, buttons |
| `--radius-full` | `rounded-full` | `999px` | pills (Tag), avatars |

## Typography

| Token | Utility | Value |
|---|---|---|
| `--font-ui` | `font-ui` | `'Inter Variable', -apple-system, system-ui, sans-serif` |
| `--font-mono` | `font-mono` | `'JetBrains Mono Variable', ui-monospace, monospace` |

**Size scale** (base 13.5px / line-height 1.55), named: `2xs` ~10px · `xs` ~11px · `sm` ~12.5px · `base` 13.5px · `md` ~14px · `lg` ~17px · `xl` ~21px · `2xl` ~27px · `3xl` ~40px. **Weights**: 400/500/600/700/800. UI text uses `font-ui`; code, numeric/data, and locator strings use `font-mono`.

## Spacing

**Retain Tailwind's default spacing scale** (the `--spacing` 0.25rem/4px step — `p-2`, `gap-3`, etc.). The design doc uses an ad-hoc mix of 4–24px paddings that the default 4px-step scale covers; no custom spacing tokens are introduced. If a later layout needs a value off the 4px grid, add a named `--spacing-*` token here rather than a one-off literal.

## Stability

These role names are a **public contract**: Features 004+ build against them. Renaming a role is a breaking change. Adding a role is additive. Values may change (e.g. a light theme adds a value-set) without changing names — that is the whole point of FR-004.
