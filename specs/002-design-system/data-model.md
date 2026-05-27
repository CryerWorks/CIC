# Data Model: Obsidian Design System

**Feature**: 002-design-system · **Date**: 2026-05-27

## No persisted data

This feature introduces **no database, schema, or persisted state**. Its "model" is the static design vocabulary: the **token set** and the **component inventory**. Both are compile-time/CSS artifacts, not runtime data. Documented here because they are the structures the rest of the build depends on.

## Token inventory (role → value)

Sourced from the canonical design doc `:root`. Full names, utilities, and usage rules live in [contracts/tokens.md](contracts/tokens.md). Summary:

| Group | Roles |
|---|---|
| **Surfaces** | `surface` (#1a1a1a), `surface-sunken` (#151515), `panel` (#1e1e1e), `panel-header` (#222), `panel-raised` (#262626) |
| **Lines** | `line` (#2c2c2c), `line-bright` (#3a3a3a) |
| **Brand** | `brand` (#8b6cef), `brand-dim` (#5b48a0), `brand-soft` (rgba 8b6cef/.14) |
| **AI (reserved)** | `ai` (#00bfbc) — **AI output only** |
| **Semantic** | `success` (#44cf6e), `warn` (#e0a72e), `danger` (#fb464c), `info` (#4c8dff) |
| **Text** | `text` (#dadada), `text-dim` (#9a9a9a), `text-faint` (#666 — constrained, see contrast note) |
| **Domain cycle** | `domain-1…5` (#8b6cef, #4c8dff, #44cf6e, #e0a72e, #fb464c) |
| **Radius** | `DEFAULT` 8px, `sm` 5px, `full` 999px (pills) |
| **Type** | families `ui` (Inter), `mono` (JetBrains Mono); size scale 2xs→3xl; weights 400–800 |

**Invariants:**
- `brand` and `ai` are **distinct roles, never aliased** (FR-002). `ai` is consumed only by AI-output surfaces.
- Components reference **roles only** — zero raw hex in component code (SC-006).
- `text-faint` is not for body-size essential text (contrast — see token contract).

## Component inventory (the 16 primitives)

Each is a presentational React component consuming only tokens. States/props are the **component contract** ([contracts/components.md](contracts/components.md)). Inventory:

| # | Primitive | Kind | Interactive? |
|---|---|---|---|
| 1 | Panel | container | no |
| 2 | Button | action | **yes** (button) |
| 3 | StatCell | display | no |
| 4 | Tag | display | no |
| 5 | Checklist | list | **yes** (checkboxes, optional) |
| 6 | Heatmap | data-viz (static sample) | no |
| 7 | Stepper | progress | no |
| 8 | Scratchpad | input shell | **yes** (textarea) |
| 9 | Card | flashcard **shell** | no (no reveal logic — R6) |
| 10 | Rating | rating **shell** | **yes** (buttons; no scheduling — R6) |
| 11 | Message | chat line | no (AI role → `ai` token) |
| 12 | Citation | source ref | no (optional link) |
| 13 | Callout | annotation block | no |
| 14 | Annotation | inline note | no |
| 15 | Segmented | segmented control | **yes** (radiogroup, arrow-nav) |
| 16 | Graph | dependency viz (static sample) | no |

## Validation rules

No external input is validated in this feature (no data, no AI-JSON, no frontmatter). The constitution's "validate via zod" rule applies the moment such input exists — not here. Component props are constrained by the **type system** (explicit variant unions, no `any`), which is the only "validation" surface 002 has.

## State

The only runtime state is local UI display state in the few interactive primitives (e.g. Segmented's selected value if used uncontrolled, Scratchpad's text if uncontrolled). All such primitives also support a **controlled** mode so consumers own state. No global store, no context, no persistence.
