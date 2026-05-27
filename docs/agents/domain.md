# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

> **Current state (2026-05-26):** Neither `CONTEXT.md` nor `docs/adr/` exists yet. This is fine — per the "proceed silently" rule below, skills won't flag the absence. `/grill-with-docs` creates `CONTEXT.md` on the first design conversation where domain terms get resolved, and `docs/adr/NNNN-*.md` on the first crystallised architectural decision. Don't pre-create either; let them grow lazily as real decisions land.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

CIC is single-context (one Tauri app, one domain):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-<decision>.md
│   └── 0002-<decision>.md
└── src/
```

Multi-context layout (not used here, for reference):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

CIC already has a partial glossary in [CLAUDE.md](../../CLAUDE.md) under "Domain glossary" (Domain / Campaign / Course / Milestone / Session / Note / Card / Source / Bridge / Course Blueprint / Provider / Role) and an authoritative one in [PRD-CIC-Platform.md](../../PRD-CIC-Platform.md) §5 and §11. Treat those as the seed `CONTEXT.md` content when `/grill-with-docs` writes the real file.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
