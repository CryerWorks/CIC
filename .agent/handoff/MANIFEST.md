# Task Manifest

- **Task ID**: `{{task-id}}`
- **Feature**: {{feature-name}}
- **Overview**: {{brief-description}}

## Files to Create
{{#each files-to-create}}
- `{{this}}`
{{/each}}

## Files to Modify
{{#each files-to-modify}}
- `{{this}}`
{{/each}}

## Dependencies
{{#each dependencies}}
- {{this}}
{{/each}}

## Handoff Contents
| File | Purpose |
|------|---------|
| `SPEC.md` | Interface contracts, types, API signatures |
| `PLAN.md` | File-by-file implementation breakdown |
| `TESTS.md` | Test specifications: unit/integration/E2E |
| `QUALITY_GATES.md` | Pass/fail criteria and commands |
